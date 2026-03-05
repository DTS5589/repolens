// IndexedDB cache for repository data — avoids re-fetching file contents
// when the HEAD commit hasn't changed.

import type { FileNode } from '@/types/repository'

const DB_NAME = 'repolens-cache'
const STORE_NAME = 'repos'
const TOURS_STORE_NAME = 'tours'
const DB_VERSION = 2
const MAX_REPOS = 5

export interface CachedRepo {
  /** Primary key: `${owner}/${repo}` */
  key: string
  owner: string
  repo: string
  /** Tree SHA — used for freshness comparison. */
  sha: string
  /** Unix-ms timestamp for LRU eviction. */
  timestamp: number
  /** Indexed file contents. */
  files: Array<{ path: string; content: string; language?: string }>
  /** Serialized file tree for potential offline use. */
  tree: FileNode[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(TOURS_STORE_NAME)) {
        const tourStore = db.createObjectStore(TOURS_STORE_NAME, { keyPath: 'id' })
        tourStore.createIndex('repoKey', 'repoKey', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Run an LRU eviction pass: keep only the MAX_REPOS most-recent entries. */
async function evictLRU(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const allReq = store.getAll()

    allReq.onsuccess = () => {
      const records: CachedRepo[] = allReq.result ?? []
      if (records.length <= MAX_REPOS) {
        resolve()
        return
      }

      // Sort ascending by timestamp — oldest first
      records.sort((a, b) => a.timestamp - b.timestamp)
      const toRemove = records.slice(0, records.length - MAX_REPOS)

      for (const record of toRemove) {
        store.delete(record.key)
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    }

    allReq.onerror = () => resolve()
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Retrieve a cached repo record, or `null` if not found / DB unavailable. */
export async function getCachedRepo(
  owner: string,
  repo: string,
): Promise<CachedRepo | null> {
  try {
    const db = await openDB()
    const entry: CachedRepo | null = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(`${owner}/${repo}`)

      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })

    // Touch timestamp so LRU eviction keeps frequently-accessed repos
    if (entry) {
      entry.timestamp = Date.now()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(entry)
    }

    return entry
  } catch {
    return null
  }
}

/** Persist indexed file data for a repo, then run LRU eviction. */
export async function setCachedRepo(
  owner: string,
  repo: string,
  sha: string,
  files: Array<{ path: string; content: string; language?: string }>,
  tree: FileNode[],
): Promise<void> {
  try {
    const db = await openDB()
    const key = `${owner}/${repo}`
    const record: CachedRepo = {
      key,
      owner,
      repo,
      sha,
      timestamp: Date.now(),
      files,
      tree,
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(record)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    await evictLRU(db)
  } catch {
    // Cache write failure is non-critical — silently ignore.
  }
}

/** Remove a single repo from the cache. */
export async function clearCachedRepo(
  owner: string,
  repo: string,
): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(`${owner}/${repo}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Silently ignore.
  }
}

/** Clear all cached repos. */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Silently ignore.
  }
}
