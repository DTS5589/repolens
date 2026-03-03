import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
  useSession: vi.fn(),
}))

import { useSession } from 'next-auth/react'
import { UserMenu } from './user-menu'

const mockUseSession = vi.mocked(useSession)

describe('UserMenu', () => {
  it('renders nothing when there is no session', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    })

    const { container } = render(<UserMenu />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the user avatar when githubAvatar is present', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'Octocat',
          githubUsername: 'octocat',
          githubAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
        },
        expires: '2099-01-01',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<UserMenu />)
    const avatar = screen.getByAltText('octocat')
    expect(avatar).toBeInTheDocument()
    expect(avatar).toHaveAttribute(
      'src',
      'https://avatars.githubusercontent.com/u/1?v=4',
    )
  })

  it('renders fallback icon when githubAvatar is absent', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'Anon',
          githubUsername: undefined,
          githubAvatar: undefined,
        },
        expires: '2099-01-01',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<UserMenu />)
    // No img element, just the fallback icon button
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
