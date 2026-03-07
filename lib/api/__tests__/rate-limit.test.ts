import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { rateLimit, getClientIp, applyRateLimit, _resetStore } from '../rate-limit'
import { NextRequest } from 'next/server'

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/test', { headers })
}

describe('rateLimit', () => {
  beforeEach(() => {
    _resetStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests within the limit', () => {
    const result1 = rateLimit('1.2.3.4', { limit: 5, windowMs: 60_000 })
    expect(result1.allowed).toBe(true)
    expect(result1.remaining).toBe(4)

    const result2 = rateLimit('1.2.3.4', { limit: 5, windowMs: 60_000 })
    expect(result2.allowed).toBe(true)
    expect(result2.remaining).toBe(3)
  })

  it('blocks requests exceeding the limit', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('1.2.3.4', { limit: 3, windowMs: 60_000 })
    }

    const blocked = rateLimit('1.2.3.4', { limit: 3, windowMs: 60_000 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('resets after the window expires', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('1.2.3.4', { limit: 3, windowMs: 10_000 })
    }

    const blocked = rateLimit('1.2.3.4', { limit: 3, windowMs: 10_000 })
    expect(blocked.allowed).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(11_000)

    const afterReset = rateLimit('1.2.3.4', { limit: 3, windowMs: 10_000 })
    expect(afterReset.allowed).toBe(true)
    expect(afterReset.remaining).toBe(2)
  })

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('1.1.1.1', { limit: 3, windowMs: 60_000 })
    }

    const blockedA = rateLimit('1.1.1.1', { limit: 3, windowMs: 60_000 })
    expect(blockedA.allowed).toBe(false)

    const allowedB = rateLimit('2.2.2.2', { limit: 3, windowMs: 60_000 })
    expect(allowedB.allowed).toBe(true)
    expect(allowedB.remaining).toBe(2)
  })

  it('uses default limit and window when no options provided', () => {
    const result = rateLimit('3.3.3.3')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(59) // default limit is 60
  })
})

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const req = makeRequest({ 'x-forwarded-for': '10.0.0.1, 192.168.1.1' })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  it('falls back to x-real-ip header', () => {
    const req = makeRequest({ 'x-real-ip': '10.0.0.5' })
    expect(getClientIp(req)).toBe('10.0.0.5')
  })

  it('falls back to 127.0.0.1 when no headers present', () => {
    const req = makeRequest()
    expect(getClientIp(req)).toBe('127.0.0.1')
  })
})

describe('applyRateLimit', () => {
  beforeEach(() => {
    _resetStore()
  })

  it('returns null when request is allowed', () => {
    const req = makeRequest({ 'x-forwarded-for': '5.5.5.5' })
    const result = applyRateLimit(req, { limit: 10 })
    expect(result).toBeNull()
  })

  it('returns a 429 response with Retry-After when limit exceeded', () => {
    const req = makeRequest({ 'x-forwarded-for': '6.6.6.6' })

    for (let i = 0; i < 2; i++) {
      applyRateLimit(req, { limit: 2 })
    }

    const blocked = applyRateLimit(req, { limit: 2 })
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get('Retry-After')).toBeTruthy()
    expect(blocked!.headers.get('X-RateLimit-Remaining')).toBe('0')
  })
})
