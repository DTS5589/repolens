// Content store abstraction for Phase 3 tiered repo loading.
// Wave 1: InMemoryContentStore only. Wave 2 adds IDBContentStore.

/**
 * Metadata-only file record — no content field.
 * Stays in heap for fast metadata access (search, UI, AI).
 */
export interface CodeIndexMeta {
  path: string
  name: string
  language?: string
  lineCount: number
}

/**
 * Abstraction for storing and retrieving file content.
 * InMemoryContentStore (Wave 1): sync, zero-overhead.
 * IDBContentStore (Wave 2): async, IndexedDB-backed.
 */
export interface ContentStore {
  /** Get file content by path. Always resolves for in-memory store. */
  get(path: string): Promise<string | null>

  /**
   * Synchronous get — only works for InMemoryContentStore. Returns null for IDB stores.
   * Consumers that MUST be sync (searchIndex, getFileLines) use this.
   */
  getSync(path: string): string | null

  /** Get multiple files' content in a single operation. */
  getBatch(paths: string[]): Promise<Map<string, string>>

  /** Store a single file's content. */
  put(path: string, content: string): void

  /** Store multiple files' content. */
  putBatch(entries: Array<{ path: string; content: string }>): void

  /** Check if content exists for a path (sync — based on metadata). */
  has(path: string): boolean

  /** Remove content for a path. */
  delete(path: string): void

  /** Number of stored files. */
  readonly size: number
}

/**
 * In-memory content store — wraps a simple Map<string, string>.
 * Zero overhead over the current approach. All operations are synchronous.
 */
export class InMemoryContentStore implements ContentStore {
  private store: Map<string, string>

  constructor(initial?: Map<string, string>) {
    this.store = initial ? new Map(initial) : new Map()
  }

  get(path: string): Promise<string | null> {
    return Promise.resolve(this.store.get(path) ?? null)
  }

  getSync(path: string): string | null {
    return this.store.get(path) ?? null
  }

  getBatch(paths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    for (const p of paths) {
      const content = this.store.get(p)
      if (content !== undefined) result.set(p, content)
    }
    return Promise.resolve(result)
  }

  put(path: string, content: string): void {
    this.store.set(path, content)
  }

  putBatch(entries: Array<{ path: string; content: string }>): void {
    for (const { path, content } of entries) {
      this.store.set(path, content)
    }
  }

  has(path: string): boolean {
    return this.store.has(path)
  }

  delete(path: string): void {
    this.store.delete(path)
  }

  getAllSync(): Map<string, string> {
    return new Map(this.store)
  }

  get size(): number {
    return this.store.size
  }
}

// IDB database for runtime content storage (separate from repolens-cache)
const IDB_CONTENT_DB = 'repolens-content'
const IDB_CONTENT_STORE = 'files'
const IDB_CONTENT_VERSION = 1

/**
 * IndexedDB-backed content store for medium+ repos.
 * Stores per-file content in IDB to reduce heap memory.
 *
 * Key format: `{repoKey}:{path}` where repoKey = `owner/repo`
 *
 * NOTE: In Wave 2, this is populated alongside the `files` Map in CodeIndex
 * (dual-write). Consumers don't read from IDB yet — that's Wave 3.
 */
export class IDBContentStore implements ContentStore {
  private repoKey: string
  private paths: Set<string> = new Set()
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(repoKey: string) {
    this.repoKey = repoKey
  }

  private openDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_CONTENT_DB, IDB_CONTENT_VERSION)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(IDB_CONTENT_STORE)) {
            db.createObjectStore(IDB_CONTENT_STORE)
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return this.dbPromise
  }

  private idbKey(path: string): string {
    return `${this.repoKey}:${path}`
  }

  async get(path: string): Promise<string | null> {
    try {
      const db = await this.openDB()
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_CONTENT_STORE, 'readonly')
        const store = tx.objectStore(IDB_CONTENT_STORE)
        const req = store.get(this.idbKey(path))
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  getSync(_path: string): string | null {
    return null
  }

  async getBatch(paths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    try {
      const db = await this.openDB()
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_CONTENT_STORE, 'readonly')
        const store = tx.objectStore(IDB_CONTENT_STORE)
        let remaining = paths.length
        if (remaining === 0) {
          resolve(result)
          return
        }

        for (const p of paths) {
          const req = store.get(this.idbKey(p))
          req.onsuccess = () => {
            if (req.result != null) result.set(p, req.result)
            if (--remaining === 0) resolve(result)
          }
          req.onerror = () => {
            if (--remaining === 0) resolve(result)
          }
        }
      })
    } catch {
      return result
    }
  }

  put(path: string, content: string): void {
    this.paths.add(path)
    this.openDB()
      .then((db) => {
        const tx = db.transaction(IDB_CONTENT_STORE, 'readwrite')
        tx.objectStore(IDB_CONTENT_STORE).put(content, this.idbKey(path))
      })
      .catch(() => {
        /* non-critical */
      })
  }

  putBatch(entries: Array<{ path: string; content: string }>): void {
    for (const { path } of entries) this.paths.add(path)
    this.openDB()
      .then((db) => {
        const tx = db.transaction(IDB_CONTENT_STORE, 'readwrite')
        const store = tx.objectStore(IDB_CONTENT_STORE)
        for (const { path, content } of entries) {
          store.put(content, this.idbKey(path))
        }
      })
      .catch(() => {
        /* non-critical */
      })
  }

  has(path: string): boolean {
    return this.paths.has(path)
  }

  delete(path: string): void {
    this.paths.delete(path)
    this.openDB()
      .then((db) => {
        const tx = db.transaction(IDB_CONTENT_STORE, 'readwrite')
        tx.objectStore(IDB_CONTENT_STORE).delete(this.idbKey(path))
      })
      .catch(() => {
        /* non-critical */
      })
  }

  getAllSync(): Map<string, string> {
    throw new Error(
      'IDBContentStore does not support synchronous getAllSync(). Use getBatch() instead.'
    )
  }

  get size(): number {
    return this.paths.size
  }

  /** Clear all content for this repo from IDB. */
  async clear(): Promise<void> {
    try {
      const db = await this.openDB()
      const tx = db.transaction(IDB_CONTENT_STORE, 'readwrite')
      const store = tx.objectStore(IDB_CONTENT_STORE)
      for (const path of this.paths) {
        store.delete(this.idbKey(path))
      }
      this.paths.clear()
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      })
    } catch {
      /* non-critical */
    }
  }

  /** Reset cached DB connection (for testing). */
  _resetDBConnection(): void {
    this.dbPromise = null
  }
}
