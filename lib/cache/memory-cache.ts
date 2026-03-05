/**
 * In-memory cache with TTL and stale-while-revalidate support.
 * Used for transient API response caching (resets on page reload).
 * Separate from the persistent IndexedDB cache in repo-cache.ts.
 */

export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

export interface StaleResult<T> {
  data: T
  isStale: boolean
}

const MAX_ENTRIES = 100

const store = new Map<string, CacheEntry<unknown>>()

/**
 * Evict the oldest entry when the cache exceeds MAX_ENTRIES.
 * Map iteration order is insertion order, so the first key is the oldest.
 */
function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return
  const oldest = store.keys().next().value
  if (oldest !== undefined) {
    store.delete(oldest)
  }
}

/**
 * Get cached data if it is still fresh (within TTL).
 * Returns `null` on miss or if the entry has expired.
 */
export function getCached<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null

  const age = Date.now() - entry.timestamp
  if (age <= entry.ttl) {
    return entry.data as T
  }

  return null
}

/**
 * Get cached data even if stale. Returns the data and whether it is past TTL.
 * Returns `null` only on a complete cache miss (key never set).
 */
export function getStale<T>(key: string): StaleResult<T> | null {
  const entry = store.get(key)
  if (!entry) return null

  const age = Date.now() - entry.timestamp
  return {
    data: entry.data as T,
    isStale: age > entry.ttl,
  }
}

/**
 * Store data in the cache with the given TTL (in milliseconds).
 * Moves the key to the end of insertion order (FIFO eviction: oldest entries are removed first).
 * At MAX_ENTRIES=100, FIFO eviction is sufficient for transient browser API caching.
 */
export function setCache<T>(key: string, data: T, ttl: number): void {
  // Delete first so re-insertion moves the key to the end (most recent)
  store.delete(key)
  store.set(key, { data, timestamp: Date.now(), ttl })
  evictIfNeeded()
}

/** Remove a single cache entry by exact key. */
export function invalidate(key: string): void {
  store.delete(key)
}

/** Remove all cache entries whose key starts with the given prefix. */
export function invalidatePattern(prefix: string): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key)
    }
  }
}

/** Clear the entire cache. */
export function clearCache(): void {
  store.clear()
}
