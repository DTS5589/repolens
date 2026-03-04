import { shannonEntropy, isLikelyRealSecret } from '@/lib/code/scanner/entropy'

describe('shannonEntropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0)
  })

  it('returns 0 for single repeated character', () => {
    expect(shannonEntropy('aaaa')).toBe(0)
  })

  it('returns 2.0 for 4-char uniform distribution "abcd"', () => {
    // Each character has probability 0.25, so entropy = -4 * (0.25 * log2(0.25)) = 2.0
    expect(shannonEntropy('abcd')).toBeCloseTo(2.0, 5)
  })

  it('returns approximately 3.27 for "password123"', () => {
    const entropy = shannonEntropy('password123')
    expect(entropy).toBeGreaterThanOrEqual(3.17)
    expect(entropy).toBeLessThanOrEqual(3.37)
  })

  it('returns high entropy (> 4.0) for random-looking string', () => {
    // A string with many unique characters
    const randomStr = 'a8f3K2m9X7v1B3q5W2e4Z6'
    expect(shannonEntropy(randomStr)).toBeGreaterThan(4.0)
  })

  it('returns 1.0 for a 2-char alphabet evenly distributed', () => {
    // "aabb" → each char has p=0.5, entropy = 1.0
    expect(shannonEntropy('aabb')).toBeCloseTo(1.0, 5)
  })

  it('returns higher entropy for more diverse strings', () => {
    const low = shannonEntropy('aaaaabbb')
    const high = shannonEntropy('abcdefgh')
    expect(high).toBeGreaterThan(low)
  })
})

describe('isLikelyRealSecret', () => {
  it('returns true for real-looking API key', () => {
    expect(isLikelyRealSecret('sk-proj-a8f3k2m9x7v1b3q5')).toBe(true)
  })

  it('returns false for low-entropy common password', () => {
    expect(isLikelyRealSecret('password123')).toBe(false)
  })

  it('returns false for placeholder "changeme"', () => {
    expect(isLikelyRealSecret('changeme')).toBe(false)
  })

  it('returns false for short string (< 8 chars)', () => {
    expect(isLikelyRealSecret('abc')).toBe(false)
  })

  it('returns false for "your-api-key-here" placeholder', () => {
    expect(isLikelyRealSecret('your-api-key-here')).toBe(false)
  })

  it('returns false for "TODO: add real key" placeholder', () => {
    expect(isLikelyRealSecret('TODO: add real key')).toBe(false)
  })

  it('returns false for "test_placeholder" pattern', () => {
    expect(isLikelyRealSecret('test_placeholder')).toBe(false)
  })

  it('returns false for "example_value_here"', () => {
    expect(isLikelyRealSecret('example_value_here')).toBe(false)
  })

  it('returns true for high-entropy real token', () => {
    // Mimics a real hex token
    expect(isLikelyRealSecret('a1b2c3d4e5f6g7h8i9j0k1l2m3n4')).toBe(true)
  })

  it('returns false for "xxxxxxxx" repeated chars', () => {
    expect(isLikelyRealSecret('xxxxxxxx')).toBe(false)
  })

  it('respects custom threshold parameter', () => {
    // "password123" has ~3.27 entropy, below default 3.5 but above 3.0
    expect(isLikelyRealSecret('password123', 3.0)).toBe(true)
    expect(isLikelyRealSecret('password123', 3.5)).toBe(false)
  })
})
