import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/github-token', () => ({
  loadGitHubToken: vi.fn(),
  saveGitHubToken: vi.fn(),
  removeGitHubToken: vi.fn(),
}))

vi.mock('@/lib/github/client', () => ({
  setGitHubPAT: vi.fn(),
  clearGitHubCache: vi.fn(),
}))

// Suppress toast.error during tests
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

import { GitHubTokenProvider, useGitHubToken } from '../github-token-provider'
import { loadGitHubToken, saveGitHubToken, removeGitHubToken } from '@/lib/github-token'
import { setGitHubPAT, clearGitHubCache } from '@/lib/github/client'

const mockLoadGitHubToken = vi.mocked(loadGitHubToken)
const mockSaveGitHubToken = vi.mocked(saveGitHubToken)
const mockRemoveGitHubToken = vi.mocked(removeGitHubToken)
const mockSetGitHubPAT = vi.mocked(setGitHubPAT)
const mockClearGitHubCache = vi.mocked(clearGitHubCache)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: ReactNode }) {
  return <GitHubTokenProvider>{children}</GitHubTokenProvider>
}

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubTokenProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadGitHubToken.mockReturnValue(null)
  })

  // -----------------------------------------------------------------------
  // Hydration
  // -----------------------------------------------------------------------

  describe('hydration', () => {
    it('hydrates token from localStorage on mount', async () => {
      mockLoadGitHubToken.mockReturnValue('ghp_stored_token')

      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => {
        expect(result.current.isHydrated).toBe(true)
      })

      expect(result.current.token).toBe('ghp_stored_token')
      expect(mockLoadGitHubToken).toHaveBeenCalled()
    })

    it('calls setGitHubPAT during hydration when a stored token exists', async () => {
      mockLoadGitHubToken.mockReturnValue('ghp_stored_token')

      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => {
        expect(result.current.isHydrated).toBe(true)
      })

      expect(mockSetGitHubPAT).toHaveBeenCalledWith('ghp_stored_token')
    })

    it('sets isHydrated to true even when no token is stored', async () => {
      mockLoadGitHubToken.mockReturnValue(null)

      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => {
        expect(result.current.isHydrated).toBe(true)
      })

      expect(result.current.token).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // setToken
  // -----------------------------------------------------------------------

  describe('setToken', () => {
    it('persists token to localStorage and syncs to PAT module', async () => {
      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => expect(result.current.isHydrated).toBe(true))

      act(() => {
        result.current.setToken('ghp_new_token')
      })

      expect(result.current.token).toBe('ghp_new_token')
      expect(mockSaveGitHubToken).toHaveBeenCalledWith('ghp_new_token')
      expect(mockSetGitHubPAT).toHaveBeenCalledWith('ghp_new_token')
      expect(mockClearGitHubCache).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // validateToken
  // -----------------------------------------------------------------------

  describe('validateToken', () => {
    it('calls validation endpoint and updates state on success', async () => {
      mockLoadGitHubToken.mockReturnValue('ghp_valid')

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            valid: true,
            login: 'octocat',
            scopes: ['repo'],
          }),
      })

      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => expect(result.current.isHydrated).toBe(true))

      let validateResult: boolean
      await act(async () => {
        validateResult = await result.current.validateToken()
      })

      expect(validateResult!).toBe(true)
      expect(result.current.isValid).toBe(true)
      expect(result.current.username).toBe('octocat')
      expect(result.current.scopes).toEqual(['repo'])
    })

    it('sets isValid=false when validation returns valid=false', async () => {
      mockLoadGitHubToken.mockReturnValue('ghp_invalid')

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            valid: false,
            error: 'Invalid token',
          }),
      })

      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => expect(result.current.isHydrated).toBe(true))

      let validateResult: boolean
      await act(async () => {
        validateResult = await result.current.validateToken()
      })

      expect(validateResult!).toBe(false)
      expect(result.current.isValid).toBe(false)
      expect(result.current.username).toBeNull()
    })

    it('returns false when no token is set', async () => {
      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => expect(result.current.isHydrated).toBe(true))

      let validateResult: boolean
      await act(async () => {
        validateResult = await result.current.validateToken()
      })

      expect(validateResult!).toBe(false)
    })

    it('handles network errors gracefully', async () => {
      mockLoadGitHubToken.mockReturnValue('ghp_network_err')

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => expect(result.current.isHydrated).toBe(true))

      await act(async () => {
        await result.current.validateToken()
      })

      expect(result.current.isValid).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // removeToken
  // -----------------------------------------------------------------------

  describe('removeToken', () => {
    it('clears state, localStorage, and PAT module', async () => {
      mockLoadGitHubToken.mockReturnValue('ghp_to_remove')

      const { result } = renderHook(() => useGitHubToken(), { wrapper })

      await waitFor(() => expect(result.current.isHydrated).toBe(true))
      expect(result.current.token).toBe('ghp_to_remove')

      act(() => {
        result.current.removeToken()
      })

      expect(result.current.token).toBeNull()
      expect(result.current.isValid).toBeNull()
      expect(result.current.username).toBeNull()
      expect(result.current.scopes).toEqual([])
      expect(mockRemoveGitHubToken).toHaveBeenCalled()
      expect(mockSetGitHubPAT).toHaveBeenCalledWith(null)
      expect(mockClearGitHubCache).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // useGitHubToken outside provider
  // -----------------------------------------------------------------------

  it('throws when used outside GitHubTokenProvider', () => {
    // Suppress React error boundary noise in the test output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useGitHubToken())
    }).toThrow('useGitHubToken must be used within a GitHubTokenProvider')

    spy.mockRestore()
  })
})
