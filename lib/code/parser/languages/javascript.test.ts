import { extractJsImports } from '@/lib/code/parser/languages/javascript'

describe('extractJsImports', () => {
  const filePath = 'src/app.ts'
  const indexedPaths = new Set([
    'src/utils.ts',
    'src/helpers/index.ts',
    'src/components/Button.tsx',
    'lib/auth.ts',
    'src/lib/auth.ts',
  ])

  describe('ESM named imports', () => {
    it.each([
      {
        desc: 'single named import',
        code: `import { foo } from './utils'`,
        expected: { source: './utils', specifiers: ['foo'], isExternal: false, isDefault: false },
      },
      {
        desc: 'multiple named imports',
        code: `import { foo, bar, baz } from './utils'`,
        expected: { source: './utils', specifiers: ['foo', 'bar', 'baz'], isExternal: false, isDefault: false },
      },
      {
        desc: 'aliased named import strips alias',
        code: `import { foo as myFoo } from './utils'`,
        expected: { source: './utils', specifiers: ['foo'], isExternal: false, isDefault: false },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject(expected)
    })
  })

  describe('ESM default imports', () => {
    it('extracts default import', () => {
      const code = `import Button from './components/Button'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        source: './components/Button',
        specifiers: ['Button'],
        isDefault: true,
      })
    })

    it('extracts default + named import', () => {
      const code = `import React, { useState } from 'react'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        source: 'react',
        specifiers: expect.arrayContaining(['React', 'useState']),
        isExternal: true,
        isDefault: true,
      })
    })
  })

  describe('namespace imports', () => {
    it('extracts namespace import', () => {
      const code = `import * as utils from './utils'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        source: './utils',
        specifiers: ['utils'],
        isExternal: false,
      })
    })
  })

  describe('type imports', () => {
    it('extracts type import', () => {
      const code = `import type { UserType } from './utils'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0].source).toBe('./utils')
    })
  })

  describe('CommonJS require', () => {
    it.each([
      {
        desc: 'simple require',
        code: `const utils = require('./utils')`,
        expected: { source: './utils', specifiers: ['utils'], isDefault: true },
      },
      {
        desc: 'destructured require',
        code: `const { foo, bar } = require('./utils')`,
        expected: { source: './utils', specifiers: ['foo', 'bar'], isDefault: false },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject(expected)
    })
  })

  describe('re-exports', () => {
    it('extracts named re-export', () => {
      const code = `export { foo, bar } from './utils'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        source: './utils',
        isExternal: false,
        isDefault: false,
      })
    })

    it('extracts star re-export', () => {
      const code = `export * from './utils'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0].source).toBe('./utils')
    })
  })

  describe('alias imports (@/)', () => {
    it('resolves alias import', () => {
      const code = `import { auth } from '@/lib/auth'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        source: '@/lib/auth',
        isExternal: false,
        isDefault: false,
      })
      // Should resolve via one of the base paths
      expect(result[0].resolvedPath).toBeTruthy()
    })
  })

  describe('external packages', () => {
    it('marks npm packages as external', () => {
      const code = `import express from 'express'`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        source: 'express',
        isExternal: true,
        resolvedPath: null,
      })
    })
  })

  describe('deduplication', () => {
    it('deduplicates repeated imports from the same source', () => {
      const code = [
        `import { foo } from './utils'`,
        `import { bar } from './utils'`,
      ].join('\n')
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
    })
  })

  describe('mixed import styles', () => {
    it('handles file with multiple import types', () => {
      const code = [
        `import React from 'react'`,
        `import { useState } from 'react'`, // duplicate source — skipped
        `import { foo } from './utils'`,
        `const path = require('path')`,
        `export { bar } from './helpers'`,
      ].join('\n')
      const result = extractJsImports(code, filePath, indexedPaths)
      // react (deduped), ./utils, path, ./helpers
      expect(result).toHaveLength(4)
    })
  })

  describe('empty / no imports', () => {
    it('returns empty array for code without imports', () => {
      const code = `const x = 1;\nfunction add(a, b) { return a + b; }`
      const result = extractJsImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(0)
    })
  })
})
