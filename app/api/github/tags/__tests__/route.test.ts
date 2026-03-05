import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — set up before importing the route
// ---------------------------------------------------------------------------

const mockGetAccessToken = vi.fn()
const mockFetchTags = vi.fn()

vi.mock('@/lib/auth/token', () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
}))

vi.mock('@/lib/github/fetcher', () => ({
  fetchTags: (...args: unknown[]) => mockFetchTags(...args),
}))

vi.mock('@/lib/api/error', () => ({
  apiError: (code: string, message: string, status: number) => {
    return Response.json(
      { error: { code, message } },
      { status },
    )
  },
}))

import { GET } from '@/app/api/github/tags/route'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/github/tags')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new NextRequest(url)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/github/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAccessToken.mockResolvedValue('mock-token')
  })

  it('returns tags for a valid request', async () => {
    const mockTags = [
      { name: 'v1.0.0', commitSha: 'abc123', commitUrl: '', tarballUrl: '', zipballUrl: '' },
      { name: 'v2.0.0', commitSha: 'def456', commitUrl: '', tarballUrl: '', zipballUrl: '' },
    ]
    mockFetchTags.mockResolvedValue(mockTags)

    const req = createRequest({ owner: 'facebook', name: 'react' })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(mockTags)
    expect(mockFetchTags).toHaveBeenCalledWith('facebook', 'react', expect.objectContaining({
      token: 'mock-token',
    }))
  })

  it('returns 400 when owner is missing', async () => {
    const req = createRequest({ name: 'react' })
    const res = await GET(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when name is missing', async () => {
    const req = createRequest({ owner: 'facebook' })
    const res = await GET(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('passes per_page and page when provided', async () => {
    mockFetchTags.mockResolvedValue([])

    const req = createRequest({ owner: 'owner', name: 'repo', per_page: '50', page: '2' })
    await GET(req)

    expect(mockFetchTags).toHaveBeenCalledWith('owner', 'repo', expect.objectContaining({
      perPage: 50,
      page: 2,
    }))
  })

  it('returns 500 when GitHub API throws', async () => {
    mockFetchTags.mockRejectedValue(new Error('GitHub API is down'))

    const req = createRequest({ owner: 'owner', name: 'repo' })
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).toBe('GitHub API is down')
  })

  it('returns 404 when repo not found', async () => {
    mockFetchTags.mockRejectedValue(new Error('Repository not found'))

    const req = createRequest({ owner: 'owner', name: 'missing' })
    const res = await GET(req)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('REPO_NOT_FOUND')
  })

  it('returns 403 on rate limit', async () => {
    mockFetchTags.mockRejectedValue(new Error('Rate limit exceeded'))

    const req = createRequest({ owner: 'owner', name: 'repo' })
    const res = await GET(req)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('RATE_LIMIT')
  })
})
