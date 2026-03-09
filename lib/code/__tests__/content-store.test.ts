import { describe, it, expect } from 'vitest'
import { InMemoryContentStore } from '../content-store'
import {
  createEmptyIndex,
  indexFile,
  batchIndexFiles,
  removeFromIndex,
  type CodeIndex,
} from '../code-index'

// ---------------------------------------------------------------------------
// InMemoryContentStore
// ---------------------------------------------------------------------------

describe('InMemoryContentStore', () => {
  it('constructor with no args creates empty store', () => {
    const store = new InMemoryContentStore()
    expect(store.size).toBe(0)
  })

  it('constructor with initial Map uses the provided data', () => {
    const initial = new Map([['a.ts', 'content-a']])
    const store = new InMemoryContentStore(initial)

    expect(store.size).toBe(1)
    expect(store.getSync('a.ts')).toBe('content-a')
  })

  it('put() stores content, getSync() retrieves it', () => {
    const store = new InMemoryContentStore()
    store.put('src/index.ts', 'export default 42;')

    expect(store.getSync('src/index.ts')).toBe('export default 42;')
  })

  it('get() returns Promise that resolves with content', async () => {
    const store = new InMemoryContentStore()
    store.put('file.ts', 'hello')

    const result = await store.get('file.ts')
    expect(result).toBe('hello')
  })

  it('getSync() returns null for missing path', () => {
    const store = new InMemoryContentStore()
    expect(store.getSync('nonexistent.ts')).toBeNull()
  })

  it('get() resolves to null for missing path', async () => {
    const store = new InMemoryContentStore()
    const result = await store.get('nonexistent.ts')
    expect(result).toBeNull()
  })

  it('getBatch() returns Map with only existing paths', async () => {
    const store = new InMemoryContentStore()
    store.put('a.ts', 'aaa')
    store.put('b.ts', 'bbb')

    const result = await store.getBatch(['a.ts', 'missing.ts', 'b.ts'])

    expect(result.size).toBe(2)
    expect(result.get('a.ts')).toBe('aaa')
    expect(result.get('b.ts')).toBe('bbb')
    expect(result.has('missing.ts')).toBe(false)
  })

  it('putBatch() stores multiple entries', () => {
    const store = new InMemoryContentStore()
    store.putBatch([
      { path: 'x.ts', content: 'x-content' },
      { path: 'y.ts', content: 'y-content' },
    ])

    expect(store.size).toBe(2)
    expect(store.getSync('x.ts')).toBe('x-content')
    expect(store.getSync('y.ts')).toBe('y-content')
  })

  it('has() returns true for stored, false for missing', () => {
    const store = new InMemoryContentStore()
    store.put('exists.ts', 'data')

    expect(store.has('exists.ts')).toBe(true)
    expect(store.has('missing.ts')).toBe(false)
  })

  it('delete() removes content', () => {
    const store = new InMemoryContentStore()
    store.put('temp.ts', 'temporary')
    expect(store.has('temp.ts')).toBe(true)

    store.delete('temp.ts')

    expect(store.has('temp.ts')).toBe(false)
    expect(store.getSync('temp.ts')).toBeNull()
    expect(store.size).toBe(0)
  })

  it('getAllSync() returns copy of all entries', () => {
    const store = new InMemoryContentStore()
    store.put('a.ts', 'aaa')
    store.put('b.ts', 'bbb')

    const all = store.getAllSync()

    expect(all.size).toBe(2)
    expect(all.get('a.ts')).toBe('aaa')

    // Returned map is a copy — mutating it does not affect the store
    all.set('c.ts', 'ccc')
    expect(store.size).toBe(2)
  })

  it('size reflects current entry count', () => {
    const store = new InMemoryContentStore()
    expect(store.size).toBe(0)

    store.put('one.ts', '1')
    expect(store.size).toBe(1)

    store.put('two.ts', '2')
    expect(store.size).toBe(2)

    store.delete('one.ts')
    expect(store.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// CodeIndex Phase 3 dual-write
// ---------------------------------------------------------------------------

describe('CodeIndex Phase 3 dual-write', () => {
  it('createEmptyIndex() creates meta Map and InMemoryContentStore', () => {
    const idx = createEmptyIndex()

    expect(idx.meta).toBeInstanceOf(Map)
    expect(idx.meta!.size).toBe(0)
    expect(idx.contentStore).toBeInstanceOf(InMemoryContentStore)
    expect(idx.contentStore!.size).toBe(0)
  })

  it('indexFile() populates meta and contentStore alongside files', () => {
    let idx = createEmptyIndex()
    idx = indexFile(idx, 'src/app.ts', 'const x = 1;\n', 'typescript')

    expect(idx.files.has('src/app.ts')).toBe(true)
    expect(idx.meta!.has('src/app.ts')).toBe(true)
    expect(idx.contentStore!.has('src/app.ts')).toBe(true)
  })

  it('indexFile() meta entry has correct fields', () => {
    let idx = createEmptyIndex()
    idx = indexFile(idx, 'src/utils/helpers.ts', 'line1\nline2\nline3', 'typescript')

    const meta = idx.meta!.get('src/utils/helpers.ts')
    expect(meta).toBeDefined()
    expect(meta!.path).toBe('src/utils/helpers.ts')
    expect(meta!.name).toBe('helpers.ts')
    expect(meta!.language).toBe('typescript')
    expect(meta!.lineCount).toBe(3)
  })

  it('indexFile() contentStore has the file content', () => {
    const content = 'export function greet() { return "hi"; }'
    let idx = createEmptyIndex()
    idx = indexFile(idx, 'greet.ts', content, 'typescript')

    expect(idx.contentStore!.getSync('greet.ts')).toBe(content)
  })

  it('batchIndexFiles() populates meta and contentStore for all entries', () => {
    const updates = [
      { path: 'a.ts', content: 'const a = 1;', language: 'typescript' },
      { path: 'b.py', content: 'b = 2', language: 'python' },
      { path: 'c.rs', content: 'let c = 3;', language: 'rust' },
    ]

    const idx = batchIndexFiles(createEmptyIndex(), updates)

    expect(idx.meta!.size).toBe(3)
    expect(idx.contentStore!.size).toBe(3)

    for (const u of updates) {
      expect(idx.meta!.has(u.path)).toBe(true)
      expect(idx.contentStore!.getSync(u.path)).toBe(u.content)
    }
  })

  it('removeFromIndex() removes from meta and contentStore', () => {
    let idx = createEmptyIndex()
    idx = indexFile(idx, 'keep.ts', 'keep', 'typescript')
    idx = indexFile(idx, 'remove.ts', 'remove', 'typescript')

    idx = removeFromIndex(idx, 'remove.ts')

    expect(idx.files.has('remove.ts')).toBe(false)
    expect(idx.meta!.has('remove.ts')).toBe(false)
    expect(idx.contentStore!.has('remove.ts')).toBe(false)

    // The other file is still there
    expect(idx.files.has('keep.ts')).toBe(true)
    expect(idx.meta!.has('keep.ts')).toBe(true)
    expect(idx.contentStore!.has('keep.ts')).toBe(true)
  })

  it('contentStore.size always equals totalFiles', () => {
    let idx = createEmptyIndex()
    idx = indexFile(idx, 'a.ts', 'a')
    expect(idx.contentStore!.size).toBe(idx.totalFiles)

    idx = indexFile(idx, 'b.ts', 'b')
    expect(idx.contentStore!.size).toBe(idx.totalFiles)

    idx = removeFromIndex(idx, 'a.ts')
    expect(idx.contentStore!.size).toBe(idx.totalFiles)
  })

  it('meta.size always equals totalFiles', () => {
    let idx = createEmptyIndex()
    idx = indexFile(idx, 'a.ts', 'a')
    expect(idx.meta!.size).toBe(idx.totalFiles)

    idx = batchIndexFiles(idx, [
      { path: 'b.ts', content: 'b' },
      { path: 'c.ts', content: 'c' },
    ])
    expect(idx.meta!.size).toBe(idx.totalFiles)

    idx = removeFromIndex(idx, 'b.ts')
    expect(idx.meta!.size).toBe(idx.totalFiles)
  })

  it('backward compat: indexFile() works on a CodeIndex without meta/contentStore', () => {
    // Simulate a legacy CodeIndex that has no meta/contentStore fields
    const legacyIndex: CodeIndex = {
      files: new Map(),
      totalFiles: 0,
      totalLines: 0,
      isIndexing: false,
      // no meta, no contentStore
    }

    const result = indexFile(legacyIndex, 'legacy.ts', 'const x = 1;\n', 'typescript')

    expect(result.totalFiles).toBe(1)
    expect(result.files.has('legacy.ts')).toBe(true)
    // Phase 3 fields are populated even when starting from a legacy index
    expect(result.meta!.has('legacy.ts')).toBe(true)
    expect(result.contentStore!.has('legacy.ts')).toBe(true)
  })
})
