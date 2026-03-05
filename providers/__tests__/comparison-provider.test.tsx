import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useComparison, ComparisonProvider } from '../comparison-provider'

// Mock external dependencies
vi.mock('@/lib/github/parser', () => ({
  parseGitHubUrl: vi.fn((url: string) => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return null
    return { owner: match[1], repo: match[2] }
  }),
}))

vi.mock('@/lib/github/client', () => ({
  fetchRepoViaProxy: vi.fn().mockResolvedValue({
    owner: 'test',
    name: 'repo',
    fullName: 'test/repo',
    description: 'A test repo',
    defaultBranch: 'main',
    stars: 100,
    forks: 10,
    language: 'TypeScript',
    topics: [],
    isPrivate: false,
    url: 'https://github.com/test/repo',
    openIssuesCount: 5,
    pushedAt: '2025-01-01',
    license: 'MIT',
  }),
  fetchTreeViaProxy: vi.fn().mockResolvedValue([]),
  fetchFileViaProxy: vi.fn().mockRejectedValue(new Error('Not found')),
}))

vi.mock('@/lib/github/fetcher', () => ({
  buildFileTree: vi.fn(() => []),
}))

vi.mock('@/lib/code/code-index', () => ({
  flattenFiles: vi.fn(() => []),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function TestConsumer({ onContext }: { onContext: (ctx: ReturnType<typeof useComparison>) => void }) {
  const ctx = useComparison()
  onContext(ctx)
  return (
    <div>
      <span data-testid="capacity">{String(ctx.isAtCapacity)}</span>
      <span data-testid="count">{ctx.getRepoList().length}</span>
    </div>
  )
}

describe('ComparisonProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides initial state with empty repos and not at capacity', () => {
    let ctx: ReturnType<typeof useComparison> | null = null

    render(
      <ComparisonProvider>
        <TestConsumer onContext={(c) => { ctx = c }} />
      </ComparisonProvider>
    )

    expect(screen.getByTestId('count')).toHaveTextContent('0')
    expect(screen.getByTestId('capacity')).toHaveTextContent('false')
  })

  it('getRepoList returns an empty array initially', () => {
    let repoList: unknown[] = []

    render(
      <ComparisonProvider>
        <TestConsumer onContext={(c) => { repoList = c.getRepoList() }} />
      </ComparisonProvider>
    )

    expect(repoList).toEqual([])
  })

  it('removeRepo removes a repo from the list', async () => {
    let ctx: ReturnType<typeof useComparison> | null = null

    render(
      <ComparisonProvider>
        <TestConsumer onContext={(c) => { ctx = c }} />
      </ComparisonProvider>
    )

    // Add a repo
    await act(async () => {
      await ctx!.addRepo('https://github.com/test/repo')
    })

    expect(screen.getByTestId('count')).toHaveTextContent('1')

    // Remove it
    await act(async () => {
      ctx!.removeRepo('test/repo')
    })

    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('clearAll removes all repos', async () => {
    let ctx: ReturnType<typeof useComparison> | null = null

    render(
      <ComparisonProvider>
        <TestConsumer onContext={(c) => { ctx = c }} />
      </ComparisonProvider>
    )

    await act(async () => {
      await ctx!.addRepo('https://github.com/test/repo')
    })

    expect(screen.getByTestId('count')).toHaveTextContent('1')

    await act(async () => {
      ctx!.clearAll()
    })

    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('rejects invalid GitHub URLs', async () => {
    const { toast } = await import('sonner')
    let ctx: ReturnType<typeof useComparison> | null = null

    render(
      <ComparisonProvider>
        <TestConsumer onContext={(c) => { ctx = c }} />
      </ComparisonProvider>
    )

    let result: boolean = true
    await act(async () => {
      result = await ctx!.addRepo('not-a-url')
    })

    expect(result).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Invalid GitHub URL'))
  })
})

describe('useComparison', () => {
  it('throws when used outside ComparisonProvider', () => {
    function BadConsumer() {
      useComparison()
      return null
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<BadConsumer />)).toThrow(
      'useComparison must be used within a ComparisonProvider'
    )
    spy.mockRestore()
  })
})
