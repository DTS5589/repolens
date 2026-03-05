import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComparisonRepo } from '@/types/comparison'

let mockRepoList: ComparisonRepo[] = []

vi.mock('@/providers/comparison-provider', () => ({
  useComparison: () => ({
    getRepoList: () => mockRepoList,
  }),
}))

import { ComparisonTable } from '../comparison-table'

function createRepo(overrides: Partial<ComparisonRepo> = {}): ComparisonRepo {
  return {
    id: 'owner/repo',
    repo: {
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      description: null,
      defaultBranch: 'main',
      stars: 1200,
      forks: 300,
      language: 'TypeScript',
      topics: [],
      isPrivate: false,
      url: 'https://github.com/owner/repo',
      openIssuesCount: 42,
      pushedAt: '2025-01-01T00:00:00Z',
      license: 'MIT',
    },
    files: [],
    metrics: {
      totalFiles: 150,
      totalLines: 25000,
      primaryLanguage: 'TypeScript',
      languageBreakdown: { typescript: 100, javascript: 50 },
      stars: 1200,
      forks: 300,
      openIssues: 42,
      pushedAt: '2025-01-01T00:00:00Z',
      license: 'MIT',
    },
    status: 'ready',
    ...overrides,
  }
}

describe('ComparisonTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepoList = []
  })

  it('renders empty state message when no repos are loaded', () => {
    render(<ComparisonTable />)
    expect(screen.getByText('No repositories to compare')).toBeInTheDocument()
    expect(screen.getByText(/Add at least two repositories/)).toBeInTheDocument()
  })

  it('renders skeleton loading state when repos exist but none are ready', () => {
    mockRepoList = [createRepo({ status: 'loading' })]
    render(<ComparisonTable />)
    // Skeleton divs should be rendered — no metric labels present
    expect(screen.queryByText('Stars')).not.toBeInTheDocument()
  })

  it('renders metric labels when repos are ready', () => {
    mockRepoList = [createRepo()]
    render(<ComparisonTable />)

    expect(screen.getByText('Stars')).toBeInTheDocument()
    expect(screen.getByText('Forks')).toBeInTheDocument()
    expect(screen.getByText('Open Issues')).toBeInTheDocument()
    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('Lines (est.)')).toBeInTheDocument()
  })

  it('renders repo IDs in bar chart rows', () => {
    mockRepoList = [
      createRepo({ id: 'facebook/react' }),
      createRepo({ id: 'vercel/next.js' }),
    ]
    render(<ComparisonTable />)

    // Each metric has one row per repo, so IDs appear multiple times
    const reactRows = screen.getAllByText('facebook/react')
    expect(reactRows.length).toBeGreaterThan(0)
    const nextRows = screen.getAllByText('vercel/next.js')
    expect(nextRows.length).toBeGreaterThan(0)
  })

  it('formats large numbers compactly (e.g., 1.2K)', () => {
    mockRepoList = [createRepo({ metrics: { ...createRepo().metrics, stars: 1200 } })]
    render(<ComparisonTable />)
    expect(screen.getByText('1.2K')).toBeInTheDocument()
  })

  it('renders text metrics (Primary Language, License, Last Active)', () => {
    mockRepoList = [createRepo()]
    render(<ComparisonTable />)

    expect(screen.getByText('Primary Language')).toBeInTheDocument()
    expect(screen.getByText('License')).toBeInTheDocument()
    expect(screen.getByText('Last Active')).toBeInTheDocument()
  })

  it('renders language breakdown section', () => {
    mockRepoList = [createRepo()]
    render(<ComparisonTable />)
    expect(screen.getByText('Languages')).toBeInTheDocument()
  })

  it('displays "—" for missing text metric values', () => {
    mockRepoList = [
      createRepo({
        metrics: {
          ...createRepo().metrics,
          primaryLanguage: null,
          license: null,
          pushedAt: null,
        },
      }),
    ]
    render(<ComparisonTable />)

    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })

  it('renders "No languages detected" when language breakdown is empty', () => {
    mockRepoList = [
      createRepo({
        metrics: {
          ...createRepo().metrics,
          languageBreakdown: {},
        },
      }),
    ]
    render(<ComparisonTable />)
    expect(screen.getByText('No languages detected')).toBeInTheDocument()
  })

  it('renders multiple repos side-by-side in text metric cards', () => {
    mockRepoList = [
      createRepo({ id: 'facebook/react', metrics: { ...createRepo().metrics, license: 'MIT' } }),
      createRepo({ id: 'vuejs/vue', metrics: { ...createRepo().metrics, license: 'Apache-2.0' } }),
    ]
    render(<ComparisonTable />)

    expect(screen.getByText('MIT')).toBeInTheDocument()
    expect(screen.getByText('Apache-2.0')).toBeInTheDocument()
  })
})
