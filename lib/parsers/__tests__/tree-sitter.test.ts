import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- Mock web-tree-sitter ----------

const mockParse = vi.fn()
const mockSetLanguage = vi.fn()
const mockParserDelete = vi.fn()
const mockLanguageLoad = vi.fn()
const mockMatches = vi.fn()
const mockCaptures = vi.fn()
const mockQueryDelete = vi.fn()

vi.mock('web-tree-sitter', () => {
  class FakeParser {
    static init = vi.fn().mockResolvedValue(undefined)
    parse = mockParse
    setLanguage = mockSetLanguage
    delete = mockParserDelete
  }

  class FakeQuery {
    matches = mockMatches
    captures = mockCaptures
    delete = mockQueryDelete
  }

  return {
    default: undefined,
    Parser: FakeParser,
    Language: { load: mockLanguageLoad },
    Query: FakeQuery,
  }
})

// Import after mock
import {
  initTreeSitter,
  getLanguageForFile,
  getSupportedLanguages,
  isLanguageSupported,
  loadLanguage,
  parseFile,
  queryTree,
  queryCapturesByName,
  detectLanguagesInIndex,
  preloadLanguages,
  resetTreeSitter,
} from '@/lib/parsers/tree-sitter'

// ---------- Helpers ----------

const fakeLang = { id: 'fake-language' }
const fakeTree = {
  rootNode: { type: 'program', children: [] },
  delete: vi.fn(),
}

beforeEach(() => {
  resetTreeSitter()
  vi.clearAllMocks()
  mockLanguageLoad.mockResolvedValue(fakeLang)
  mockParse.mockReturnValue(fakeTree)
})

// ============================================================
// Synchronous Functions
// ============================================================

describe('getLanguageForFile', () => {
  it.each([
    // JavaScript family
    { path: 'index.js', expected: 'javascript' },
    { path: 'app.jsx', expected: 'javascript' },
    { path: 'utils.mjs', expected: 'javascript' },
    { path: 'config.cjs', expected: 'javascript' },
    // TypeScript family
    { path: 'main.ts', expected: 'typescript' },
    { path: 'types.mts', expected: 'typescript' },
    { path: 'common.cts', expected: 'typescript' },
    { path: 'App.tsx', expected: 'tsx' },
    // Python
    { path: 'script.py', expected: 'python' },
    { path: 'gui.pyw', expected: 'python' },
    { path: 'stubs.pyi', expected: 'python' },
    // Other languages
    { path: 'Main.java', expected: 'java' },
    { path: 'main.go', expected: 'go' },
    { path: 'lib.rs', expected: 'rust' },
    { path: 'util.c', expected: 'c' },
    { path: 'header.h', expected: 'c' },
    { path: 'main.cpp', expected: 'cpp' },
    { path: 'alt.cc', expected: 'cpp' },
    { path: 'other.cxx', expected: 'cpp' },
    { path: 'inc.hpp', expected: 'cpp' },
    { path: 'Program.cs', expected: 'csharp' },
    { path: 'app.rb', expected: 'ruby' },
    { path: 'Rakefile.rake', expected: 'ruby' },
    { path: 'index.php', expected: 'php' },
    { path: 'App.swift', expected: 'swift' },
    { path: 'Main.kt', expected: 'kotlin' },
    { path: 'build.kts', expected: 'kotlin' },
  ])('maps "$path" → $expected', ({ path, expected }) => {
    expect(getLanguageForFile(path)).toBe(expected)
  })

  it.each(['.txt', '.md', '.yaml', '.json', '.xml', '.svg', '.css'])(
    'returns undefined for unsupported extension %s',
    (ext) => {
      expect(getLanguageForFile(`file${ext}`)).toBeUndefined()
    },
  )

  it('handles nested paths', () => {
    expect(getLanguageForFile('src/lib/utils.ts')).toBe('typescript')
  })

  it('is case-insensitive for extensions', () => {
    expect(getLanguageForFile('App.TSX')).toBe('tsx')
    expect(getLanguageForFile('Main.JAVA')).toBe('java')
  })

  it('returns undefined for files with no extension', () => {
    expect(getLanguageForFile('Makefile')).toBeUndefined()
  })
})

describe('getSupportedLanguages', () => {
  it('returns all 14 supported languages', () => {
    const languages = getSupportedLanguages()
    expect(languages).toHaveLength(14)
  })

  it('includes expected languages', () => {
    const languages = getSupportedLanguages()
    const expected = [
      'javascript',
      'typescript',
      'tsx',
      'python',
      'java',
      'go',
      'rust',
      'c',
      'cpp',
      'csharp',
      'ruby',
      'php',
      'swift',
      'kotlin',
    ]
    for (const lang of expected) {
      expect(languages).toContain(lang)
    }
  })

  it('returns a fresh array on each call', () => {
    const a = getSupportedLanguages()
    const b = getSupportedLanguages()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('isLanguageSupported', () => {
  it('returns true for known languages', () => {
    expect(isLanguageSupported('typescript')).toBe(true)
    expect(isLanguageSupported('python')).toBe(true)
    expect(isLanguageSupported('rust')).toBe(true)
  })

  it('returns false for unknown languages', () => {
    expect(isLanguageSupported('haskell')).toBe(false)
    expect(isLanguageSupported('lua')).toBe(false)
    expect(isLanguageSupported('')).toBe(false)
  })
})

describe('detectLanguagesInIndex', () => {
  it('detects languages from file paths', () => {
    const paths = ['src/index.ts', 'lib/utils.py', 'main.go', 'README.md']
    const result = detectLanguagesInIndex(paths)
    expect(result).toEqual(new Set(['typescript', 'python', 'go']))
  })

  it('returns empty set for no supported files', () => {
    const result = detectLanguagesInIndex(['README.md', 'data.json'])
    expect(result).toEqual(new Set())
  })

  it('deduplicates languages', () => {
    const paths = ['a.ts', 'b.ts', 'c.ts']
    const result = detectLanguagesInIndex(paths)
    expect(result).toEqual(new Set(['typescript']))
    expect(result.size).toBe(1)
  })

  it('handles empty iterable', () => {
    expect(detectLanguagesInIndex([])).toEqual(new Set())
  })
})

// ============================================================
// Async Functions (mocked WASM)
// ============================================================

describe('initTreeSitter', () => {
  it('initializes the parser', async () => {
    await initTreeSitter()
    const { Parser } = await import('web-tree-sitter')
    expect(Parser.init).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — second call is a no-op', async () => {
    await initTreeSitter()
    await initTreeSitter()
    const { Parser } = await import('web-tree-sitter')
    // init only called once even after two calls
    expect(Parser.init).toHaveBeenCalledTimes(1)
  })

  it('concurrent calls reuse the same promise', async () => {
    const p1 = initTreeSitter()
    const p2 = initTreeSitter()
    await Promise.all([p1, p2])
    const { Parser } = await import('web-tree-sitter')
    expect(Parser.init).toHaveBeenCalledTimes(1)
  })
})

describe('loadLanguage', () => {
  it('loads and returns a language grammar', async () => {
    const lang = await loadLanguage('typescript')
    expect(lang).toBe(fakeLang)
    expect(mockLanguageLoad).toHaveBeenCalledWith(
      '/wasm/tree-sitter/tree-sitter-typescript.wasm',
    )
  })

  it('caches loaded languages — second call does not re-load', async () => {
    await loadLanguage('python')
    await loadLanguage('python')
    // Language.load called only once (first time), second served from cache
    expect(mockLanguageLoad).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent loads for the same language', async () => {
    const [a, b] = await Promise.all([
      loadLanguage('go'),
      loadLanguage('go'),
    ])
    expect(a).toBe(b)
    expect(mockLanguageLoad).toHaveBeenCalledTimes(1)
  })

  it('falls back to CDN when local load fails', async () => {
    mockLanguageLoad
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce(fakeLang)

    const lang = await loadLanguage('rust')
    expect(lang).toBe(fakeLang)
    expect(mockLanguageLoad).toHaveBeenCalledTimes(2)
    expect(mockLanguageLoad).toHaveBeenNthCalledWith(
      1,
      '/wasm/tree-sitter/tree-sitter-rust.wasm',
    )
    expect(mockLanguageLoad).toHaveBeenNthCalledWith(
      2,
      'https://cdn.jsdelivr.net/npm/tree-sitter-rust@0.23.2/tree-sitter-rust.wasm',
    )
  })

  it('throws for unsupported language', async () => {
    await expect(loadLanguage('brainfuck')).rejects.toThrow(
      'Unsupported language: brainfuck',
    )
  })

  it('uses correct grammar name for csharp (c_sharp)', async () => {
    await loadLanguage('csharp')
    expect(mockLanguageLoad).toHaveBeenCalledWith(
      '/wasm/tree-sitter/tree-sitter-c_sharp.wasm',
    )
  })
})

describe('parseFile', () => {
  it('returns a tree for supported language', async () => {
    const tree = await parseFile('const x = 1', 'typescript')
    expect(tree).toBe(fakeTree)
    expect(mockSetLanguage).toHaveBeenCalledWith(fakeLang)
    expect(mockParse).toHaveBeenCalledWith('const x = 1')
  })

  it('returns null for unsupported language', async () => {
    const tree = await parseFile('data', 'unknown-lang')
    expect(tree).toBeNull()
  })

  it('returns null when parsing throws', async () => {
    mockParse.mockImplementationOnce(() => {
      throw new Error('Parse error')
    })
    const tree = await parseFile('bad code', 'javascript')
    expect(tree).toBeNull()
  })

  it('initializes parser if not already initialized', async () => {
    // parser is null after resetTreeSitter; parseFile should init it
    const tree = await parseFile('fn main() {}', 'rust')
    expect(tree).toBe(fakeTree)
  })
})

describe('queryTree', () => {
  const mockNode = { type: 'identifier', text: 'foo', startPosition: { row: 0, column: 0 } }

  it('returns structured matches with captures', async () => {
    mockMatches.mockReturnValue([
      {
        patternIndex: 0,
        captures: [{ name: 'name', node: mockNode }],
      },
    ])

    const matches = await queryTree(
      fakeTree as never,
      'typescript',
      '(function_declaration name: (identifier) @name)',
    )

    expect(matches).toHaveLength(1)
    expect(matches[0].pattern).toBe(0)
    expect(matches[0].captures['name']).toEqual([mockNode])
  })

  it('groups multiple captures under the same name', async () => {
    mockMatches.mockReturnValue([
      {
        patternIndex: 0,
        captures: [
          { name: 'name', node: { text: 'a' } },
          { name: 'name', node: { text: 'b' } },
        ],
      },
    ])

    const matches = await queryTree(fakeTree as never, 'typescript', 'query')
    expect(matches[0].captures['name']).toHaveLength(2)
  })

  it('cleans up query after use', async () => {
    mockMatches.mockReturnValue([])
    await queryTree(fakeTree as never, 'typescript', 'query')
    expect(mockQueryDelete).toHaveBeenCalled()
  })

  it('cleans up query even when matches throws', async () => {
    mockMatches.mockImplementation(() => {
      throw new Error('query error')
    })
    await expect(
      queryTree(fakeTree as never, 'typescript', 'query'),
    ).rejects.toThrow('query error')
    expect(mockQueryDelete).toHaveBeenCalled()
  })
})

describe('queryCapturesByName', () => {
  it('returns only captures matching the given name', async () => {
    const nodeA = { text: 'funcA' }
    const nodeB = { text: 'funcB' }
    const nodeType = { text: 'MyType' }

    mockCaptures.mockReturnValue([
      { name: 'func_name', node: nodeA },
      { name: 'type_name', node: nodeType },
      { name: 'func_name', node: nodeB },
    ])

    const result = await queryCapturesByName(
      fakeTree as never,
      'typescript',
      'query',
      'func_name',
    )

    expect(result).toEqual([nodeA, nodeB])
  })

  it('returns empty array when no captures match', async () => {
    mockCaptures.mockReturnValue([
      { name: 'other', node: { text: 'x' } },
    ])

    const result = await queryCapturesByName(
      fakeTree as never,
      'python',
      'query',
      'nonexistent',
    )

    expect(result).toEqual([])
  })

  it('cleans up query after use', async () => {
    mockCaptures.mockReturnValue([])
    await queryCapturesByName(fakeTree as never, 'typescript', 'q', 'name')
    expect(mockQueryDelete).toHaveBeenCalled()
  })
})

describe('preloadLanguages', () => {
  it('does not throw when grammars fail to load', () => {
    mockLanguageLoad.mockRejectedValue(new Error('network failure'))
    // preloadLanguages is fire-and-forget; should not throw
    expect(() => preloadLanguages(['typescript', 'python'])).not.toThrow()
  })

  it('triggers loadLanguage for each language', async () => {
    preloadLanguages(['go', 'rust'])
    // Wait for promises to settle
    await new Promise((r) => setTimeout(r, 10))
    expect(mockLanguageLoad).toHaveBeenCalled()
  })
})

describe('resetTreeSitter', () => {
  it('clears all cached state', async () => {
    await initTreeSitter()
    await loadLanguage('typescript')

    resetTreeSitter()

    // After reset, loadLanguage should re-load from scratch
    mockLanguageLoad.mockResolvedValue({ id: 'new-lang' })
    const lang = await loadLanguage('typescript')
    expect(lang).toEqual({ id: 'new-lang' })
  })

  it('deletes the parser instance', async () => {
    await initTreeSitter()
    resetTreeSitter()
    expect(mockParserDelete).toHaveBeenCalled()
  })

  it('is safe to call when uninitialized', () => {
    expect(() => resetTreeSitter()).not.toThrow()
  })
})
