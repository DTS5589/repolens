import {
  detectLang,
  normalizePath,
  resolveRelativeImport,
  resolveAliasImport,
  EXT_TO_LANG,
  CODE_EXTENSIONS,
} from '@/lib/code/parser/utils'

describe('detectLang', () => {
  it.each([
    { path: 'src/app.ts', expected: 'typescript' },
    { path: 'src/app.tsx', expected: 'typescript' },
    { path: 'src/app.mts', expected: 'typescript' },
    { path: 'src/app.js', expected: 'javascript' },
    { path: 'src/app.jsx', expected: 'javascript' },
    { path: 'src/app.mjs', expected: 'javascript' },
    { path: 'src/app.py', expected: 'python' },
    { path: 'main.go', expected: 'go' },
    { path: 'src/main.rs', expected: 'rust' },
    { path: 'index.php', expected: 'php' },
    { path: 'src/app.vue', expected: 'typescript' },
    { path: 'src/app.svelte', expected: 'typescript' },
    { path: 'README.md', expected: 'unknown' },
    { path: 'file.xyz', expected: 'unknown' },
  ])('returns "$expected" for "$path"', ({ path, expected }) => {
    expect(detectLang(path)).toBe(expected)
  })
})

describe('normalizePath', () => {
  it.each([
    { input: 'src/../lib/utils', expected: 'lib/utils' },
    { input: 'src/./lib/utils', expected: 'src/lib/utils' },
    { input: './src/lib/utils', expected: 'src/lib/utils' },
    { input: 'src/components/../utils', expected: 'src/utils' },
    { input: 'a/b/c/../../d', expected: 'a/d' },
    { input: '', expected: '' },
    { input: 'simple', expected: 'simple' },
  ])('normalizes "$input" to "$expected"', ({ input, expected }) => {
    expect(normalizePath(input)).toBe(expected)
  })
})

describe('resolveRelativeImport', () => {
  const indexedPaths = new Set([
    'src/utils.ts',
    'src/helpers/index.ts',
    'src/models/user.ts',
    'lib/core.ts',
  ])

  it('resolves direct match', () => {
    const result = resolveRelativeImport('./utils', 'src/app.ts', indexedPaths)
    expect(result).toBe('src/utils.ts')
  })

  it('resolves with extension lookup', () => {
    const result = resolveRelativeImport('./models/user', 'src/app.ts', indexedPaths)
    expect(result).toBe('src/models/user.ts')
  })

  it('resolves index file', () => {
    const result = resolveRelativeImport('./helpers', 'src/app.ts', indexedPaths)
    expect(result).toBe('src/helpers/index.ts')
  })

  it('resolves parent directory reference', () => {
    const result = resolveRelativeImport('../lib/core', 'src/app.ts', indexedPaths)
    expect(result).toBe('lib/core.ts')
  })

  it('returns null for unresolvable import', () => {
    const result = resolveRelativeImport('./nonexistent', 'src/app.ts', indexedPaths)
    expect(result).toBeNull()
  })
})

describe('resolveAliasImport', () => {
  const indexedPaths = new Set([
    'src/lib/auth.ts',
    'lib/auth.ts',
    'app/components/Button.tsx',
  ])

  it('resolves @/ alias with src/ base', () => {
    const result = resolveAliasImport('@/lib/auth', indexedPaths)
    expect(result).toBeTruthy()
  })

  it('resolves @/ alias with app/ base', () => {
    const result = resolveAliasImport('@/components/Button', indexedPaths)
    expect(result).toBeTruthy()
  })

  it('resolves ~/ alias', () => {
    const result = resolveAliasImport('~/lib/auth', indexedPaths)
    expect(result).toBeTruthy()
  })

  it('returns null for non-alias import', () => {
    const result = resolveAliasImport('./relative', indexedPaths)
    expect(result).toBeNull()
  })

  it('returns null for unresolvable alias', () => {
    const result = resolveAliasImport('@/nonexistent/module', indexedPaths)
    expect(result).toBeNull()
  })
})

describe('EXT_TO_LANG', () => {
  it('maps .ts to typescript', () => {
    expect(EXT_TO_LANG['.ts']).toBe('typescript')
  })

  it('maps .py to python', () => {
    expect(EXT_TO_LANG['.py']).toBe('python')
  })
})

describe('CODE_EXTENSIONS', () => {
  it('includes common extensions', () => {
    expect(CODE_EXTENSIONS).toContain('.ts')
    expect(CODE_EXTENSIONS).toContain('.tsx')
    expect(CODE_EXTENSIONS).toContain('.js')
    expect(CODE_EXTENSIONS).toContain('.py')
    expect(CODE_EXTENSIONS).toContain('.go')
    expect(CODE_EXTENSIONS).toContain('.rs')
  })
})
