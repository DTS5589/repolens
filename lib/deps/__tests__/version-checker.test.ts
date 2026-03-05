import { describe, it, expect } from 'vitest'
import { parseSemver, compareVersions, isOutdated } from '../version-checker'

// ---------------------------------------------------------------------------
// parseSemver
// ---------------------------------------------------------------------------

describe('parseSemver', () => {
  it.each([
    { input: '1.2.3', expected: { major: 1, minor: 2, patch: 3 } },
    { input: '0.0.1', expected: { major: 0, minor: 0, patch: 1 } },
    { input: '10.20.30', expected: { major: 10, minor: 20, patch: 30 } },
    { input: '0.0.0', expected: { major: 0, minor: 0, patch: 0 } },
  ])('parses "$input" → $expected', ({ input, expected }) => {
    expect(parseSemver(input)).toEqual(expected)
  })

  it.each([
    { input: '^1.2.3', expected: { major: 1, minor: 2, patch: 3 } },
    { input: '~4.5.6', expected: { major: 4, minor: 5, patch: 6 } },
    { input: '>=2.0.0', expected: { major: 2, minor: 0, patch: 0 } },
    { input: '<=3.1.0', expected: { major: 3, minor: 1, patch: 0 } },
    { input: '>1.0.0', expected: { major: 1, minor: 0, patch: 0 } },
    { input: '<5.0.0', expected: { major: 5, minor: 0, patch: 0 } },
    { input: '=1.0.0', expected: { major: 1, minor: 0, patch: 0 } },
  ])('strips range prefix "$input"', ({ input, expected }) => {
    expect(parseSemver(input)).toEqual(expected)
  })

  it('strips pre-release suffix "1.2.3-beta.1"', () => {
    expect(parseSemver('1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  it('strips build metadata "1.2.3+build.456"', () => {
    expect(parseSemver('1.2.3+build.456')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  it('strips both pre-release and build metadata "1.2.3-rc.1+sha.abc"', () => {
    expect(parseSemver('1.2.3-rc.1+sha.abc')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  it('handles complex range ">=1.0.0 <2.0.0" by taking the first part', () => {
    expect(parseSemver('>=1.0.0 <2.0.0')).toEqual({ major: 1, minor: 0, patch: 0 })
  })

  it('handles partial versions like "1.2" as {1,2,0}', () => {
    expect(parseSemver('1.2')).toEqual({ major: 1, minor: 2, patch: 0 })
  })

  it('handles partial version "1" as {1,0,0}', () => {
    expect(parseSemver('1')).toEqual({ major: 1, minor: 0, patch: 0 })
  })

  it.each([
    { input: 'not-a-version' },
    { input: '' },
    { input: 'latest' },
    { input: '*' },
    { input: 'workspace:*' },
  ])('returns null for invalid input "$input"', ({ input }) => {
    expect(parseSemver(input)).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    expect(parseSemver(null as unknown as string)).toBeNull()
    expect(parseSemver(undefined as unknown as string)).toBeNull()
  })

  it('trims whitespace around the version string', () => {
    expect(parseSemver('  1.0.0  ')).toEqual({ major: 1, minor: 0, patch: 0 })
  })
})

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------

describe('compareVersions', () => {
  it('returns "major" when major differs', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe('major')
  })

  it('returns "major" when major differs significantly', () => {
    expect(compareVersions('1.5.9', '3.2.1')).toBe('major')
  })

  it('returns "minor" when only minor differs', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe('minor')
  })

  it('returns "minor" when minor differs with same patch', () => {
    expect(compareVersions('1.2.5', '1.4.5')).toBe('minor')
  })

  it('returns "patch" when only patch differs', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe('patch')
  })

  it('returns "patch" for larger patch difference', () => {
    expect(compareVersions('1.0.0', '1.0.10')).toBe('patch')
  })

  it('returns null when versions are equal', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBeNull()
  })

  it('returns null when current is ahead of latest (no regression detection)', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeNull()
  })

  it('returns null when current version is unparseable', () => {
    expect(compareVersions('not-a-version', '1.0.0')).toBeNull()
  })

  it('returns null when latest version is unparseable', () => {
    expect(compareVersions('1.0.0', 'latest')).toBeNull()
  })

  it('returns null when both are unparseable', () => {
    expect(compareVersions('abc', 'xyz')).toBeNull()
  })

  it('handles range prefixes in current version', () => {
    expect(compareVersions('^1.0.0', '2.0.0')).toBe('major')
  })
})

// ---------------------------------------------------------------------------
// isOutdated
// ---------------------------------------------------------------------------

describe('isOutdated', () => {
  it('returns true when current is behind latest (major)', () => {
    expect(isOutdated('1.0.0', '2.0.0')).toBe(true)
  })

  it('returns true when current is behind latest (minor)', () => {
    expect(isOutdated('1.0.0', '1.1.0')).toBe(true)
  })

  it('returns true when current is behind latest (patch)', () => {
    expect(isOutdated('1.0.0', '1.0.1')).toBe(true)
  })

  it('returns false when versions are equal', () => {
    expect(isOutdated('1.0.0', '1.0.0')).toBe(false)
  })

  it('returns false when current is ahead of latest', () => {
    expect(isOutdated('3.0.0', '2.0.0')).toBe(false)
  })

  it('returns false when versions are unparseable', () => {
    expect(isOutdated('invalid', 'also-invalid')).toBe(false)
  })
})
