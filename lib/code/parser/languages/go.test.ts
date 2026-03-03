import { extractGoImports } from '@/lib/code/parser/languages/go'

describe('extractGoImports', () => {
  const filePath = 'cmd/server/main.go'
  const indexedPaths = new Set([
    'internal/auth/auth.go',
    'pkg/utils/utils.go',
  ])

  describe('single import statements', () => {
    it.each([
      {
        desc: 'standard library import',
        code: `import "fmt"`,
        expected: { source: 'fmt', specifiers: ['fmt'], isExternal: true, isDefault: false },
      },
      {
        desc: 'nested stdlib import',
        code: `import "net/http"`,
        expected: { source: 'net/http', specifiers: ['http'], isExternal: true, isDefault: false },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractGoImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject(expected)
    })
  })

  describe('block import statements', () => {
    it('extracts all imports from block', () => {
      const code = `import (
  "fmt"
  "net/http"
  "os"
)`
      const result = extractGoImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(3)
      expect(result.map(r => r.source)).toEqual(['fmt', 'net/http', 'os'])
    })

    it('handles aliased imports in block', () => {
      const code = `import (
  myfmt "fmt"
  "os"
)`
      const result = extractGoImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(2)
      expect(result[0].source).toBe('fmt')
    })

    it('handles blank lines and comments in block', () => {
      const code = `import (
  "fmt"

  // third-party
  "github.com/gin-gonic/gin"
)`
      const result = extractGoImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(2)
    })
  })

  describe('deduplication', () => {
    it('does not duplicate same import', () => {
      const code = [
        `import "fmt"`,
        `import "fmt"`,
      ].join('\n')
      const result = extractGoImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('returns empty for code without imports', () => {
      const code = `package main\n\nfunc main() { println("hello") }`
      const result = extractGoImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(0)
    })

    it('handles mixed single and block imports', () => {
      const code = [
        `import "fmt"`,
        `import (`,
        `  "os"`,
        `  "net/http"`,
        `)`,
      ].join('\n')
      const result = extractGoImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(3)
    })
  })
})
