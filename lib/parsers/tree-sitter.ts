// Shared Tree-sitter module — works in both main thread and Web Worker
//
// Usage:
//   import { initTreeSitter, parseFile, queryTree, getLanguageForFile } from '@/lib/parsers/tree-sitter'
//   await initTreeSitter()
//   const tree = await parseFile(content, 'typescript')
//   const matches = await queryTree(tree, 'typescript', '(function_declaration name: (identifier) @name)')

import type {
  Node as TSNode,
  Parser as TSParser,
  Language as TSLanguage,
  Tree as TSTree,
  Query as TSQuery,
  QueryMatch,
  QueryCapture,
} from 'web-tree-sitter'

// Re-export types consumers may need
export type { TSNode, TSTree, TSLanguage, TSParser, QueryMatch, QueryCapture }

// ---------- Language Registry ----------

interface LanguageConfig {
  /** Tree-sitter grammar identifier (matches the .wasm filename) */
  grammarName: string
  /** File extensions that map to this language */
  extensions: string[]
  /** npm package name on CDN */
  npmPackage: string
  /** Pinned version for CDN integrity */
  version: string
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  javascript: {
    grammarName: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    npmPackage: 'tree-sitter-javascript',
    version: '0.23.0',
  },
  typescript: {
    grammarName: 'typescript',
    extensions: ['.ts', '.mts', '.cts'],
    npmPackage: 'tree-sitter-typescript',
    version: '0.23.2',
  },
  tsx: {
    grammarName: 'tsx',
    extensions: ['.tsx'],
    npmPackage: 'tree-sitter-typescript',
    version: '0.23.2',
  },
  python: {
    grammarName: 'python',
    extensions: ['.py', '.pyw', '.pyi'],
    npmPackage: 'tree-sitter-python',
    version: '0.23.5',
  },
  java: {
    grammarName: 'java',
    extensions: ['.java'],
    npmPackage: 'tree-sitter-java',
    version: '0.23.4',
  },
  go: {
    grammarName: 'go',
    extensions: ['.go'],
    npmPackage: 'tree-sitter-go',
    version: '0.23.4',
  },
  rust: {
    grammarName: 'rust',
    extensions: ['.rs'],
    npmPackage: 'tree-sitter-rust',
    version: '0.23.2',
  },
  c: {
    grammarName: 'c',
    extensions: ['.c', '.h'],
    npmPackage: 'tree-sitter-c',
    version: '0.23.4',
  },
  cpp: {
    grammarName: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
    npmPackage: 'tree-sitter-cpp',
    version: '0.23.4',
  },
  csharp: {
    grammarName: 'c_sharp',
    extensions: ['.cs'],
    npmPackage: 'tree-sitter-c-sharp',
    version: '0.23.1',
  },
  ruby: {
    grammarName: 'ruby',
    extensions: ['.rb', '.rake', '.gemspec'],
    npmPackage: 'tree-sitter-ruby',
    version: '0.23.1',
  },
  php: {
    grammarName: 'php',
    extensions: ['.php'],
    npmPackage: 'tree-sitter-php',
    version: '0.23.9',
  },
  swift: {
    grammarName: 'swift',
    extensions: ['.swift'],
    npmPackage: 'tree-sitter-swift',
    version: '0.6.0',
  },
  kotlin: {
    grammarName: 'kotlin',
    extensions: ['.kt', '.kts'],
    npmPackage: 'tree-sitter-kotlin',
    version: '0.3.8',
  },
} as const

// Build extension → language lookup
const EXTENSION_TO_LANGUAGE = new Map<string, string>()
for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
  for (const ext of config.extensions) {
    if (!EXTENSION_TO_LANGUAGE.has(ext)) {
      EXTENSION_TO_LANGUAGE.set(ext, lang)
    }
  }
}

// ---------- State ----------

let parser: TSParser | null = null
let initPromise: Promise<void> | null = null
const loadedLanguages = new Map<string, TSLanguage>()
const languageLoadPromises = new Map<string, Promise<TSLanguage>>()

// Lazy-loaded constructors (avoids SSR import of WASM-dependent code)
let ParserCtor: ((new () => TSParser) & { init: (opts?: Record<string, unknown>) => Promise<void> }) | null = null
let LanguageCtor: { load: (input: string | Uint8Array) => Promise<TSLanguage> } | null = null
let QueryCtor: (new (language: TSLanguage, source: string) => TSQuery) | null = null

async function loadModule(): Promise<void> {
  if (ParserCtor) return
  const mod = await import('web-tree-sitter')
  ParserCtor = mod.Parser as NonNullable<typeof ParserCtor>
  LanguageCtor = mod.Language as NonNullable<typeof LanguageCtor>
  QueryCtor = mod.Query as NonNullable<typeof QueryCtor>
}

// ---------- Core API ----------

/**
 * Initialize the Tree-sitter WASM runtime. Idempotent — safe to call multiple times.
 * Works in both main thread and Web Worker contexts.
 */
export async function initTreeSitter(): Promise<void> {
  if (parser) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      await loadModule()
      await ParserCtor!.init({
        locateFile: () => '/wasm/web-tree-sitter.wasm',
      })
      parser = new ParserCtor!()
    } catch (err) {
      initPromise = null
      throw err
    }
  })()

  return initPromise
}

/**
 * Get the Tree-sitter language identifier for a file extension.
 * Returns undefined for unsupported file types.
 */
export function getLanguageForFile(filePath: string): string | undefined {
  const ext = '.' + (filePath.split('.').pop() ?? '').toLowerCase()
  return EXTENSION_TO_LANGUAGE.get(ext)
}

/** Get all supported language identifiers. */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_CONFIGS)
}

/** Check if a language is supported by Tree-sitter. */
export function isLanguageSupported(language: string): boolean {
  return language in LANGUAGE_CONFIGS
}

/**
 * Load a language grammar. Lazy + cached — each grammar loaded at most once.
 * Tries local /wasm/tree-sitter/ first, then falls back to jsdelivr CDN.
 */
export async function loadLanguage(language: string): Promise<TSLanguage> {
  const cached = loadedLanguages.get(language)
  if (cached) return cached

  const pending = languageLoadPromises.get(language)
  if (pending) return pending

  const config = LANGUAGE_CONFIGS[language]
  if (!config) throw new Error(`Unsupported language: ${language}`)

  const loadPromise = (async () => {
    await loadModule()
    await initTreeSitter()

    const grammarFile = `tree-sitter-${config.grammarName}.wasm`
    const localUrl = `/wasm/tree-sitter/${grammarFile}`

    let lang: TSLanguage
    try {
      lang = await LanguageCtor!.load(localUrl)
    } catch {
      const cdnUrl = `https://cdn.jsdelivr.net/npm/${config.npmPackage}@${config.version}/${grammarFile}`
      lang = await LanguageCtor!.load(cdnUrl)
    }

    loadedLanguages.set(language, lang)
    return lang
  })()

  languageLoadPromises.set(language, loadPromise)
  try {
    return await loadPromise
  } finally {
    languageLoadPromises.delete(language)
  }
}

/**
 * Parse source code into a syntax tree.
 * Returns null if the language is unsupported or parsing fails.
 */
export async function parseFile(
  content: string,
  language: string,
): Promise<TSTree | null> {
  if (!(language in LANGUAGE_CONFIGS)) return null

  try {
    if (!parser) await initTreeSitter()
    if (!parser) return null

    const lang = await loadLanguage(language)
    parser.setLanguage(lang)
    return parser.parse(content)
  } catch (err) {
    console.warn(`[tree-sitter] Failed to parse ${language}:`, err)
    return null
  }
}

/**
 * Run a Tree-sitter S-expression query against a syntax tree.
 * Returns an array of match objects with named captures.
 */
export async function queryTree(
  tree: TSTree,
  language: string,
  querySource: string,
): Promise<Array<{ pattern: number; captures: Record<string, TSNode[]> }>> {
  await loadModule()
  const lang = await loadLanguage(language)
  const query = new QueryCtor!(lang, querySource)
  if (!query) throw new Error('Failed to create tree-sitter query')

  try {
    const rawMatches = query.matches(tree.rootNode)
    return rawMatches.map((match: QueryMatch) => {
      const captures: Record<string, TSNode[]> = {}
      for (const capture of match.captures) {
        if (!captures[capture.name]) {
          captures[capture.name] = []
        }
        captures[capture.name].push(capture.node)
      }
      return { pattern: match.patternIndex, captures }
    })
  } finally {
    query.delete()
  }
}

/**
 * Simplified query that returns just the captured nodes by name.
 * Useful for extracting specific constructs (functions, classes, types).
 */
export async function queryCapturesByName(
  tree: TSTree,
  language: string,
  querySource: string,
  captureName: string,
): Promise<TSNode[]> {
  await loadModule()
  const lang = await loadLanguage(language)
  const query = new QueryCtor!(lang, querySource)
  if (!query) throw new Error('Failed to create tree-sitter query')

  try {
    const captures = query.captures(tree.rootNode)
    return captures
      .filter((c: QueryCapture) => c.name === captureName)
      .map((c: QueryCapture) => c.node)
  } finally {
    query.delete()
  }
}

/**
 * Detect all languages present in a set of file paths.
 * Returns only supported languages that have grammar configs.
 */
export function detectLanguagesInIndex(filePaths: Iterable<string>): Set<string> {
  const detected = new Set<string>()
  for (const path of filePaths) {
    const lang = getLanguageForFile(path)
    if (lang) detected.add(lang)
  }
  return detected
}

/**
 * Preload grammars for all detected languages. Non-blocking — fire and forget.
 * Call after loading a repository to warm the cache.
 */
export function preloadLanguages(languages: Iterable<string>): void {
  for (const lang of languages) {
    loadLanguage(lang).catch(() => {
      /* Grammar may not be available — non-fatal */
    })
  }
}

/** Reset all state. Useful for testing. */
export function resetTreeSitter(): void {
  parser?.delete()
  parser = null
  initPromise = null
  loadedLanguages.clear()
  languageLoadPromises.clear()
  ParserCtor = null
  LanguageCtor = null
  QueryCtor = null
}
