/**
 * Client-side npm metadata fetcher.
 * Calls the /api/deps proxy route and caches results in memory-cache.
 */

import { getCached, setCache } from '@/lib/cache/memory-cache'
import type { DepsApiResponse, NpmPackageMeta } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60 * 1_000 // 10 minutes
const MAX_BATCH_SIZE = 200

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function cacheKey(packageName: string): string {
  return `deps:${packageName}`
}

// ---------------------------------------------------------------------------
// Fetch logic
// ---------------------------------------------------------------------------

/**
 * Fetch npm metadata for a list of packages via the /api/deps proxy.
 * Results are cached per-package in memory-cache with 10min TTL.
 * Returns a Map keyed by package name; failed packages are omitted.
 */
export async function fetchDependencyMeta(
  packages: string[],
): Promise<Map<string, NpmPackageMeta>> {
  if (packages.length === 0) return new Map()

  const results = new Map<string, NpmPackageMeta>()
  const uncached: string[] = []

  // Check cache first
  for (const name of packages) {
    const cached = getCached<NpmPackageMeta>(cacheKey(name))
    if (cached) {
      results.set(name, cached)
    } else {
      uncached.push(name)
    }
  }

  if (uncached.length === 0) return results

  // Fetch uncached packages in batches to respect API limits
  for (let i = 0; i < uncached.length; i += MAX_BATCH_SIZE) {
    const batch = uncached.slice(i, i + MAX_BATCH_SIZE)

    try {
      const response = await fetch('/api/deps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: batch }),
      })

      if (!response.ok) {
        console.warn(
          `[npm-client] /api/deps returned ${response.status} for batch starting at index ${i}`,
        )
        continue
      }

      const data = (await response.json()) as DepsApiResponse

      // Cache and collect results
      for (const [name, meta] of Object.entries(data.results)) {
        setCache(cacheKey(name), meta, CACHE_TTL_MS)
        results.set(name, meta)
      }

      if (data.errors.length > 0) {
        console.warn('[npm-client] Partial fetch errors:', data.errors)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[npm-client] Failed to fetch batch: ${message}`)
      // Continue with remaining batches — partial results are acceptable
    }
  }

  return results
}
