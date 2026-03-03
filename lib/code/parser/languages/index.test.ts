import { extractImports } from '@/lib/code/parser/languages'

describe('extractImports (dispatcher)', () => {
  const filePath = 'src/app.ts'
  const indexedPaths = new Set<string>()

  it.each([
    {
      lang: 'typescript',
      code: `import { foo } from 'bar'`,
      expectedSource: 'bar',
    },
    {
      lang: 'javascript',
      code: `import { foo } from 'bar'`,
      expectedSource: 'bar',
    },
    {
      lang: 'python',
      code: `from os import path`,
      expectedSource: 'os',
    },
    {
      lang: 'go',
      code: `import "fmt"`,
      expectedSource: 'fmt',
    },
    {
      lang: 'rust',
      code: `use serde::Serialize;`,
      expectedSource: 'serde::Serialize',
    },
    {
      lang: 'php',
      code: `use App\\Http\\Request;`,
      expectedSource: 'App\\Http\\Request',
    },
  ])('routes "$lang" to correct parser', ({ lang, code, expectedSource }) => {
    const result = extractImports(code, filePath, lang, indexedPaths)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe(expectedSource)
  })

  it('falls back to JS parser for unknown lang', () => {
    const code = `import { something } from 'somewhere'`
    const result = extractImports(code, filePath, 'unknown-lang', indexedPaths)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('somewhere')
  })

  it('returns empty for non-import code', () => {
    const code = `const x = 1`
    const result = extractImports(code, filePath, 'typescript', indexedPaths)
    expect(result).toHaveLength(0)
  })
})
