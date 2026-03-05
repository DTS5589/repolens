import type { GitHubRepo, RepoTree } from "@/types/repository"
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

const CACHE_TTL_RATE_LIMIT = 30_000   // 30 seconds
const CACHE_TTL_REPO_META  = 300_000  // 5 minutes
const CACHE_TTL_TREE       = 600_000  // 10 minutes
const CACHE_TTL_FILE       = 600_000  // 10 minutes

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Client-side fetcher that calls proxy API routes instead of GitHub directly.
 * The proxy routes handle authentication — the access token never reaches the browser.
 */
async function proxyFetch<T>(url: string): Promise<T> {
  const response = await fetch(url)

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
}
