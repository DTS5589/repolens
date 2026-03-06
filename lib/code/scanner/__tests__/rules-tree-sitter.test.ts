import { describe, it, expect } from 'vitest'
import {
  TREE_SITTER_RULES,
  getRulesForLanguage,
  getLanguagesWithRules,
} from '@/lib/code/scanner/rules-tree-sitter'
import type { TreeSitterRule } from '@/lib/code/scanner/rules-tree-sitter'

describe('TREE_SITTER_RULES', () => {
  it('exports a non-empty array of rules', () => {
    expect(TREE_SITTER_RULES.length).toBeGreaterThan(0)
  })

  it.each(TREE_SITTER_RULES.map(r => [r.id, r]))(
    'rule "%s" has all required fields',
    (_id, rule) => {
      const r = rule as TreeSitterRule
      expect(r.id).toBeTruthy()
      expect(r.category).toBeTruthy()
      expect(r.severity).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.description).toBeTruthy()
      expect(r.query).toBeTruthy()
      expect(r.languages).toBeInstanceOf(Array)
      expect(r.languages.length).toBeGreaterThan(0)
    },
  )

  it('has no duplicate rule IDs', () => {
    const ids = TREE_SITTER_RULES.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all rule IDs start with "ts-" prefix', () => {
    for (const rule of TREE_SITTER_RULES) {
      expect(rule.id).toMatch(/^ts-/)
    }
  })

  it('does not target JavaScript or TypeScript (covered by Babel)', () => {
    const jsLangs = new Set(['javascript', 'typescript', 'tsx'])
    for (const rule of TREE_SITTER_RULES) {
      for (const lang of rule.languages) {
        expect(jsLangs.has(lang)).toBe(false)
      }
    }
  })

  it('security rules have CWE and OWASP fields', () => {
    const securityRules = TREE_SITTER_RULES.filter(r => r.category === 'security')
    expect(securityRules.length).toBeGreaterThan(0)

    for (const rule of securityRules) {
      expect(rule.cwe).toBeTruthy()
      expect(rule.owasp).toBeTruthy()
    }
  })

  it.each(TREE_SITTER_RULES.map(r => [r.id, r]))(
    'rule "%s" has a valid S-expression query (non-empty, contains parentheses)',
    (_id, rule) => {
      const r = rule as TreeSitterRule
      expect(r.query.length).toBeGreaterThan(0)
      expect(r.query).toContain('(')
      expect(r.query).toContain(')')
    },
  )

  it('severity values are valid', () => {
    const validSeverities = new Set(['critical', 'warning', 'info'])
    for (const rule of TREE_SITTER_RULES) {
      expect(validSeverities.has(rule.severity)).toBe(true)
    }
  })

  it('category values are valid', () => {
    const validCategories = new Set(['security', 'bad-practice', 'reliability'])
    for (const rule of TREE_SITTER_RULES) {
      expect(validCategories.has(rule.category)).toBe(true)
    }
  })
})

describe('getRulesForLanguage', () => {
  it('returns Python rules', () => {
    const rules = getRulesForLanguage('python')
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.languages).toContain('python')
    }
  })

  it('returns Java rules', () => {
    const rules = getRulesForLanguage('java')
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.languages).toContain('java')
    }
  })

  it('returns Go rules', () => {
    const rules = getRulesForLanguage('go')
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.languages).toContain('go')
    }
  })

  it('returns Rust rules', () => {
    const rules = getRulesForLanguage('rust')
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.languages).toContain('rust')
    }
  })

  it('returns Ruby rules', () => {
    const rules = getRulesForLanguage('ruby')
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.languages).toContain('ruby')
    }
  })

  it('returns empty array for unsupported language', () => {
    expect(getRulesForLanguage('brainfuck')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(getRulesForLanguage('')).toEqual([])
  })

  it('does not return rules for languages not listed in the rule', () => {
    const pyRules = getRulesForLanguage('python')
    const javaRules = getRulesForLanguage('java')
    // Python-only rules should not appear in Java results
    const pyOnlyIds = pyRules
      .filter(r => !r.languages.includes('java'))
      .map(r => r.id)
    const javaIds = new Set(javaRules.map(r => r.id))
    for (const id of pyOnlyIds) {
      expect(javaIds.has(id)).toBe(false)
    }
  })
})

describe('getLanguagesWithRules', () => {
  it('returns a Set', () => {
    const langs = getLanguagesWithRules()
    expect(langs).toBeInstanceOf(Set)
  })

  it('includes expected languages', () => {
    const langs = getLanguagesWithRules()
    expect(langs.has('python')).toBe(true)
    expect(langs.has('java')).toBe(true)
    expect(langs.has('go')).toBe(true)
    expect(langs.has('rust')).toBe(true)
    expect(langs.has('ruby')).toBe(true)
  })

  it('does not include JS/TS', () => {
    const langs = getLanguagesWithRules()
    expect(langs.has('javascript')).toBe(false)
    expect(langs.has('typescript')).toBe(false)
    expect(langs.has('tsx')).toBe(false)
  })

  it('matches all languages referenced in TREE_SITTER_RULES', () => {
    const expected = new Set<string>()
    for (const rule of TREE_SITTER_RULES) {
      for (const lang of rule.languages) {
        expected.add(lang)
      }
    }
    expect(getLanguagesWithRules()).toEqual(expected)
  })
})
