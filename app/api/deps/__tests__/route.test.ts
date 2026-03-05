import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Schema-level tests — replicate the route's validation schema locally
// to test input validation without importing the route directly.
// ---------------------------------------------------------------------------

const NPM_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

const depsRequestSchema = z.object({
  packages: z
    .array(z.string().regex(NPM_NAME_REGEX).max(214))
    .min(1)
    .max(200),
})

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    packages: ['react'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------

describe('deps API — schema validation', () => {
  it('accepts a valid request with one package', () => {
    const result = depsRequestSchema.safeParse(validRequest())
    expect(result.success).toBe(true)
  })

  it('accepts a request with multiple packages', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: ['react', 'vue', 'next'] }),
    )
    expect(result.success).toBe(true)
  })

  it('accepts scoped package names', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: ['@types/react', '@babel/core'] }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects missing packages field', () => {
    const result = depsRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects empty packages array', () => {
    const result = depsRequestSchema.safeParse(validRequest({ packages: [] }))
    expect(result.success).toBe(false)
  })

  it('rejects packages array exceeding 200 entries', () => {
    const packages = Array.from({ length: 201 }, (_, i) => `pkg-${i}`)
    const result = depsRequestSchema.safeParse(validRequest({ packages }))
    expect(result.success).toBe(false)
  })

  it('accepts exactly 200 packages', () => {
    const packages = Array.from({ length: 200 }, (_, i) => `pkg-${i}`)
    const result = depsRequestSchema.safeParse(validRequest({ packages }))
    expect(result.success).toBe(true)
  })

  it('rejects path traversal attempt "../../../etc/passwd"', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: ['../../../etc/passwd'] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects SSRF-style package names with slashes', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: ['http://evil.com/pkg'] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects package names starting with uppercase', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: ['React'] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects package names with special characters', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: ['pkg!@#$'] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects non-string array elements', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: [123, true] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects package names exceeding 214 chars', () => {
    const longName = 'a'.repeat(215)
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: [longName] }),
    )
    expect(result.success).toBe(false)
  })

  it('accepts package names at exactly 214 chars', () => {
    const name = 'a'.repeat(214)
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: [name] }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects packages containing spaces', () => {
    const result = depsRequestSchema.safeParse(
      validRequest({ packages: ['my package'] }),
    )
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Route handler integration tests — test the actual POST handler
// ---------------------------------------------------------------------------

describe('deps API — POST handler', () => {
  let POST: (req: Request) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()

    // Mock global fetch for npm registry calls
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('registry.npmjs.org')) {
        if (url.includes('/latest')) {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                version: '19.0.0',
                description: 'A JS library for building UIs',
                license: 'MIT',
                maintainers: [{ name: 'fb' }],
                deprecated: false,
              }),
          }
        }
        // Abbreviated metadata for last-publish time
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              modified: '2026-03-01T00:00:00Z',
            }),
        }
      }

      if (typeof url === 'string' && url.includes('api.npmjs.org/downloads')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              downloads: [
                { day: '2026-03-04', downloads: 100000 },
                { day: '2026-03-05', downloads: 120000 },
              ],
            }),
        }
      }

      return { ok: false, status: 404 }
    })

    // Dynamically import route to pick up mocked fetch
    const mod = await import('../route')
    POST = mod.POST
  })

  it('returns 200 with results for valid request', async () => {
    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: ['react'] }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data).toHaveProperty('results')
    expect(data).toHaveProperty('errors')
    expect(data.results).toHaveProperty('react')
    expect(data.results.react.name).toBe('react')
  })

  it('returns 422 for empty packages array', async () => {
    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: [] }),
    })

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 for missing packages field', async () => {
    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'react' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 422 for path traversal package names', async () => {
    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: ['../../../etc/passwd'] }),
    })

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 for too many packages (>200)', async () => {
    const packages = Array.from({ length: 201 }, (_, i) => `pkg-${i}`)
    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages }),
    })

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('captures npm registry errors in the errors array', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Registry down'))

    // Re-import to pick up new mock
    vi.resetModules()
    const mod = await import('../route')
    POST = mod.POST

    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: ['react'] }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.errors.length).toBeGreaterThan(0)
    expect(Object.keys(data.results)).toHaveLength(0)
  })

  it('response shape includes results Record and errors array', async () => {
    const req = new Request('http://localhost/api/deps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages: ['react'] }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(typeof data.results).toBe('object')
    expect(Array.isArray(data.errors)).toBe(true)
  })
})
