import type { GitHubRepo, RepoTree, GitHubTag, GitHubBranch, GitHubCommit, GitHubComparison } from "@/types/repository"
import type { BlameData, CommitDetail, CommitFile } from "@/types/git-history"
import {
  getCached,
  getStale,
  setCache,
  clearCache as clearMemoryCache,
  invalidatePattern,
} from "@/lib/cache/memory-cache"

// ---------------------------------------------------------------------------
// TTL constants (milliseconds)
// ---------------------------------------------------------------------------

const CACHE_TTL_RATE_LIMIT  = 30_000   // 30 seconds
const CACHE_TTL_REPO_META  = 300_000  // 5 minutes
const CACHE_TTL_TREE       = 600_000  // 10 minutes
const CACHE_TTL_FILE       = 600_000  // 10 minutes
const CACHE_TTL_TAGS       = 600_000  // 10 minutes
const CACHE_TTL_BRANCHES   = 300_000  // 5 minutes
const CACHE_TTL_COMMITS    = 300_000  // 5 minutes
const CACHE_TTL_COMPARE    = 600_000  // 10 minutes
const CACHE_TTL_BLAME         = 600_000  // 10 minutes
const CACHE_TTL_COMMIT_DETAIL = 600_000  // 10 minutes

// ---------------------------------------------------------------------------
// PAT management — allows the React provider to inject a token
// ---------------------------------------------------------------------------

let _githubPAT: string | null = null

export function setGitHubPAT(token: string | null): void {
  _githubPAT = token
}

export function getGitHubPAT(): string | null {
  return _githubPAT
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build headers for proxy requests, attaching the PAT when available. */
function buildProxyHeaders(): HeadersInit {
  const headers: HeadersInit = {}
  if (_githubPAT) {
    headers['X-GitHub-Token'] = _githubPAT
  }
  return headers
}

// ---------------------------------------------------------------------------
// Direct GitHub API helpers (PAT mode — bypasses proxy routes)
// ---------------------------------------------------------------------------

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql'

/** Endpoint type identifier for URL mapping and response normalization. */
type ProxyEndpoint =
  | 'repo'
  | 'tree'
  | 'file'
  | 'tags'
  | 'branches'
  | 'commits'
  | 'compare'
  | 'commit'
  | 'rate-limit'

interface DirectUrlMapping {
  url: string
  endpoint: ProxyEndpoint
}

/**
 * Convert a proxy API path+params into a direct GitHub API URL.
 * Returns null for unrecognized paths (caller falls through to proxy).
 */
function mapProxyUrlToGitHubApi(proxyUrl: string): DirectUrlMapping | null {
  const parsed = new URL(proxyUrl, 'http://localhost')
  const pathname = parsed.pathname
  const params = parsed.searchParams
  const owner = params.get('owner') ?? ''
  const name = params.get('name') ?? ''
  const e = encodeURIComponent

  if (pathname === '/api/github/repo') {
    return { url: `${GITHUB_API_BASE}/repos/${e(owner)}/${e(name)}`, endpoint: 'repo' }
  }

  if (pathname === '/api/github/tree') {
    const sha = params.get('sha') ?? 'HEAD'
    return {
      url: `${GITHUB_API_BASE}/repos/${e(owner)}/${e(name)}/git/trees/${e(sha)}?recursive=1`,
      endpoint: 'tree',
    }
  }

  if (pathname === '/api/github/file') {
    const branch = params.get('branch') ?? ''
    const path = params.get('path') ?? ''
    return {
      url: `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${path}`,
      endpoint: 'file',
    }
  }

  if (pathname === '/api/github/tags') {
    const qp = new URLSearchParams()
    const perPage = params.get('per_page')
    if (perPage) qp.set('per_page', perPage)
    const qs = qp.toString()
    return {
      url: `${GITHUB_API_BASE}/repos/${e(owner)}/${e(name)}/tags${qs ? `?${qs}` : ''}`,
      endpoint: 'tags',
    }
  }

  if (pathname === '/api/github/branches') {
    const qp = new URLSearchParams()
    const perPage = params.get('per_page')
    if (perPage) qp.set('per_page', perPage)
    const qs = qp.toString()
    return {
      url: `${GITHUB_API_BASE}/repos/${e(owner)}/${e(name)}/branches${qs ? `?${qs}` : ''}`,
      endpoint: 'branches',
    }
  }

  if (pathname === '/api/github/commits') {
    const qp = new URLSearchParams()
    for (const key of ['sha', 'since', 'until', 'per_page', 'path']) {
      const val = params.get(key)
      if (val) qp.set(key, val)
    }
    const qs = qp.toString()
    return {
      url: `${GITHUB_API_BASE}/repos/${e(owner)}/${e(name)}/commits${qs ? `?${qs}` : ''}`,
      endpoint: 'commits',
    }
  }

  if (pathname === '/api/github/compare') {
    const base = e(params.get('base') ?? '')
    const head = e(params.get('head') ?? '')
    return {
      url: `${GITHUB_API_BASE}/repos/${e(owner)}/${e(name)}/compare/${base}...${head}`,
      endpoint: 'compare',
    }
  }

  // /api/github/commit/{sha}?owner=X&name=Y
  const commitMatch = pathname.match(/^\/api\/github\/commit\/(.+)$/)
  if (commitMatch) {
    const sha = commitMatch[1]
    return {
      url: `${GITHUB_API_BASE}/repos/${e(owner)}/${e(name)}/commits/${sha}`,
      endpoint: 'commit',
    }
  }

  if (pathname === '/api/github/rate-limit') {
    return { url: `${GITHUB_API_BASE}/rate_limit`, endpoint: 'rate-limit' }
  }

  return null
}

/**
 * Fetch from the GitHub API directly with PAT authentication.
 * Handles JSON responses and common GitHub error codes.
 */
async function directFetch(url: string, pat: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${pat}`,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const ghMessage = (body as { message?: string }).message
    if (response.status === 404) {
      throw new Error(ghMessage ?? 'Not found. Make sure the repository exists.')
    }
    if (response.status === 403) {
      throw new Error('Rate limit exceeded. Try again later.')
    }
    if (response.status === 422) {
      throw new Error(ghMessage ?? 'Invalid request.')
    }
    throw new Error(ghMessage ?? `Request failed: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Fetch file content from raw.githubusercontent.com with PAT auth.
 * Returns { content: string } to match the proxy response shape.
 */
async function directFetchRawFile(url: string, pat: string): Promise<{ content: string }> {
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${pat}` },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('File not found.')
    }
    throw new Error(`Failed to fetch file: ${response.statusText}`)
  }

  const content = await response.text()
  return { content }
}

// ---------------------------------------------------------------------------
// Response normalization — transform raw GitHub API data to match proxy shapes
// These mirror the transformations in lib/github/fetcher.ts.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function normalizeRepo(data: any): GitHubRepo {
  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
    forks: data.forks_count,
    language: data.language,
    topics: data.topics || [],
    isPrivate: data.private,
    url: data.html_url,
    size: data.size,
    openIssuesCount: data.open_issues_count ?? 0,
    pushedAt: data.pushed_at ?? '',
    license: data.license?.spdx_id ?? null,
  }
}

function normalizeTags(data: any): GitHubTag[] {
  return (data as any[]).map((tag: any) => ({
    name: tag.name as string,
    commitSha: tag.commit.sha as string,
    commitUrl: tag.commit.url as string,
    tarballUrl: (tag.tarball_url as string) ?? '',
    zipballUrl: (tag.zipball_url as string) ?? '',
  }))
}

function normalizeBranches(data: any): GitHubBranch[] {
  return (data as any[]).map((branch: any) => ({
    name: branch.name as string,
    commitSha: branch.commit.sha as string,
    isProtected: (branch.protected as boolean) ?? false,
  }))
}

function normalizeCommits(data: any): GitHubCommit[] {
  return (data as any[]).map((item: any) => {
    const commit = item.commit
    const commitAuthor = commit.author
    const commitCommitter = commit.committer
    const author = item.author
    return {
      sha: item.sha as string,
      message: commit.message as string,
      authorName: commitAuthor.name as string,
      authorEmail: commitAuthor.email as string,
      authorDate: commitAuthor.date as string,
      committerName: commitCommitter.name as string,
      committerDate: commitCommitter.date as string,
      url: item.html_url as string,
      authorLogin: (author?.login as string) ?? null,
      authorAvatarUrl: (author?.avatar_url as string) ?? null,
      parents: ((item.parents ?? []) as any[]).map((p: any) => ({ sha: p.sha as string })),
    }
  })
}

function normalizeCompare(data: any): GitHubComparison {
  return {
    status: data.status as string,
    aheadBy: data.ahead_by as number,
    behindBy: data.behind_by as number,
    totalCommits: data.total_commits as number,
    commits: normalizeCommits(data.commits),
    files: ((data.files ?? []) as any[]).map((file: any) => ({
      filename: file.filename as string,
      status: file.status as string,
      additions: file.additions as number,
      deletions: file.deletions as number,
      changes: file.changes as number,
      patch: file.patch as string | undefined,
    })),
  }
}

function normalizeCommitDetail(data: any): CommitDetail {
  const commit = data.commit
  const commitAuthor = commit.author
  const commitCommitter = commit.committer
  const author = data.author
  const stats = data.stats
  const rawFiles = (data.files ?? []) as any[]
  return {
    sha: data.sha as string,
    message: commit.message as string,
    authorName: commitAuthor.name as string,
    authorEmail: commitAuthor.email as string,
    authorDate: commitAuthor.date as string,
    committerName: commitCommitter.name as string,
    committerDate: commitCommitter.date as string,
    url: data.html_url as string,
    authorLogin: (author?.login as string) ?? null,
    authorAvatarUrl: (author?.avatar_url as string) ?? null,
    parents: ((data.parents ?? []) as any[]).map((p: any) => ({ sha: p.sha as string })),
    stats: {
      additions: stats.additions as number,
      deletions: stats.deletions as number,
      total: stats.total as number,
    },
    files: rawFiles.map((file: any): CommitFile => ({
      filename: file.filename as string,
      status: file.status as CommitFile['status'],
      additions: file.additions as number,
      deletions: file.deletions as number,
      changes: file.changes as number,
      patch: file.patch as string | undefined,
      previousFilename: file.previous_filename as string | undefined,
    })),
  }
}

function normalizeRateLimit(data: any): { limit: number; remaining: number; reset: number; authenticated: boolean } {
  const core = data.rate ?? data.resources?.core
  return {
    limit: (core?.limit as number) ?? 0,
    remaining: (core?.remaining as number) ?? 0,
    reset: (core?.reset as number) ?? 0,
    authenticated: true,
  }
}

/** Apply the appropriate normalization for a given endpoint. */
function normalizeDirectResponse<T>(data: unknown, endpoint: ProxyEndpoint): T {
  switch (endpoint) {
    case 'repo':        return normalizeRepo(data) as T
    case 'tree':        return data as T
    case 'tags':        return normalizeTags(data) as T
    case 'branches':    return normalizeBranches(data) as T
    case 'commits':     return normalizeCommits(data) as T
    case 'compare':     return normalizeCompare(data) as T
    case 'commit':      return normalizeCommitDetail(data) as T
    case 'rate-limit':  return normalizeRateLimit(data) as T
    default:            return data as T
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Blame GraphQL query — duplicated from lib/github/fetcher.ts for client-side use
// ---------------------------------------------------------------------------

const BLAME_QUERY = `
query BlameData($owner: String!, $name: String!, $expression: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expression) {
      ... on Blob {
        byteSize
        isTruncated
        blame(startingLine: 1) {
          ranges {
            startingLine
            endingLine
            age
            commit {
              oid
              abbreviatedOid
              message
              messageHeadline
              committedDate
              url
              author {
                name
                email
                date
                user {
                  login
                  avatarUrl
                }
              }
            }
          }
        }
      }
    }
  }
}
`

interface BlameGraphQLResponse {
  data: {
    repository: {
      object: {
        byteSize: number
        isTruncated: boolean
        blame: {
          ranges: BlameData['ranges']
        }
      } | null
    }
  }
  errors?: Array<{ message: string }>
}

// ---------------------------------------------------------------------------
// Core fetch — proxy or direct depending on PAT availability
// ---------------------------------------------------------------------------

/**
 * Client-side fetcher that calls proxy API routes or GitHub API directly.
 * When a PAT is available, bypasses the proxy to reduce latency.
 * When no PAT is set, falls back to the proxy routes (used by OAuth users).
 */
async function proxyFetch<T>(url: string): Promise<T> {
  if (!url.startsWith('/')) {
    throw new Error('proxyFetch only accepts relative URLs')
  }

  // Direct mode: PAT is available — call GitHub API directly
  const pat = getGitHubPAT()
  if (pat) {
    const mapping = mapProxyUrlToGitHubApi(url)
    if (mapping) {
      if (mapping.endpoint === 'file') {
        return directFetchRawFile(mapping.url, pat) as Promise<T>
      }
      const raw = await directFetch(mapping.url, pat)
      return normalizeDirectResponse<T>(raw, mapping.endpoint)
    }
  }

  // Proxy mode: no PAT or unrecognized path — use proxy routes
  const response = await fetch(url, { headers: buildProxyHeaders() })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const parsed = body as { error?: string | { message?: string } }
    const message =
      typeof parsed.error === 'string'
        ? parsed.error
        : parsed.error?.message ?? `Request failed: ${response.statusText}`
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

/**
 * SWR-style cached fetch: returns fresh data from cache, serves stale data
 * while revalidating in the background, or fetches on a complete miss.
 */
async function cachedProxyFetch<T>(
  cacheKey: string,
  url: string,
  ttl: number,
): Promise<T> {
  // 1. Fresh cache hit — return immediately
  const fresh = getCached<T>(cacheKey)
  if (fresh !== null) return fresh

  // 2. Stale hit — return stale data, revalidate in background
  const stale = getStale<T>(cacheKey)
  if (stale !== null && stale.isStale) {
    // Fire-and-forget background revalidation
    proxyFetch<T>(url)
      .then((data) => setCache(cacheKey, data, ttl))
      .catch((err) => {
        console.warn('[cachedProxyFetch] Background revalidation failed:', cacheKey, err)
      })
    return stale.data
  }

  // 3. Cache miss — fetch, cache, return
  const data = await proxyFetch<T>(url)
  setCache(cacheKey, data, ttl)
  return data
}

// ---------------------------------------------------------------------------
// Public API — proxy fetch functions
// ---------------------------------------------------------------------------

/**
 * Fetch repository metadata through the proxy
 */
export async function fetchRepoViaProxy(
  owner: string,
  name: string,
): Promise<GitHubRepo> {
  const key = `repo:${owner}/${name}`
  const url = `/api/github/repo?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`
  return cachedProxyFetch<GitHubRepo>(key, url, CACHE_TTL_REPO_META)
}

/**
 * Fetch repository file tree through the proxy
 */
export async function fetchTreeViaProxy(
  owner: string,
  name: string,
  sha: string = "HEAD",
): Promise<RepoTree> {
  const key = `tree:${owner}/${name}:${sha}`
  const url = `/api/github/tree?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}&sha=${encodeURIComponent(sha)}`
  return cachedProxyFetch<RepoTree>(key, url, CACHE_TTL_TREE)
}

/**
 * Fetch file content through the proxy
 */
export async function fetchFileViaProxy(
  owner: string,
  name: string,
  branch: string,
  path: string,
): Promise<string> {
  const key = `file:${owner}/${name}:${branch}:${path}`
  const url = `/api/github/file?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`

  // File content returns { content: string } — unwrap after caching the raw response
  const data = await cachedProxyFetch<{ content: string }>(key, url, CACHE_TTL_FILE)
  return data.content
}

/**
 * Fetch rate limit status through the proxy
 */
export async function fetchRateLimitViaProxy(): Promise<{
  limit: number
  remaining: number
  reset: number
  authenticated: boolean
}> {
  const key = 'rate-limit'
  const url = '/api/github/rate-limit'
  return cachedProxyFetch(key, url, CACHE_TTL_RATE_LIMIT)
}

// ---------------------------------------------------------------------------
// Tags, branches, commits, compare — proxy fetch functions
// ---------------------------------------------------------------------------

/**
 * Fetch repository tags through the proxy.
 */
export async function fetchTagsViaProxy(
  owner: string,
  name: string,
  perPage?: number,
): Promise<GitHubTag[]> {
  const key = `tags:${owner}/${name}`
  const params = new URLSearchParams({
    owner,
    name,
  })
  if (perPage !== undefined) params.set('per_page', String(perPage))
  const url = `/api/github/tags?${params.toString()}`
  return cachedProxyFetch<GitHubTag[]>(key, url, CACHE_TTL_TAGS)
}

/**
 * Fetch repository branches through the proxy.
 */
export async function fetchBranchesViaProxy(
  owner: string,
  name: string,
  perPage?: number,
): Promise<GitHubBranch[]> {
  const key = `branches:${owner}/${name}`
  const params = new URLSearchParams({
    owner,
    name,
  })
  if (perPage !== undefined) params.set('per_page', String(perPage))
  const url = `/api/github/branches?${params.toString()}`
  return cachedProxyFetch<GitHubBranch[]>(key, url, CACHE_TTL_BRANCHES)
}

/**
 * Fetch repository commits through the proxy.
 */
export async function fetchCommitsViaProxy(
  owner: string,
  name: string,
  opts?: { sha?: string; since?: string; until?: string; perPage?: number },
): Promise<GitHubCommit[]> {
  const params = new URLSearchParams({ owner, name })
  if (opts?.sha) params.set('sha', opts.sha)
  if (opts?.since) params.set('since', opts.since)
  if (opts?.until) params.set('until', opts.until)
  if (opts?.perPage !== undefined) params.set('per_page', String(opts.perPage))

  const key = `commits:${owner}/${name}:${params.toString()}`
  const url = `/api/github/commits?${params.toString()}`
  return cachedProxyFetch<GitHubCommit[]>(key, url, CACHE_TTL_COMMITS)
}

/**
 * Fetch comparison between two refs through the proxy.
 */
export async function fetchCompareViaProxy(
  owner: string,
  name: string,
  base: string,
  head: string,
): Promise<GitHubComparison> {
  const key = `compare:${owner}/${name}:${base}...${head}`
  const params = new URLSearchParams({ owner, name, base, head })
  const url = `/api/github/compare?${params.toString()}`
  return cachedProxyFetch<GitHubComparison>(key, url, CACHE_TTL_COMPARE)
}

// ---------------------------------------------------------------------------
// Git History & Blame — proxy fetch functions
// ---------------------------------------------------------------------------

/**
 * Fetch blame data through the proxy (POST — requires auth).
 * Uses manual cache + POST since cachedProxyFetch is GET-only.
 */
export async function fetchBlameViaProxy(
  owner: string,
  name: string,
  ref: string,
  path: string,
): Promise<BlameData> {
  const safePath = path.replace(/:/g, '%3A')
  const key = `blame:${owner}/${name}:${ref}:${safePath}`

  // Check fresh cache
  const fresh = getCached<BlameData>(key)
  if (fresh !== null) return fresh

  // Check stale cache (SWR)
  const stale = getStale<BlameData>(key)
  if (stale !== null && stale.isStale) {
    // Fire-and-forget background revalidation
    fetchBlameFromApi(owner, name, ref, path)
      .then((data) => setCache(key, data, CACHE_TTL_BLAME))
      .catch((err) => {
        console.warn('[fetchBlameViaProxy] Background revalidation failed:', key, err)
      })
    return stale.data
  }

  // Cache miss — fetch, cache, return
  const data = await fetchBlameFromApi(owner, name, ref, path)
  setCache(key, data, CACHE_TTL_BLAME)
  return data
}

/** Internal helper: fetch blame data via proxy or direct GraphQL. */
async function fetchBlameFromApi(
  owner: string,
  name: string,
  ref: string,
  path: string,
): Promise<BlameData> {
  // Direct mode: PAT available — call GitHub GraphQL API directly
  const pat = getGitHubPAT()
  if (pat) {
    const expression = `${ref}:${path}`
    const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: BLAME_QUERY,
        variables: { owner, name, expression },
      }),
    })

    if (response.status === 401) {
      throw new Error('Authentication required to fetch blame data')
    }
    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`)
    }

    const body = (await response.json()) as BlameGraphQLResponse
    if (body.errors && body.errors.length > 0) {
      throw new Error(body.errors[0].message)
    }

    const blob = body.data.repository.object
    if (!blob) {
      throw new Error(`File not found: ${path}`)
    }

    return {
      ranges: blob.blame.ranges,
      isTruncated: blob.isTruncated,
      byteSize: blob.byteSize,
    }
  }

  // Proxy mode: no PAT — POST to proxy route
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...buildProxyHeaders() }
  const response = await fetch('/api/github/blame', {
    method: 'POST',
    headers,
    body: JSON.stringify({ owner, name, ref, path }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const parsed = body as { error?: string | { message?: string } }
    const message =
      typeof parsed.error === 'string'
        ? parsed.error
        : parsed.error?.message ?? `Request failed: ${response.statusText}`
    throw new Error(message)
  }

  return response.json() as Promise<BlameData>
}

/**
 * Fetch commits for a specific file through the proxy.
 */
export async function fetchFileCommitsViaProxy(
  owner: string,
  name: string,
  path: string,
  opts?: { perPage?: number },
): Promise<GitHubCommit[]> {
  const params = new URLSearchParams({ owner, name, path })
  if (opts?.perPage !== undefined) params.set('per_page', String(opts.perPage))

  const key = `file-commits:${owner}/${name}:${path}:${params.toString()}`
  const url = `/api/github/commits?${params.toString()}`
  return cachedProxyFetch<GitHubCommit[]>(key, url, CACHE_TTL_COMMITS)
}

/**
 * Fetch detailed commit information through the proxy.
 */
export async function fetchCommitDetailViaProxy(
  owner: string,
  name: string,
  sha: string,
): Promise<CommitDetail> {
  const key = `commit-detail:${owner}/${name}:${sha}`
  const url = `/api/github/commit/${encodeURIComponent(sha)}?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`
  return cachedProxyFetch<CommitDetail>(key, url, CACHE_TTL_COMMIT_DETAIL)
}

// ---------------------------------------------------------------------------
// Cache management — exported for manual invalidation
// ---------------------------------------------------------------------------

/** Clear all cached GitHub API responses. */
export function clearGitHubCache(): void {
  clearMemoryCache()
}

/** Invalidate all cached data for a specific repository. */
export function invalidateRepoCache(owner: string, repo: string): void {
  const prefix = `repo:${owner}/${repo}`
  invalidatePattern(prefix)
  invalidatePattern(`tree:${owner}/${repo}`)
  invalidatePattern(`file:${owner}/${repo}`)
  invalidatePattern(`tags:${owner}/${repo}`)
  invalidatePattern(`branches:${owner}/${repo}`)
  invalidatePattern(`commits:${owner}/${repo}`)
  invalidatePattern(`compare:${owner}/${repo}`)
  invalidatePattern(`blame:${owner}/${repo}`)
  invalidatePattern(`commit-detail:${owner}/${repo}`)
  invalidatePattern(`file-commits:${owner}/${repo}`)
}
