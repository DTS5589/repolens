import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next-auth/jwt before importing our module
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}))

import { getAccessToken } from './token'
import { getToken } from 'next-auth/jwt'

const mockGetToken = vi.mocked(getToken)

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the access token when the user is authenticated', async () => {
    mockGetToken.mockResolvedValue({
      accessToken: 'gho_abc123',
      sub: 'user-1',
    } as Awaited<ReturnType<typeof getToken>>)

    const mockRequest = {} as Parameters<typeof getAccessToken>[0]
    const result = await getAccessToken(mockRequest)

    expect(result).toBe('gho_abc123')
    expect(mockGetToken).toHaveBeenCalledWith({
      req: mockRequest,
      secret: process.env.NEXTAUTH_SECRET,
    })
  })

  it('returns undefined when no token is available', async () => {
    mockGetToken.mockResolvedValue(null)

    const mockRequest = {} as Parameters<typeof getAccessToken>[0]
    const result = await getAccessToken(mockRequest)

    expect(result).toBeUndefined()
  })

  it('returns undefined when token has no accessToken field', async () => {
    mockGetToken.mockResolvedValue({
      sub: 'user-2',
    } as Awaited<ReturnType<typeof getToken>>)

    const mockRequest = {} as Parameters<typeof getAccessToken>[0]
    const result = await getAccessToken(mockRequest)

    expect(result).toBeUndefined()
  })
})
