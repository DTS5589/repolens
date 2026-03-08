// Zipball API — bulk-download all repo files in a single request via GitHub's zipball endpoint.

import { unzip, strFromU8 } from 'fflate'

/** Extensions considered indexable for code search and AI context. */
export const INDEXABLE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'cs', 'cpp', 'c', 'h', 'hpp', 'php',
  'vue', 'svelte', 'html', 'css', 'scss', 'sass',
  'json', 'yaml', 'yml', 'md', 'mdx', 'sql', 'graphql',
  'sh', 'bash', 'zsh', 'dockerfile',
])

/**
 * Wrap fflate's callback-based `unzip()` in a Promise.
 * The async API auto-spawns Web Workers for parallel decompression.
 */
function unzipAsync(
  data: Uint8Array,
  filter?: (file: { name: string; originalSize: number }) => boolean,
): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, filter ? { filter } : {}, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

/** Maximum file size (in bytes) that we'll index. */
const MAX_FILE_SIZE = 500_000

/**
 * Check whether a file should be indexed based on its extension and size.
 *
 * The `name` parameter can be either a bare filename (`"index.ts"`)
 * or a full path (`"src/utils/index.ts"`) — the extension is extracted
 * from the last segment after the final dot.
 */
export function isFileIndexable(name: string, size: number): boolean {
  if (size > MAX_FILE_SIZE) return false
  const ext = name.split('/').pop()?.split('.').pop()?.toLowerCase()
  return ext ? INDEXABLE_EXTENSIONS.has(ext) : false
}

interface ZipballOptions {
  signal?: AbortSignal
  token?: string
}

/**
 * Fetch an entire repository as a zipball and extract indexable file contents.
 *
 * GitHub returns the archive from `codeload.github.com` via a 302 redirect.
 * The zip contains a single top-level directory `{owner}-{repo}-{sha}/`
 * that is stripped when building the returned path→content map.
 *
 * @returns Map of relative file path → file content string (only indexable files).
 */
export async function fetchRepoZipball(
  owner: string,
  repo: string,
  ref: string,
  options: ZipballOptions = {},
): Promise<Map<string, string>> {
  // Proxy through our own API route to avoid CORS issues.
  // The proxy extracts the auth token from the session cookie server-side.
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (options.token) {
    headers['X-GitHub-Token'] = options.token
  }

  const response = await fetch('/api/github/zipball', {
    method: 'POST',
    headers,
    body: JSON.stringify({ owner, repo, ref }),
    signal: options.signal,
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Repository not found or zipball unavailable')
    }
    if (response.status === 403) {
      throw new Error('Rate limit exceeded or repository is private')
    }
    throw new Error(`Zipball download failed: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)

  // Use fflate's async unzip with a filter that skips non-indexable files
  // BEFORE decompression — this avoids wasting CPU on files we'd discard anyway.
  const extracted = await unzipAsync(data, (file) => {
    // Skip directory entries (paths ending in /)
    if (file.name.endsWith('/')) return false

    // Strip root prefix and check extension
    const slashIndex = file.name.indexOf('/')
    if (slashIndex === -1) return false

    const relativePath = file.name.substring(slashIndex + 1)
    if (!relativePath) return false

    const ext = relativePath.split('/').pop()?.split('.').pop()?.toLowerCase()
    return ext ? INDEXABLE_EXTENSIONS.has(ext) : false
  })

  const files = new Map<string, string>()
  const MAX_TOTAL_EXTRACTED_SIZE = 200_000_000 // 200 MB cumulative limit
  let totalExtracted = 0

  // GitHub zipball wraps everything in a top-level directory: {owner}-{repo}-{sha}/
  // We strip this prefix so paths are relative to the repo root.
  for (const [zipPath, rawContent] of Object.entries(extracted)) {
    const slashIndex = zipPath.indexOf('/')
    if (slashIndex === -1) continue

    const relativePath = zipPath.substring(slashIndex + 1)
    if (!relativePath) continue

    const content = strFromU8(rawContent)

    // Skip files that exceed the per-file size limit
    if (content.length > MAX_FILE_SIZE) continue

    totalExtracted += content.length
    if (totalExtracted > MAX_TOTAL_EXTRACTED_SIZE) {
      console.warn(`Zipball extraction exceeded ${MAX_TOTAL_EXTRACTED_SIZE} bytes — aborting remaining files`)
      return files
    }

    files.set(relativePath, content)
  }

  return files
}
