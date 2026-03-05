import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComparisonRepo } from '@/types/comparison'

let mockRepoList: ComparisonRepo[] = []

vi.mock('@/providers/comparison-provider', () => ({
  useComparison: () => ({
    getRepoList: () => mockRepoList,
  }),
}))

vi.mock('@/lib/compare/dependency-utils', () => ({
  compareDependencies: vi.fn(() => ({
    shared: [
      { name: 'react', versions: { 'facebook/react': '^18.0.0', 'vercel/next.js': '^18.2.0' } },
      { name: 'typescript', versions: { 'facebook/react': '^5.0.0', 'vercel/next.js': '^5.1.0' } },
    ],
    unique: {
      'facebook/react': ['react-dom', 'scheduler'],
      'vercel/next.js': ['next', 'postcss'],
    },
  })),
}))

import { DependencyOverlap } from '../dependency-overlap'

function createRepo(overrides: Partial<ComparisonRepo> = {}): ComparisonRepo {
  return {
    id: 'owner/repo',
    repo: {
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      description: null,
      defaultBranch: 'main',
      stars: 100,
      forks: 10,
      language: 'TypeScript',
      topics: [],
      isPrivate: false,
      url: 'https://github.com/owner/repo',
      openIssuesCount: 5,
      pushedAt: '2025-01-01',
      license: 'MIT',
    },
    files: [],
    metrics: {
      totalFiles: 50,
      totalLines: 5000,
      primaryLanguage: 'TypeScript',
      languageBreakdown: {},
      stars: 100,
      forks: 10,
      openIssues: 5,
      pushedAt: '2025-01-01',
      license: 'MIT',
    },
    status: 'ready',
    dependencies: {
      deps: { react: '^18.0.0' },
      devDeps: { typescript: '^5.0.0' },
    },
    ...overrides,
  }
}

describe('DependencyOverlap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepoList = []
  })

  it('renders empty state message when fewer than 2 repos are ready', () => {
    mockRepoList = [createRepo({ status: 'loading' })]
    render(<DependencyOverlap />)
    expect(screen.getByText(/No repositories loaded yet/)).toBeInTheDocument()
  })

  it('renders message when repos are ready but lack dependency data', () => {
    mockRepoList = [
      createRepo({ id: 'a/b', dependencies: undefined }),
      createRepo({ id: 'c/d', dependencies: undefined }),
    ]
    render(<DependencyOverlap />)
    expect(screen.getByText(/need at least 2 repos with package\.json/i)).toBeInTheDocument()
  })

  it('renders shared dependencies table when 2+ repos have dependencies', () => {
    mockRepoList = [
      createRepo({ id: 'facebook/react' }),
      createRepo({ id: 'vercel/next.js' }),
    ]
    render(<DependencyOverlap />)
    expect(screen.getByText('Shared Dependencies')).toBeInTheDocument()
    // 'react' appears both as a column header and as a package row
    const reactElements = screen.getAllByText('react')
    expect(reactElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('typescript')).toBeInTheDocument()
  })

  it('renders shared dependency count badge', () => {
    mockRepoList = [
      createRepo({ id: 'facebook/react' }),
      createRepo({ id: 'vercel/next.js' }),
    ]
    render(<DependencyOverlap />)
    // '2' appears in the shared count badge and also in unique dep count badges
    const badges = screen.getAllByText('2')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders unique dependency sections per repo', () => {
    mockRepoList = [
      createRepo({ id: 'facebook/react' }),
      createRepo({ id: 'vercel/next.js' }),
    ]
    render(<DependencyOverlap />)

    expect(screen.getByText(/unique to facebook\/react/i)).toBeInTheDocument()
    expect(screen.getByText(/unique to vercel\/next\.js/i)).toBeInTheDocument()
  })

  it('shows unique dependencies when expanded', async () => {
    const user = userEvent.setup()
    mockRepoList = [
      createRepo({ id: 'facebook/react' }),
      createRepo({ id: 'vercel/next.js' }),
    ]
    render(<DependencyOverlap />)

    // Click to expand unique deps for facebook/react
    const trigger = screen.getByText(/unique to facebook\/react/i)
    await user.click(trigger)

    expect(screen.getByText('react-dom')).toBeInTheDocument()
    expect(screen.getByText('scheduler')).toBeInTheDocument()
  })

  it('skips repos with fetchError in dependencies', () => {
    mockRepoList = [
      createRepo({ id: 'a/b', dependencies: { deps: {}, devDeps: {}, fetchError: 'Not found' } }),
      createRepo({ id: 'c/d' }),
    ]
    render(<DependencyOverlap />)
    expect(screen.getByText(/need at least 2 repos with package\.json/i)).toBeInTheDocument()
  })
})
