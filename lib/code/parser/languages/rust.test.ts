import { extractRustImports } from '@/lib/code/parser/languages/rust'

describe('extractRustImports', () => {
  const filePath = 'src/main.rs'
  const indexedPaths = new Set([
    'src/auth.rs',
    'src/utils.rs',
    'src/models/user.rs',
  ])

  describe('use declarations', () => {
    it.each([
      {
        desc: 'crate-relative use',
        code: `use crate::auth;`,
        expected: { source: 'crate::auth', isExternal: false, isDefault: false },
      },
      {
        desc: 'super-relative use',
        code: `use super::utils;`,
        expected: { source: 'super::utils', isExternal: false, isDefault: false },
      },
      {
        desc: 'self-relative use',
        code: `use self::models;`,
        expected: { source: 'self::models', isExternal: false, isDefault: false },
      },
      {
        desc: 'external crate use',
        code: `use serde::Serialize;`,
        expected: { source: 'serde::Serialize', isExternal: true, isDefault: false },
      },
      {
        desc: 'crate use with nested path',
        code: `use crate::models::user;`,
        expected: { source: 'crate::models::user', isExternal: false, isDefault: false },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractRustImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject(expected)
    })
  })

  describe('use with braces', () => {
    it('extracts crate use with braces', () => {
      const code = `use crate::models::{User, Role};`
      const result = extractRustImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0].source).toBe('crate::models::{User, Role}')
      expect(result[0].isExternal).toBe(false)
    })
  })

  describe('mod statements', () => {
    it.each([
      {
        desc: 'simple mod declaration',
        code: `mod auth;`,
        expected: { source: 'auth', specifiers: ['auth'], isExternal: false },
      },
      {
        desc: 'another mod declaration',
        code: `mod utils;`,
        expected: { source: 'utils', specifiers: ['utils'], isExternal: false },
      },
    ])('$desc', ({ code, expected }) => {
      const result = extractRustImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject(expected)
    })
  })

  describe('deduplication', () => {
    it('deduplicates same use statement', () => {
      const code = [
        `use crate::auth;`,
        `use crate::auth;`,
      ].join('\n')
      const result = extractRustImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('returns empty for code without imports', () => {
      const code = `fn main() { println!("hello"); }`
      const result = extractRustImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(0)
    })

    it('handles mixed use and mod statements', () => {
      const code = [
        `use crate::auth;`,
        `use serde::Serialize;`,
        `mod utils;`,
      ].join('\n')
      const result = extractRustImports(code, filePath, indexedPaths)
      expect(result).toHaveLength(3)
    })
  })
})
