import { describe, it, expect } from 'vitest'
import type {
  GitHubTag,
  GitHubBranch,
  GitHubCommit,
  GitHubComparison,
  GitHubComparisonFile,
} from '../repository'

// ---------------------------------------------------------------------------
// Type-level verification: these tests confirm our types accept valid data
// and the shapes we construct at runtime match the interface contracts.
// ---------------------------------------------------------------------------

describe('GitHubTag type', () => {
  it('can be constructed with all required fields', () => {
    const tag: GitHubTag = {
      name: 'v1.0.0',
      commitSha: 'abc1234567890',
      commitUrl: 'https://api.github.com/repos/owner/repo/commits/abc1234567890',
      tarballUrl: 'https://api.github.com/repos/owner/repo/tarball/v1.0.0',
      zipballUrl: 'https://api.github.com/repos/owner/repo/zipball/v1.0.0',
    }

    expect(tag.name).toBe('v1.0.0')
    expect(tag.commitSha).toBe('abc1234567890')
    expect(tag.commitUrl).toContain('commits')
    expect(tag.tarballUrl).toContain('tarball')
    expect(tag.zipballUrl).toContain('zipball')
  })
})

describe('GitHubBranch type', () => {
  it('can be constructed with all required fields', () => {
    const branch: GitHubBranch = {
      name: 'main',
      commitSha: 'def4567890123',
      isProtected: true,
    }

    expect(branch.name).toBe('main')
    expect(branch.commitSha).toBe('def4567890123')
    expect(branch.isProtected).toBe(true)
  })

  it('accepts unprotected branches', () => {
    const branch: GitHubBranch = {
      name: 'feature/new-thing',
      commitSha: 'aaa1111',
      isProtected: false,
    }

    expect(branch.isProtected).toBe(false)
  })
})

describe('GitHubCommit type', () => {
  it('can be constructed with all required fields', () => {
    const commit: GitHubCommit = {
      sha: 'abc123def456',
      message: 'feat: add changelog feature',
      authorName: 'John Doe',
      authorEmail: 'john@example.com',
      authorDate: '2025-01-15T10:30:00Z',
      committerName: 'GitHub',
      committerDate: '2025-01-15T10:30:00Z',
      url: 'https://api.github.com/repos/owner/repo/commits/abc123def456',
      authorLogin: 'johndoe',
      authorAvatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      parents: [{ sha: 'parent123' }],
    }

    expect(commit.sha).toBe('abc123def456')
    expect(commit.message).toBe('feat: add changelog feature')
    expect(commit.authorName).toBe('John Doe')
    expect(commit.parents).toHaveLength(1)
  })

  it('accepts null author login and avatar for unauthenticated commits', () => {
    const commit: GitHubCommit = {
      sha: 'xyz789',
      message: 'chore: update deps',
      authorName: 'Bot',
      authorEmail: 'bot@noreply.github.com',
      authorDate: '2025-01-15T10:30:00Z',
      committerName: 'Bot',
      committerDate: '2025-01-15T10:30:00Z',
      url: 'https://api.github.com/repos/owner/repo/commits/xyz789',
      authorLogin: null,
      authorAvatarUrl: null,
      parents: [],
    }

    expect(commit.authorLogin).toBeNull()
    expect(commit.authorAvatarUrl).toBeNull()
    expect(commit.parents).toHaveLength(0)
  })
})

describe('GitHubComparison type', () => {
  it('can be constructed with all required fields', () => {
    const file: GitHubComparisonFile = {
      filename: 'src/index.ts',
      status: 'modified',
      additions: 10,
      deletions: 5,
      changes: 15,
      patch: '@@ -1,5 +1,10 @@\n+new line',
    }

    const comparison: GitHubComparison = {
      status: 'ahead',
      aheadBy: 3,
      behindBy: 0,
      totalCommits: 3,
      commits: [],
      files: [file],
    }

    expect(comparison.status).toBe('ahead')
    expect(comparison.aheadBy).toBe(3)
    expect(comparison.behindBy).toBe(0)
    expect(comparison.totalCommits).toBe(3)
    expect(comparison.files).toHaveLength(1)
    expect(comparison.files[0].filename).toBe('src/index.ts')
  })

  it('handles file without patch', () => {
    const file: GitHubComparisonFile = {
      filename: 'image.png',
      status: 'added',
      additions: 0,
      deletions: 0,
      changes: 0,
    }

    expect(file.patch).toBeUndefined()
  })
})
