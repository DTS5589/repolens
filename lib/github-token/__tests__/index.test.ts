import { describe, it, expect, beforeEach } from 'vitest'
import { loadGitHubToken, saveGitHubToken, removeGitHubToken } from '../index'

describe('github-token storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing is stored', () => {
    expect(loadGitHubToken()).toBeNull()
  })

  it('save/load roundtrip returns the stored token', () => {
    saveGitHubToken('ghp_test123')
    expect(loadGitHubToken()).toBe('ghp_test123')
  })

  it('overwrites a previously stored token', () => {
    saveGitHubToken('ghp_first')
    saveGitHubToken('ghp_second')
    expect(loadGitHubToken()).toBe('ghp_second')
  })

  it('removeGitHubToken clears the stored value', () => {
    saveGitHubToken('ghp_test123')
    removeGitHubToken()
    expect(loadGitHubToken()).toBeNull()
  })

  it('removeGitHubToken is safe when nothing is stored', () => {
    expect(() => removeGitHubToken()).not.toThrow()
    expect(loadGitHubToken()).toBeNull()
  })
})
