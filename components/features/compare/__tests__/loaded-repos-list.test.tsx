import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComparisonRepo } from '@/types/comparison'

const mockRemoveRepo = vi.fn()
const mockRetryRepo = vi.fn()
let mockRepoList: ComparisonRepo[] = []

vi.mock('@/providers/comparison-provider', () => ({
  useComparison: () => ({
    getRepoList: () => mockRepoList,
    removeRepo: mockRemoveRepo,
    retryRepo: mockRetryRepo,
  }),
}))

// Mock Spinner to avoid styled-component rendering issues
vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ className }: { className?: string }) => (
    <span data-testid="spinner" className={className} />
  ),
}))

import { LoadedReposList } from '../loaded-repos-list'

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
      languageBreakdown: { typescript: 40, javascript: 10 },
      stars: 100,
      forks: 10,
      openIssues: 5,
      pushedAt: '2025-01-01',
      license: 'MIT',
    },
    status: 'ready',
    ...overrides,
  }
}

describe('LoadedReposList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepoList = []
  })

  it('renders empty state when no repos are loaded', () => {
    render(<LoadedReposList />)
    expect(screen.getByText(/no repositories loaded/i)).toBeInTheDocument()
  })

  it('renders repo names for loaded repos', () => {
    mockRepoList = [
      createRepo({ id: 'facebook/react' }),
      createRepo({ id: 'vercel/next.js' }),
    ]
    render(<LoadedReposList />)
    expect(screen.getByText('facebook/react')).toBeInTheDocument()
    expect(screen.getByText('vercel/next.js')).toBeInTheDocument()
  })

  it('renders "Ready" badge for ready repos', () => {
    mockRepoList = [createRepo({ status: 'ready' })]
    render(<LoadedReposList />)
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('renders "Loading…" badge for loading repos', () => {
    mockRepoList = [createRepo({ status: 'loading' })]
    render(<LoadedReposList />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders "Indexing…" badge for indexing repos', () => {
    mockRepoList = [createRepo({ status: 'indexing' })]
    render(<LoadedReposList />)
    expect(screen.getByText('Indexing…')).toBeInTheDocument()
  })

  it('renders "Error" badge for errored repos', () => {
    mockRepoList = [createRepo({ status: 'error' })]
    render(<LoadedReposList />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('shows spinner for loading repos', () => {
    mockRepoList = [createRepo({ status: 'loading' })]
    render(<LoadedReposList />)
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('shows retry button for errored repos', () => {
    mockRepoList = [createRepo({ id: 'test/repo', status: 'error' })]
    render(<LoadedReposList />)
    expect(screen.getByLabelText('Retry test/repo')).toBeInTheDocument()
  })

  it('calls retryRepo when retry button is clicked', async () => {
    const user = userEvent.setup()
    mockRepoList = [createRepo({ id: 'test/repo', status: 'error' })]
    render(<LoadedReposList />)

    await user.click(screen.getByLabelText('Retry test/repo'))
    expect(mockRetryRepo).toHaveBeenCalledWith('test/repo')
  })

  it('calls removeRepo when remove button is clicked', async () => {
    const user = userEvent.setup()
    mockRepoList = [createRepo({ id: 'test/repo' })]
    render(<LoadedReposList />)

    await user.click(screen.getByLabelText('Remove test/repo'))
    expect(mockRemoveRepo).toHaveBeenCalledWith('test/repo')
  })

  it('renders the list with correct ARIA role', () => {
    mockRepoList = [createRepo()]
    render(<LoadedReposList />)
    expect(screen.getByRole('list', { name: /loaded repositories/i })).toBeInTheDocument()
  })
})
