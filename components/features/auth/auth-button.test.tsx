import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
}))

// Mock the GitHub token provider
vi.mock('@/providers/github-token-provider', () => ({
  useGitHubToken: () => ({
    token: null,
    isValid: null,
    isValidating: false,
    isHydrated: true,
    username: null,
    scopes: [],
    setToken: vi.fn(),
    validateToken: vi.fn(),
    removeToken: vi.fn(),
  }),
}))

import { useSession } from 'next-auth/react'
import { AuthButton } from './auth-button'

const mockUseSession = vi.mocked(useSession)

describe('AuthButton', () => {
  it('renders a disabled button while loading', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'loading',
      update: vi.fn(),
    })

    render(<AuthButton />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })

  it('shows sign in text when unauthenticated', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    })

    render(<AuthButton />)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('shows sign out text when authenticated', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { name: 'Octocat', email: 'octo@example.com' },
        expires: '2099-01-01',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<AuthButton />)
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })
})
