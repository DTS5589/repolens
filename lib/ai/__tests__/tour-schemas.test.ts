import { describe, it, expect } from 'vitest'
import { generateTourSchema } from '../tour-schemas'

// ---------------------------------------------------------------------------
// generateTourSchema validation
// ---------------------------------------------------------------------------

describe('generateTourSchema', () => {
  it('accepts valid input with only repoKey', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo' })
    expect(result.success).toBe(true)
  })

  it('accepts valid input with repoKey, theme, and maxStops', () => {
    const result = generateTourSchema.safeParse({
      repoKey: 'owner/repo',
      theme: 'authentication flow',
      maxStops: 10,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.repoKey).toBe('owner/repo')
      expect(result.data.theme).toBe('authentication flow')
      expect(result.data.maxStops).toBe(10)
    }
  })

  it('rejects input with missing repoKey', () => {
    const result = generateTourSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects input with repoKey as number', () => {
    const result = generateTourSchema.safeParse({ repoKey: 123 })
    expect(result.success).toBe(false)
  })

  it('rejects maxStops below 2', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo', maxStops: 1 })
    expect(result.success).toBe(false)
  })

  it('rejects maxStops above 30', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo', maxStops: 31 })
    expect(result.success).toBe(false)
  })

  it('accepts maxStops at boundary value 2', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo', maxStops: 2 })
    expect(result.success).toBe(true)
  })

  it('accepts maxStops at boundary value 30', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo', maxStops: 30 })
    expect(result.success).toBe(true)
  })

  it('defaults maxStops to 8 when omitted', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.maxStops).toBe(8)
    }
  })

  it('rejects non-integer maxStops', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo', maxStops: 5.5 })
    expect(result.success).toBe(false)
  })

  it('theme is optional and undefined when omitted', () => {
    const result = generateTourSchema.safeParse({ repoKey: 'owner/repo' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.theme).toBeUndefined()
    }
  })
})
