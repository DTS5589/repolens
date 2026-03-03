import { extractPhpImports } from '@/lib/code/parser/languages/php'

describe('extractPhpImports', () => {
  const filePath = 'src/Controller/HomeController.php'
  const indexedPaths = new Set([
    'src/Service/AuthService.php',
    'src/helpers.php',
  ])

  describe('use statements', () => {
    it.each([
      {
        desc: 'simple namespace use',
        code: `use App\\Service\\AuthService;`,
        expected: { source: 'App\\Service\\AuthService', specifiers: ['AuthService'], isExternal: true, resolvedPath: null },
      },
      {
        desc: 'use with alias',
        code: `use App\\Models\\User as UserModel;`,
        expected: { source: 'App\\Models\\User', specifiers: ['User'], isExternal: true },
      },
      {
        desc: 'deep namespace',
        code: `use Illuminate\\Http\\Request;`,
        expected: { source: 'Illuminate\\Http\\Request', specifiers: ['Request'], isExternal: true },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractPhpImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject(expected)
    })
  })

  describe('require/include statements', () => {
    it.each([
      {
        desc: 'require_once with path',
        code: `require_once '../helpers.php';`,
        expected: { source: '../helpers.php', isDefault: false },
      },
      {
        desc: 'include with path',
        code: `include 'config.php';`,
        expected: { source: 'config.php', isDefault: false },
      },
      {
        desc: 'require with parens',
        code: `require('vendor/autoload.php');`,
        expected: { source: 'vendor/autoload.php' },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractPhpImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject(expected)
    })
  })

  describe('deduplication', () => {
    it('deduplicates same use statement', () => {
      const code = [
        `use App\\Service\\AuthService;`,
        `use App\\Service\\AuthService;`,
      ].join('\n')
      const result = extractPhpImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('returns empty for code without imports', () => {
      const code = `<?php\nfunction hello() { echo "hello"; }`
      const result = extractPhpImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(0)
    })

    it('handles mixed use and require', () => {
      const code = [
        `use App\\Service\\AuthService;`,
        `require_once 'config.php';`,
      ].join('\n')
      const result = extractPhpImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(2)
    })
  })
})
