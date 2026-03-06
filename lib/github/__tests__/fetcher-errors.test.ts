import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the parser module
vi.mock('../parser', () => ({
  buildRepoApiUrl: (owner: string, repo: string) =>
    `https://api.github.com/repos/${owner}/${repo}`,
  buildTreeApiUrl: vi.fn(),
  buildRawContentUrl: vi.fn(),
}))

// Mock the graphql module
vi.mock('../graphql', () => ({
  githubGraphQL: vi.fn(),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { fetchRepoMetadata } from '../fetcher'

describe('fetcher error messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws with "add a GitHub token in Settings" for 404 responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    await expect(fetchRepoMetadata('owner', 'private-repo')).rejects.toThrow(
      'add a GitHub token in Settings',
    )
  })

  it('throws with "add a GitHub Personal Access Token in Settings" for 403 responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    })

    await expect(fetchRepoMetadata('owner', 'repo')).rejects.toThrow(
      'add a GitHub Personal Access Token in Settings',
    )
  })

  it('does NOT mention "is public" in the 404 error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    await expect(fetchRepoMetadata('owner', 'repo')).rejects.not.toThrow(
      'is public',
    )
  })

  it('throws generic error for other status codes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(fetchRepoMetadata('owner', 'repo')).rejects.toThrow(
      'Failed to fetch repository',
    )
  })
})
