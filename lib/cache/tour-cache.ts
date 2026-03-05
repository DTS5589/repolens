// IndexedDB CRUD for tour data — follows the repo-cache.ts pattern.

import type { Tour } from '@/types/tours'

const DB_NAME = 'repolens-cache'
const TOURS_STORE = 'tours'
const DB_VERSION = 2

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('repos')) {
        db.createObjectStore('repos', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(TOURS_STORE)) {
        const tourStore = db.createObjectStore(TOURS_STORE, { keyPath: 'id' })
        tourStore.createIndex('repoKey', 'repoKey', { unique: false })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // If another tab upgrades the DB, close and re-open on next access.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  })
}

/** Cached DB connection — opened once, reused for all operations. */
let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDB().catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Reset the cached DB connection. Exported for tests only. */
export function _resetDBConnection(): void {
  dbPromise = null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Retrieve all tours for a given repository, sorted by updatedAt descending. */
export async function getToursByRepo(repoKey: string): Promise<Tour[]> {
  try {
    const db = await getDB()
    const tx = db.transaction(TOURS_STORE, 'readonly')
    const store = tx.objectStore(TOURS_STORE)
    const index = store.index('repoKey')
    const tours: Tour[] = await wrapRequest(index.getAll(repoKey))

    tours.sort((a, b) => b.updatedAt - a.updatedAt)
    return tours
  } catch {
    return []
  }
}

/** Retrieve a single tour by id, or `null` if not found. */
export async function getTour(id: string): Promise<Tour | null> {
  try {
    const db = await getDB()
    const tx = db.transaction(TOURS_STORE, 'readonly')
    const store = tx.objectStore(TOURS_STORE)
    const result = await wrapRequest(store.get(id))
    return result ?? null
  } catch {
    return null
  }
}

/** Persist (upsert) a tour record. Automatically updates `updatedAt`. */
export async function saveTour(tour: Tour): Promise<void> {
  try {
    const db = await getDB()
    const record: Tour = { ...tour, updatedAt: Date.now() }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TOURS_STORE, 'readwrite')
      const store = tx.objectStore(TOURS_STORE)
      store.put(record)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Cache write failure is non-critical — silently ignore.
  }
}

/** Delete a single tour by id. */
export async function deleteTour(id: string): Promise<void> {
  try {
    const db = await getDB()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(TOURS_STORE, 'readwrite')
      tx.objectStore(TOURS_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Silently ignore.
  }
}

/** Delete all tours for a given repository. */
export async function deleteToursForRepo(repoKey: string): Promise<void> {
  try {
    const db = await getDB()
    const tx = db.transaction(TOURS_STORE, 'readwrite')
    const store = tx.objectStore(TOURS_STORE)
    const index = store.index('repoKey')
    const keys = await wrapRequest(index.getAllKeys(repoKey))

    for (const key of keys) {
      store.delete(key)
    }

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Silently ignore.
  }
}
