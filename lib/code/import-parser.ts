// Import Parser — Universal code analysis engine
// Extracts imports, exports, interfaces, types, classes from indexed file contents.
// Supports JS/TS, Python, Go, Rust, PHP.
// Resolves relative import paths against the code index and detects circular dependencies.
// Computes graph topology: entry points, hubs, orphans, leaf nodes, connectors, clusters.

import type { CodeIndex } from './code-index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedImport {
  source: string
  resolvedPath: string | null
  specifiers: string[]
  isExternal: boolean
  isDefault: boolean
}

export interface ExportInfo {
  name: string
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'component' | 'unknown'
  isDefault: boolean
}

export interface ExtractedType {
  name: string
  kind: 'interface' | 'type' | 'enum'
  properties: string[]
  extends?: string[]
  exported: boolean
}

export interface ExtractedClass {
  name: string
  methods: string[]
  properties: string[]
  extends?: string
  implements?: string[]
  exported: boolean
}

export interface FileAnalysis {
  path: string
  imports: ResolvedImport[]
  exports: ExportInfo[]
  types: ExtractedType[]
  classes: ExtractedClass[]
  jsxComponents: string[]
  language: string
}

export interface DependencyGraph {
  edges: Map<string, Set<string>>
  reverseEdges: Map<string, Set<string>>
  circular: [string, string][]
  externalDeps: Map<string, Set<string>>
}

export interface TopologyAnalysis {
  entryPoints: string[]
  hubs: string[]
  orphans: string[]
  leafNodes: string[]
  connectors: string[]
  clusters: string[][]
  depthMap: Map<string, number>
  maxDepth: number
}

export interface FullAnalysis {
  files: Map<string, FileAnalysis>
  graph: DependencyGraph
  topology: TopologyAnalysis
  detectedFramework: string | null
  primaryLanguage: string
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.php': 'php',
  '.rb': 'ruby',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.dart': 'dart',
  '.vue': 'typescript', '.svelte': 'typescript',
}

function detectLang(path: string): string {
  const ext = path.slice(path.lastIndexOf('.'))
  return EXT_TO_LANG[ext] || 'unknown'
}

function detectPrimaryLanguage(files: Map<string, FileAnalysis>): string {
  const counts = new Map<string, number>()
  for (const f of files.values()) {
    counts.set(f.language, (counts.get(f.language) || 0) + 1)
  }
  let best = 'unknown'
  let max = 0
  for (const [lang, n] of counts) {
    if (lang !== 'unknown' && n > max) { best = lang; max = n }
  }
  return best
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.py', '.go', '.rs', '.php']

function normalizePath(p: string): string {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

function resolveRelativeImport(source: string, importerPath: string, indexedPaths: Set<string>): string | null {
  const dir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/')) : ''
  const raw = normalizePath(dir ? `${dir}/${source}` : source)
  if (indexedPaths.has(raw)) return raw
  for (const ext of CODE_EXTENSIONS) {
    if (indexedPaths.has(raw + ext)) return raw + ext
  }
  for (const ext of CODE_EXTENSIONS) {
    if (indexedPaths.has(`${raw}/index${ext}`)) return `${raw}/index${ext}`
  }
  // Python: foo.bar -> foo/bar.py or foo/bar/__init__.py
  const asPy = raw.replace(/\./g, '/')
  if (asPy !== raw) {
    if (indexedPaths.has(asPy + '.py')) return asPy + '.py'
    if (indexedPaths.has(asPy + '/__init__.py')) return asPy + '/__init__.py'
  }
  return null
}

function resolveAliasImport(source: string, indexedPaths: Set<string>): string | null {
  const match = source.match(/^[@~#]\/(.+)$/)
  if (!match) return null
  const rest = match[1]
  const bases = ['', 'src/', 'app/']
  for (const base of bases) {
    const raw = normalizePath(`${base}${rest}`)
    if (indexedPaths.has(raw)) return raw
    for (const ext of CODE_EXTENSIONS) {
      if (indexedPaths.has(raw + ext)) return raw + ext
    }
    for (const ext of CODE_EXTENSIONS) {
      if (indexedPaths.has(`${raw}/index${ext}`)) return `${raw}/index${ext}`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// JS/TS import extraction
// ---------------------------------------------------------------------------

const IMPORT_REGEX = /import\s+(?:(?:type\s+)?(?:(\{[^}]*\})|(\*\s+as\s+\w+)|(\w+))(?:\s*,\s*(?:(\{[^}]*\})|(\w+)))?\s+from\s+)?['"]([^'"]+)['"]/g
const REQUIRE_REGEX = /(?:const|let|var)\s+(?:(\{[^}]*\})|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const EXPORT_FROM_REGEX = /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g

function extractJsImports(content: string, filePath: string, indexedPaths: Set<string>): ResolvedImport[] {
  const imports: ResolvedImport[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  IMPORT_REGEX.lastIndex = 0
  while ((m = IMPORT_REGEX.exec(content)) !== null) {
    const namedBraces = m[1] || m[4]
    const namespace = m[2]
    const defaultName = m[3] || m[5]
    const source = m[6]
    if (seen.has(source)) continue
    seen.add(source)

    const specifiers: string[] = []
    if (namedBraces) specifiers.push(...namedBraces.replace(/[{}]/g, '').split(',').map(s => s.replace(/\s+as\s+\w+/, '').trim()).filter(Boolean))
    if (defaultName) specifiers.push(defaultName)
    if (namespace) specifiers.push(namespace.replace(/\*\s+as\s+/, ''))

    const isRelative = source.startsWith('.') || source.startsWith('/')
    const isAlias = /^[@~#]\//.test(source)
    let resolvedPath: string | null = null
    if (isRelative) resolvedPath = resolveRelativeImport(source, filePath, indexedPaths)
    else if (isAlias) resolvedPath = resolveAliasImport(source, indexedPaths)

    imports.push({ source, resolvedPath, specifiers, isExternal: !isRelative && !isAlias && !resolvedPath, isDefault: !!defaultName })
  }

  REQUIRE_REGEX.lastIndex = 0
  while ((m = REQUIRE_REGEX.exec(content)) !== null) {
    const source = m[3]
    if (seen.has(source)) continue
    seen.add(source)
    const specifiers: string[] = []
    if (m[1]) specifiers.push(...m[1].replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean))
    if (m[2]) specifiers.push(m[2])
    const isRelative = source.startsWith('.')
    const isAlias = /^[@~#]\//.test(source)
    let resolvedPath: string | null = null
    if (isRelative) resolvedPath = resolveRelativeImport(source, filePath, indexedPaths)
    else if (isAlias) resolvedPath = resolveAliasImport(source, indexedPaths)
    imports.push({ source, resolvedPath, specifiers, isExternal: !isRelative && !isAlias && !resolvedPath, isDefault: !!m[2] })
  }

  EXPORT_FROM_REGEX.lastIndex = 0
  while ((m = EXPORT_FROM_REGEX.exec(content)) !== null) {
    const source = m[1]
    if (seen.has(source)) continue
    seen.add(source)
    const isRelative = source.startsWith('.')
    const isAlias = /^[@~#]\//.test(source)
    let resolvedPath: string | null = null
    if (isRelative) resolvedPath = resolveRelativeImport(source, filePath, indexedPaths)
    else if (isAlias) resolvedPath = resolveAliasImport(source, indexedPaths)
    imports.push({ source, resolvedPath, specifiers: [], isExternal: !isRelative && !isAlias && !resolvedPath, isDefault: false })
  }

  return imports
}

// ---------------------------------------------------------------------------
// Python import extraction
// ---------------------------------------------------------------------------

const PY_IMPORT_REGEX = /^(?:from\s+([\w.]+)\s+import\s+(.+)|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm

function extractPythonImports(content: string, filePath: string, indexedPaths: Set<string>): ResolvedImport[] {
  const imports: ResolvedImport[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null

  PY_IMPORT_REGEX.lastIndex = 0
  while ((m = PY_IMPORT_REGEX.exec(content)) !== null) {
    if (m[1]) {
      // from X import Y
      const source = m[1]
      if (seen.has(source)) continue
      seen.add(source)
      const specifiers = m[2].split(',').map(s => s.replace(/\s+as\s+\w+/, '').trim()).filter(Boolean)
      const isRelative = source.startsWith('.')
      let resolvedPath: string | null = null
      if (isRelative) resolvedPath = resolveRelativeImport(source, filePath, indexedPaths)
      else resolvedPath = resolveRelativeImport(source.replace(/\./g, '/'), filePath, indexedPaths)
      const isExternal = !resolvedPath && !isRelative
      imports.push({ source, resolvedPath, specifiers, isExternal, isDefault: false })
    } else if (m[3]) {
      // import X, Y
      for (const mod of m[3].split(',').map(s => s.trim()).filter(Boolean)) {
        if (seen.has(mod)) continue
        seen.add(mod)
        const resolvedPath = resolveRelativeImport(mod.replace(/\./g, '/'), filePath, indexedPaths)
        imports.push({ source: mod, resolvedPath, specifiers: [mod.split('.').pop() || mod], isExternal: !resolvedPath, isDefault: false })
      }
    }
  }

  return imports
}

// ---------------------------------------------------------------------------
// Go import extraction
// ---------------------------------------------------------------------------

const GO_SINGLE_IMPORT = /^import\s+"([^"]+)"/gm
const GO_BLOCK_IMPORT = /import\s*\(\s*([\s\S]*?)\)/g

function extractGoImports(content: string, filePath: string, indexedPaths: Set<string>): ResolvedImport[] {
  const imports: ResolvedImport[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  GO_SINGLE_IMPORT.lastIndex = 0
  while ((m = GO_SINGLE_IMPORT.exec(content)) !== null) {
    const source = m[1]
    if (seen.has(source)) continue
    seen.add(source)
    const resolvedPath = resolveRelativeImport(source, filePath, indexedPaths)
    imports.push({ source, resolvedPath, specifiers: [source.split('/').pop() || source], isExternal: !resolvedPath, isDefault: false })
  }

  GO_BLOCK_IMPORT.lastIndex = 0
  while ((m = GO_BLOCK_IMPORT.exec(content)) !== null) {
    const block = m[1]
    const lines = block.split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*(?:\w+\s+)?"([^"]+)"/)
      if (!match) continue
      const source = match[1]
      if (seen.has(source)) continue
      seen.add(source)
      const resolvedPath = resolveRelativeImport(source, filePath, indexedPaths)
      imports.push({ source, resolvedPath, specifiers: [source.split('/').pop() || source], isExternal: !resolvedPath, isDefault: false })
    }
  }

  return imports
}

// ---------------------------------------------------------------------------
// Rust import extraction
// ---------------------------------------------------------------------------

const RUST_USE_REGEX = /^use\s+((?:crate|super|self)(?:::\w+)+(?:::\{[^}]+\})?|(\w+)(?:::\w+)*(?:::\{[^}]+\})?)/gm
const RUST_MOD_REGEX = /^mod\s+(\w+)\s*;/gm

function extractRustImports(content: string, filePath: string, indexedPaths: Set<string>): ResolvedImport[] {
  const imports: ResolvedImport[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null

  RUST_USE_REGEX.lastIndex = 0
  while ((m = RUST_USE_REGEX.exec(content)) !== null) {
    const source = m[1]
    if (seen.has(source)) continue
    seen.add(source)
    const isCrate = source.startsWith('crate::') || source.startsWith('super::') || source.startsWith('self::')
    let resolvedPath: string | null = null
    if (isCrate) {
      const cleaned = source.replace(/^(crate|super|self)::/, '').replace(/::\{[^}]+\}$/, '')
      resolvedPath = resolveRelativeImport(cleaned.replace(/::/g, '/'), filePath, indexedPaths)
    }
    imports.push({ source, resolvedPath, specifiers: [], isExternal: !isCrate && !resolvedPath, isDefault: false })
  }

  RUST_MOD_REGEX.lastIndex = 0
  while ((m = RUST_MOD_REGEX.exec(content)) !== null) {
    const modName = m[1]
    const resolvedPath = resolveRelativeImport(modName, filePath, indexedPaths)
    imports.push({ source: modName, resolvedPath, specifiers: [modName], isExternal: false, isDefault: false })
  }

  return imports
}

// ---------------------------------------------------------------------------
// PHP import extraction
// ---------------------------------------------------------------------------

const PHP_USE_REGEX = /^use\s+([\w\\]+)(?:\s+as\s+\w+)?\s*;/gm
const PHP_REQUIRE_REGEX = /(?:require|include)(?:_once)?\s*(?:\(\s*)?['"]([^'"]+)['"]/gm

function extractPhpImports(content: string, filePath: string, indexedPaths: Set<string>): ResolvedImport[] {
  const imports: ResolvedImport[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null

  PHP_USE_REGEX.lastIndex = 0
  while ((m = PHP_USE_REGEX.exec(content)) !== null) {
    const source = m[1]
    if (seen.has(source)) continue
    seen.add(source)
    imports.push({ source, resolvedPath: null, specifiers: [source.split('\\').pop() || source], isExternal: true, isDefault: false })
  }

  PHP_REQUIRE_REGEX.lastIndex = 0
  while ((m = PHP_REQUIRE_REGEX.exec(content)) !== null) {
    const source = m[1]
    if (seen.has(source)) continue
    seen.add(source)
    const resolvedPath = resolveRelativeImport(source, filePath, indexedPaths)
    imports.push({ source, resolvedPath, specifiers: [], isExternal: !resolvedPath, isDefault: false })
  }

  return imports
}

// ---------------------------------------------------------------------------
// Dispatch imports by language
// ---------------------------------------------------------------------------

function extractImports(content: string, filePath: string, lang: string, indexedPaths: Set<string>): ResolvedImport[] {
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return extractJsImports(content, filePath, indexedPaths)
    case 'python':
      return extractPythonImports(content, filePath, indexedPaths)
    case 'go':
      return extractGoImports(content, filePath, indexedPaths)
    case 'rust':
      return extractRustImports(content, filePath, indexedPaths)
    case 'php':
      return extractPhpImports(content, filePath, indexedPaths)
    default:
      // Attempt JS-style extraction as fallback
      return extractJsImports(content, filePath, indexedPaths)
  }
}

// ---------------------------------------------------------------------------
// Exports extraction (JS/TS — other languages use conventions)
// ---------------------------------------------------------------------------

const NAMED_EXPORT_REGEX = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g
const DEFAULT_EXPORT_REGEX = /export\s+default\s+(?:(?:async\s+)?function|class)\s*(\w*)/g
const EXPORT_DEFAULT_ID_REGEX = /export\s+default\s+(\w+)\s*;?\s*$/gm

function extractExports(content: string, lang: string): ExportInfo[] {
  // Only JS/TS have explicit export syntax
  if (lang !== 'typescript' && lang !== 'javascript') {
    // For Python: look for top-level def/class not starting with _
    if (lang === 'python') {
      const exports: ExportInfo[] = []
      const pyDef = /^(?:def|async\s+def)\s+(\w+)/gm
      const pyClass = /^class\s+(\w+)/gm
      let m: RegExpExecArray | null
      pyDef.lastIndex = 0
      while ((m = pyDef.exec(content)) !== null) {
        if (!m[1].startsWith('_')) exports.push({ name: m[1], kind: 'function', isDefault: false })
      }
      pyClass.lastIndex = 0
      while ((m = pyClass.exec(content)) !== null) {
        if (!m[1].startsWith('_')) exports.push({ name: m[1], kind: 'class', isDefault: false })
      }
      return exports
    }
    // For Go: look for uppercase-starting funcs
    if (lang === 'go') {
      const exports: ExportInfo[] = []
      const goFunc = /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?([A-Z]\w+)/gm
      let m: RegExpExecArray | null
      goFunc.lastIndex = 0
      while ((m = goFunc.exec(content)) !== null) {
        exports.push({ name: m[1], kind: 'function', isDefault: false })
      }
      return exports
    }
    // For Rust: pub items
    if (lang === 'rust') {
      const exports: ExportInfo[] = []
      const rustPub = /^pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|static|mod)\s+(\w+)/gm
      let m: RegExpExecArray | null
      rustPub.lastIndex = 0
      while ((m = rustPub.exec(content)) !== null) {
        exports.push({ name: m[1], kind: 'function', isDefault: false })
      }
      return exports
    }
    return []
  }

  const exports: ExportInfo[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null

  NAMED_EXPORT_REGEX.lastIndex = 0
  while ((m = NAMED_EXPORT_REGEX.exec(content)) !== null) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    const line = content.slice(Math.max(0, m.index - 10), m.index + m[0].length + 10)
    const isDefault = /export\s+default/.test(line)
    let kind: ExportInfo['kind'] = 'unknown'
    if (/function/.test(m[0])) kind = 'function'
    else if (/class/.test(m[0])) kind = 'class'
    else if (/(?:const|let|var)/.test(m[0])) kind = 'variable'
    else if (/type/.test(m[0])) kind = 'type'
    else if (/interface/.test(m[0])) kind = 'interface'
    else if (/enum/.test(m[0])) kind = 'enum'
    if ((kind === 'function' || kind === 'variable') && /^[A-Z]/.test(name)) kind = 'component'
    exports.push({ name, kind, isDefault })
  }

  EXPORT_DEFAULT_ID_REGEX.lastIndex = 0
  while ((m = EXPORT_DEFAULT_ID_REGEX.exec(content)) !== null) {
    if (m[1] && !seen.has(m[1]) && /^[A-Z]/.test(m[1])) {
      seen.add(m[1])
      exports.push({ name: m[1], kind: 'unknown', isDefault: true })
    }
  }

  DEFAULT_EXPORT_REGEX.lastIndex = 0
  while ((m = DEFAULT_EXPORT_REGEX.exec(content)) !== null) {
    if (!m[1] && !seen.has('default')) {
      seen.add('default')
      exports.push({ name: 'default', kind: /function/.test(m[0]) ? 'function' : 'class', isDefault: true })
    }
  }

  return exports
}

// ---------------------------------------------------------------------------
// Type/Interface/Class extraction (JS/TS + Python classes + Go structs + Rust structs)
// ---------------------------------------------------------------------------

const INTERFACE_REGEX = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g
const TYPE_REGEX = /(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=\s*([^;]+)/g
const ENUM_REGEX = /(?:export\s+)?enum\s+(\w+)\s*\{([^}]*)\}/g
const CLASS_REGEX = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g

function extractTypes(content: string, lang: string): ExtractedType[] {
  if (lang !== 'typescript' && lang !== 'javascript') {
    // Go structs
    if (lang === 'go') {
      const types: ExtractedType[] = []
      const goStruct = /type\s+(\w+)\s+struct\s*\{([^}]*)\}/g
      let m: RegExpExecArray | null
      goStruct.lastIndex = 0
      while ((m = goStruct.exec(content)) !== null) {
        const props = m[2].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'))
        types.push({ name: m[1], kind: 'interface', properties: props, exported: /^[A-Z]/.test(m[1]) })
      }
      const goInterface = /type\s+(\w+)\s+interface\s*\{([^}]*)\}/g
      goInterface.lastIndex = 0
      while ((m = goInterface.exec(content)) !== null) {
        const props = m[2].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'))
        types.push({ name: m[1], kind: 'interface', properties: props, exported: /^[A-Z]/.test(m[1]) })
      }
      return types
    }
    // Rust structs/enums
    if (lang === 'rust') {
      const types: ExtractedType[] = []
      const rustStruct = /(?:pub\s+)?struct\s+(\w+)(?:<[^>]*>)?\s*\{([^}]*)\}/g
      let m: RegExpExecArray | null
      rustStruct.lastIndex = 0
      while ((m = rustStruct.exec(content)) !== null) {
        const props = m[2].split(',').map(l => l.trim()).filter(l => l && !l.startsWith('//'))
        types.push({ name: m[1], kind: 'interface', properties: props, exported: content.slice(Math.max(0, m.index - 5), m.index).includes('pub') })
      }
      const rustEnum = /(?:pub\s+)?enum\s+(\w+)(?:<[^>]*>)?\s*\{([^}]*)\}/g
      rustEnum.lastIndex = 0
      while ((m = rustEnum.exec(content)) !== null) {
        const props = m[2].split(',').map(l => l.trim().split('(')[0].split('{')[0].trim()).filter(Boolean)
        types.push({ name: m[1], kind: 'enum', properties: props, exported: content.slice(Math.max(0, m.index - 5), m.index).includes('pub') })
      }
      return types
    }
    // Python classes (as types)
    if (lang === 'python') {
      const types: ExtractedType[] = []
      // dataclasses/pydantic
      const pyDataclass = /@dataclass[\s\S]*?class\s+(\w+)(?:\(([^)]*)\))?\s*:([\s\S]*?)(?=\nclass\s|\n[^\s]|\Z)/g
      let m: RegExpExecArray | null
      pyDataclass.lastIndex = 0
      while ((m = pyDataclass.exec(content)) !== null) {
        const props = m[3].split('\n').map(l => l.trim()).filter(l => l && l.includes(':') && !l.startsWith('#') && !l.startsWith('def'))
        types.push({ name: m[1], kind: 'interface', properties: props, exported: !m[1].startsWith('_') })
      }
      return types
    }
    return []
  }

  const types: ExtractedType[] = []
  let m: RegExpExecArray | null

  INTERFACE_REGEX.lastIndex = 0
  while ((m = INTERFACE_REGEX.exec(content)) !== null) {
    const name = m[1]
    const extendsStr = m[2]
    const body = m[3]
    const exported = content.slice(Math.max(0, m.index - 8), m.index).includes('export')
    const properties = body.split('\n').map(l => l.trim().replace(/;$/, '').trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('/*'))
    const exts = extendsStr ? extendsStr.split(',').map(s => s.trim()).filter(Boolean) : undefined
    types.push({ name, kind: 'interface', properties, extends: exts, exported })
  }

  TYPE_REGEX.lastIndex = 0
  while ((m = TYPE_REGEX.exec(content)) !== null) {
    const name = m[1]
    const body = m[2].trim()
    const exported = content.slice(Math.max(0, m.index - 8), m.index).includes('export')
    const properties = body.includes('|')
      ? body.split('|').map(s => s.trim()).filter(Boolean)
      : body.includes('&')
        ? body.split('&').map(s => s.trim()).filter(Boolean)
        : [body]
    types.push({ name, kind: 'type', properties, exported })
  }

  ENUM_REGEX.lastIndex = 0
  while ((m = ENUM_REGEX.exec(content)) !== null) {
    const name = m[1]
    const body = m[2]
    const exported = content.slice(Math.max(0, m.index - 8), m.index).includes('export')
    const properties = body.split(',').map(s => s.trim().split('=')[0].trim()).filter(Boolean)
    types.push({ name, kind: 'enum', properties, exported })
  }

  return types
}

function extractClasses(content: string, lang: string): ExtractedClass[] {
  if (lang !== 'typescript' && lang !== 'javascript') {
    // Python classes
    if (lang === 'python') {
      const classes: ExtractedClass[] = []
      const pyClass = /^class\s+(\w+)(?:\(([^)]*)\))?\s*:/gm
      let m: RegExpExecArray | null
      pyClass.lastIndex = 0
      while ((m = pyClass.exec(content)) !== null) {
        const name = m[1]
        const bases = m[2] ? m[2].split(',').map(s => s.trim()).filter(Boolean) : []
        // Rough method extraction
        const afterClass = content.slice(m.index)
        const methodRegex = /^\s{4}(?:async\s+)?def\s+(\w+)/gm
        const methods: string[] = []
        let mm: RegExpExecArray | null
        methodRegex.lastIndex = 0
        while ((mm = methodRegex.exec(afterClass)) !== null) {
          if (mm.index > 2000) break // Don't scan too far
          if (mm[1] !== '__init__') methods.push(mm[1])
        }
        classes.push({ name, methods, properties: [], extends: bases[0], implements: bases.length > 1 ? bases.slice(1) : undefined, exported: !name.startsWith('_') })
      }
      return classes
    }
    return []
  }

  const classes: ExtractedClass[] = []
  let m: RegExpExecArray | null

  CLASS_REGEX.lastIndex = 0
  while ((m = CLASS_REGEX.exec(content)) !== null) {
    const name = m[1]
    const ext = m[2] || undefined
    const impl = m[3] ? m[3].split(',').map(s => s.trim()).filter(Boolean) : undefined
    const exported = content.slice(Math.max(0, m.index - 8), m.index).includes('export')

    const startIdx = content.indexOf('{', m.index + m[0].length - 1)
    let depth = 1
    let endIdx = startIdx + 1
    while (depth > 0 && endIdx < content.length) {
      if (content[endIdx] === '{') depth++
      else if (content[endIdx] === '}') depth--
      endIdx++
    }
    const body = content.slice(startIdx + 1, endIdx - 1)

    const methodRegex = /(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)/g
    const methods: string[] = []
    let mm: RegExpExecArray | null
    methodRegex.lastIndex = 0
    while ((mm = methodRegex.exec(body)) !== null) {
      if (mm[1] !== 'constructor' && mm[1] !== 'if' && mm[1] !== 'for' && mm[1] !== 'while') methods.push(mm[1])
    }

    const propRegex = /^\s*(?:readonly\s+)?(?:private\s+|public\s+|protected\s+)?(\w+)\s*[?!]?\s*:/gm
    const properties: string[] = []
    let pm: RegExpExecArray | null
    propRegex.lastIndex = 0
    while ((pm = propRegex.exec(body)) !== null) {
      if (!methods.includes(pm[1])) properties.push(pm[1])
    }

    classes.push({ name, methods, properties, extends: ext, implements: impl, exported })
  }

  return classes
}

// ---------------------------------------------------------------------------
// JSX extraction (React/Preact/Solid)
// ---------------------------------------------------------------------------

const JSX_TAG_REGEX = /<([A-Z]\w+)(?:\s|\/|>)/g

function extractJsxComponents(content: string, lang: string): string[] {
  if (lang !== 'typescript' && lang !== 'javascript') return []
  const components = new Set<string>()
  let m: RegExpExecArray | null
  JSX_TAG_REGEX.lastIndex = 0
  while ((m = JSX_TAG_REGEX.exec(content)) !== null) {
    if (m[1].length > 1 && /^[A-Z]/.test(m[1])) components.add(m[1])
  }
  return Array.from(components)
}

// ---------------------------------------------------------------------------
// Circular dependency detection (DFS)
// ---------------------------------------------------------------------------

function detectCircularDeps(edges: Map<string, Set<string>>): [string, string][] {
  const circular: [string, string][] = []
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const seenPairs = new Set<string>()

  function dfs(node: string, path: string[]) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node)
      if (cycleStart >= 0) {
        for (let i = cycleStart; i < path.length; i++) {
          const a = path[i]
          const b = path[i + 1] || node
          const key = [a, b].sort().join('|')
          if (!seenPairs.has(key)) { seenPairs.add(key); circular.push([a, b]) }
        }
      }
      return
    }
    if (visited.has(node)) return
    visited.add(node)
    inStack.add(node)
    const deps = edges.get(node)
    if (deps) for (const dep of deps) dfs(dep, [...path, node])
    inStack.delete(node)
  }

  for (const node of edges.keys()) dfs(node, [])
  return circular
}

// ---------------------------------------------------------------------------
// Topology analysis (works for ANY language)
// ---------------------------------------------------------------------------

export function computeTopology(graph: DependencyGraph, allPaths: string[]): TopologyAnalysis {
  const { edges, reverseEdges } = graph
  const allNodes = new Set(allPaths)

  // Degree counts
  const outDegree = new Map<string, number>()
  const inDegree = new Map<string, number>()
  for (const n of allNodes) {
    outDegree.set(n, edges.get(n)?.size || 0)
    inDegree.set(n, reverseEdges.get(n)?.size || 0)
  }

  // Orphans: no edges in either direction
  const orphans: string[] = []
  for (const n of allNodes) {
    if ((outDegree.get(n) || 0) === 0 && (inDegree.get(n) || 0) === 0) orphans.push(n)
  }

  // Entry points: high outgoing, low incoming (top files by out/in ratio)
  const nonOrphan = allPaths.filter(n => !orphans.includes(n))
  const entryPoints = nonOrphan
    .filter(n => (outDegree.get(n) || 0) > 0 && (inDegree.get(n) || 0) === 0)
    .sort((a, b) => (outDegree.get(b) || 0) - (outDegree.get(a) || 0))
    .slice(0, 20)

  // Hubs: top 10% by incoming edges (most-imported)
  const hubThreshold = Math.max(2, Math.ceil(nonOrphan.length * 0.1))
  const hubs = nonOrphan
    .filter(n => (inDegree.get(n) || 0) >= 2)
    .sort((a, b) => (inDegree.get(b) || 0) - (inDegree.get(a) || 0))
    .slice(0, hubThreshold)

  // Leaf nodes: only incoming, no outgoing project-internal deps
  const leafNodes = nonOrphan
    .filter(n => (inDegree.get(n) || 0) > 0 && (outDegree.get(n) || 0) === 0)

  // Clusters via union-find on undirected graph
  const parent = new Map<string, string>()
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const n of allNodes) find(n) // Init
  for (const [from, deps] of edges) {
    for (const to of deps) union(from, to)
  }

  const clusterMap = new Map<string, string[]>()
  for (const n of allNodes) {
    const root = find(n)
    if (!clusterMap.has(root)) clusterMap.set(root, [])
    clusterMap.get(root)!.push(n)
  }
  const clusters = Array.from(clusterMap.values()).filter(c => c.length > 1).sort((a, b) => b.length - a.length)

  // Connectors: articulation points via simplified Tarjan's on undirected graph
  const connectors: string[] = []
  const disc = new Map<string, number>()
  const low = new Map<string, number>()
  const parentMap = new Map<string, string | null>()
  const articulationSet = new Set<string>()
  let timer = 0

  // Build undirected adjacency
  const undirected = new Map<string, Set<string>>()
  for (const n of allNodes) undirected.set(n, new Set())
  for (const [from, deps] of edges) {
    for (const to of deps) {
      undirected.get(from)?.add(to)
      undirected.get(to)?.add(from)
    }
  }

  function tarjanDfs(u: string) {
    disc.set(u, timer)
    low.set(u, timer)
    timer++
    let children = 0

    for (const v of undirected.get(u) || []) {
      if (!disc.has(v)) {
        children++
        parentMap.set(v, u)
        tarjanDfs(v)
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
        // u is articulation if:
        if (parentMap.get(u) === null && children > 1) articulationSet.add(u)
        if (parentMap.get(u) !== null && low.get(v)! >= disc.get(u)!) articulationSet.add(u)
      } else if (v !== parentMap.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!))
      }
    }
  }

  for (const n of allNodes) {
    if (!disc.has(n)) {
      parentMap.set(n, null)
      tarjanDfs(n)
    }
  }
  connectors.push(...articulationSet)

  // Depth map: BFS from entry points
  const depthMap = new Map<string, number>()
  let maxDepth = 0

  for (const entry of entryPoints) {
    const queue: [string, number][] = [[entry, 0]]
    const visited = new Set<string>([entry])
    while (queue.length > 0) {
      const [node, depth] = queue.shift()!
      const current = depthMap.get(node) || 0
      if (depth > current) depthMap.set(node, depth)
      if (depth > maxDepth) maxDepth = depth

      const deps = edges.get(node)
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            visited.add(dep)
            queue.push([dep, depth + 1])
          }
        }
      }
    }
  }

  return { entryPoints, hubs, orphans, leafNodes, connectors, clusters, depthMap, maxDepth }
}

// ---------------------------------------------------------------------------
// Framework detection (universal)
// ---------------------------------------------------------------------------

function detectFramework(files: Map<string, FileAnalysis>, graph: DependencyGraph): string | null {
  const paths = new Set(files.keys())
  const externalPkgs = new Set(graph.externalDeps.keys())

  // Next.js
  if (externalPkgs.has('next') || [...paths].some(p => /app\/.*\/page\.(tsx?|jsx?)$/.test(p) || p === 'next.config.mjs' || p === 'next.config.js' || p === 'next.config.ts')) return 'Next.js'
  // Nuxt
  if (externalPkgs.has('nuxt') || [...paths].some(p => p === 'nuxt.config.ts' || p === 'nuxt.config.js')) return 'Nuxt'
  // SvelteKit
  if (externalPkgs.has('@sveltejs/kit') || [...paths].some(p => p === 'svelte.config.js')) return 'SvelteKit'
  // Vue
  if (externalPkgs.has('vue')) return 'Vue'
  // Svelte
  if (externalPkgs.has('svelte')) return 'Svelte'
  // React (generic)
  if (externalPkgs.has('react')) return 'React'
  // Express
  if (externalPkgs.has('express')) return 'Express'
  // Fastify
  if (externalPkgs.has('fastify')) return 'Fastify'
  // Django
  if ([...paths].some(p => p.endsWith('manage.py') || p.endsWith('settings.py') || p.includes('django'))) return 'Django'
  // Flask
  if (externalPkgs.has('flask') || [...paths].some(p => p.endsWith('app.py') && files.get(p)?.imports.some(i => i.source === 'flask'))) return 'Flask'
  // FastAPI
  if (externalPkgs.has('fastapi')) return 'FastAPI'
  // Go (check for main.go)
  if ([...paths].some(p => p.endsWith('main.go'))) return 'Go'
  // Rust (Cargo)
  if ([...paths].some(p => p === 'Cargo.toml')) return 'Rust/Cargo'
  // Laravel
  if ([...paths].some(p => p === 'artisan' || p.includes('laravel'))) return 'Laravel'

  return null
}

// ---------------------------------------------------------------------------
// Main analysis entry point
// ---------------------------------------------------------------------------

export function analyzeCodebase(codeIndex: CodeIndex): FullAnalysis {
  const files = new Map<string, FileAnalysis>()
  const indexedPaths = new Set(codeIndex.files.keys())

  // Phase 1: Analyze each file
  for (const [path, indexed] of codeIndex.files) {
    const content = indexed.content
    const lang = detectLang(path)
    const imports = extractImports(content, path, lang, indexedPaths)
    const exports = extractExports(content, lang)
    const types = extractTypes(content, lang)
    const classes = extractClasses(content, lang)
    const jsxComponents = extractJsxComponents(content, lang)

    files.set(path, { path, imports, exports, types, classes, jsxComponents, language: lang })
  }

  // Phase 2: Build dependency graph
  const edges = new Map<string, Set<string>>()
  const reverseEdges = new Map<string, Set<string>>()
  const externalDeps = new Map<string, Set<string>>()

  for (const [path, analysis] of files) {
    if (!edges.has(path)) edges.set(path, new Set())
    for (const imp of analysis.imports) {
      if (imp.isExternal) {
        const pkgName = imp.source.startsWith('@')
          ? imp.source.split('/').slice(0, 2).join('/')
          : imp.source.split('/')[0]
        if (!externalDeps.has(pkgName)) externalDeps.set(pkgName, new Set())
        externalDeps.get(pkgName)!.add(path)
      } else if (imp.resolvedPath) {
        edges.get(path)!.add(imp.resolvedPath)
        if (!reverseEdges.has(imp.resolvedPath)) reverseEdges.set(imp.resolvedPath, new Set())
        reverseEdges.get(imp.resolvedPath)!.add(path)
      }
    }
  }

  // Phase 3: Detect circular deps
  const circular = detectCircularDeps(edges)
  const graph: DependencyGraph = { edges, reverseEdges, circular, externalDeps }

  // Phase 4: Topology
  const allPaths = Array.from(files.keys())
  const topology = computeTopology(graph, allPaths)

  // Phase 5: Framework detection
  const detectedFramework = detectFramework(files, graph)
  const primaryLanguage = detectPrimaryLanguage(files)

  return { files, graph, topology, detectedFramework, primaryLanguage }
}
