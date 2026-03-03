import { describe, it, expect } from 'vitest'
import { authConfig } from './config'
import type { JWT } from 'next-auth/jwt'
import type { Session, Account } from 'next-auth'

// Extract callbacks for direct testing
const { jwt: jwtCallback, session: sessionCallback } = authConfig.callbacks!

describe('authConfig callbacks', () => {
  describe('jwt callback', () => {
    it('sets accessToken, githubUsername, and githubAvatar when account is present', () => {
      const token: JWT = { sub: 'user-1' }
      const account = {
        access_token: 'gho_abc123',
        provider: 'github',
        type: 'oauth',
        providerAccountId: '12345',
      } as Account
      const profile = {
        login: 'octocat',
        avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
      }

      const result = jwtCallback!({
        token,
        account,
        profile: profile as never,
        trigger: 'signIn',
      } as Parameters<typeof jwtCallback>[0])

      expect(result).toMatchObject({
        sub: 'user-1',
        accessToken: 'gho_abc123',
        githubUsername: 'octocat',
        githubAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
      })
    })

    it('passes token through unchanged when account is absent', () => {
      const token: JWT = {
        sub: 'user-1',
        accessToken: 'existing-token',
        githubUsername: 'octocat',
        githubAvatar: 'https://example.com/avatar.png',
      }

      const result = jwtCallback!({
        token,
        account: null,
        profile: undefined,
        trigger: 'update',
      } as Parameters<typeof jwtCallback>[0])

      expect(result).toEqual(token)
    })

    it('handles profile with missing fields gracefully', () => {
      const token: JWT = { sub: 'user-2' }
      const account = {
        access_token: 'gho_xyz',
        provider: 'github',
        type: 'oauth',
        providerAccountId: '99999',
      } as Account
      const profile = {} // no login or avatar_url

      const result = jwtCallback!({
        token,
        account,
        profile: profile as never,
        trigger: 'signIn',
      } as Parameters<typeof jwtCallback>[0])

      expect(result).toMatchObject({
        sub: 'user-2',
        accessToken: 'gho_xyz',
        githubUsername: undefined,
        githubAvatar: undefined,
      })
    })
  })

  describe('session callback', () => {
    it('populates session.user with githubUsername and githubAvatar from token', () => {
      const session = {
        user: { name: 'Octocat', email: 'octo@example.com' },
        expires: '2099-01-01T00:00:00.000Z',
      } as Session
      const token: JWT = {
        sub: 'user-1',
        accessToken: 'gho_secret',
        githubUsername: 'octocat',
        githubAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
      }

      const result = sessionCallback!({
        session,
        token,
      } as Parameters<typeof sessionCallback>[0])

      expect(result.user).toMatchObject({
        name: 'Octocat',
        githubUsername: 'octocat',
        githubAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
      })
    })

    it('sets undefined when token lacks github fields', () => {
      const session = {
        user: { name: 'Anon' },
        expires: '2099-01-01T00:00:00.000Z',
      } as Session
      const token: JWT = { sub: 'user-2' }

      const result = sessionCallback!({
        session,
        token,
      } as Parameters<typeof sessionCallback>[0])

      expect(result.user.githubUsername).toBeUndefined()
      expect(result.user.githubAvatar).toBeUndefined()
    })

    it('does not expose accessToken on the session', () => {
      const session = {
        user: { name: 'Octocat' },
        expires: '2099-01-01T00:00:00.000Z',
      } as Session
      const token: JWT = {
        sub: 'user-1',
        accessToken: 'gho_secret',
        githubUsername: 'octocat',
        githubAvatar: 'https://example.com/avatar.png',
      }

      const result = sessionCallback!({
        session,
        token,
      } as Parameters<typeof sessionCallback>[0])

      expect(result).not.toHaveProperty('accessToken')
      expect(result.user).not.toHaveProperty('accessToken')
    })
  })
})

describe('authConfig structure', () => {
  it('uses JWT session strategy', () => {
    expect(authConfig.session?.strategy).toBe('jwt')
  })

  it('has exactly one provider configured', () => {
    expect(authConfig.providers).toHaveLength(1)
  })
})
