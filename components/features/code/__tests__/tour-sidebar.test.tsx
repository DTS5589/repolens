import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourSidebar } from '../tour-sidebar'
import type { Tour } from '@/types/tours'

// Polyfill ResizeObserver for Radix ScrollArea in jsdom
beforeAll(() => {
  globalThis.ResizeObserver ??= class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTour(overrides: Partial<Tour> = {}): Tour {
  return {
    id: crypto.randomUUID(),
    name: 'Test Tour',
    description: 'A test tour description',
    repoKey: 'owner/repo',
    stops: [
      { id: 's1', filePath: 'src/a.ts', startLine: 1, endLine: 10, annotation: 'Stop A' },
      { id: 's2', filePath: 'src/b.ts', startLine: 5, endLine: 20, annotation: 'Stop B' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

const defaultProps = {
  tours: [] as Tour[],
  activeTour: null as Tour | null,
  isPlaying: false,
  onStartTour: vi.fn(),
  onDeleteTour: vi.fn(),
  onCreateTour: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TourSidebar', () => {
  it('shows empty state when tours array is empty', () => {
    render(<TourSidebar {...defaultProps} tours={[]} />)

    expect(screen.getByText('No tours yet')).toBeInTheDocument()
  })

  it('renders tour list when tours are provided', () => {
    const tours = [
      makeTour({ id: 't1', name: 'Tour Alpha' }),
      makeTour({ id: 't2', name: 'Tour Beta' }),
    ]

    render(<TourSidebar {...defaultProps} tours={tours} />)

    expect(screen.getByText('Tour Alpha')).toBeInTheDocument()
    expect(screen.getByText('Tour Beta')).toBeInTheDocument()
  })

  it('shows tour name, description, and stop count', () => {
    const tour = makeTour({ name: 'Auth Flow', description: 'Walk through auth' })
    render(<TourSidebar {...defaultProps} tours={[tour]} />)

    expect(screen.getByText('Auth Flow')).toBeInTheDocument()
    expect(screen.getByText('Walk through auth')).toBeInTheDocument()
    expect(screen.getByText('2 stops')).toBeInTheDocument()
  })

  it('shows singular "stop" label when tour has one stop', () => {
    const tour = makeTour({
      stops: [{ id: 's1', filePath: 'a.ts', startLine: 1, endLine: 5, annotation: 'a' }],
    })
    render(<TourSidebar {...defaultProps} tours={[tour]} />)

    expect(screen.getByText('1 stop')).toBeInTheDocument()
  })

  it('calls onStartTour when play button is clicked', async () => {
    const user = userEvent.setup()
    const tour = makeTour({ id: 'play-test', name: 'Play Me' })
    const onStartTour = vi.fn()

    render(
      <TourSidebar
        {...defaultProps}
        tours={[tour]}
        onStartTour={onStartTour}
      />,
    )

    await user.click(screen.getByRole('button', { name: /play tour.*play me/i }))

    expect(onStartTour).toHaveBeenCalledWith(tour)
  })

  it('calls onDeleteTour with correct id when delete button is clicked', async () => {
    const user = userEvent.setup()
    const tour = makeTour({ id: 'del-test', name: 'Delete Me' })
    const onDeleteTour = vi.fn()

    render(
      <TourSidebar
        {...defaultProps}
        tours={[tour]}
        onDeleteTour={onDeleteTour}
      />,
    )

    await user.click(screen.getByRole('button', { name: /delete tour.*delete me/i }))

    expect(onDeleteTour).toHaveBeenCalledWith('del-test')
  })

  it('delete button is disabled for the currently playing tour', () => {
    const tour = makeTour({ id: 'active-tour', name: 'Active' })

    render(
      <TourSidebar
        {...defaultProps}
        tours={[tour]}
        activeTour={tour}
        isPlaying={true}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: /delete tour.*active/i })
    expect(deleteBtn).toBeDisabled()
  })

  it('delete button is not disabled when tour is not playing', () => {
    const tour = makeTour({ id: 'inactive', name: 'Inactive' })

    render(
      <TourSidebar
        {...defaultProps}
        tours={[tour]}
        isPlaying={false}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: /delete tour.*inactive/i })
    expect(deleteBtn).not.toBeDisabled()
  })

  it('play button is disabled for tours with no stops', () => {
    const tour = makeTour({ stops: [], name: 'Empty' })

    render(<TourSidebar {...defaultProps} tours={[tour]} />)

    const playBtn = screen.getByRole('button', { name: /play tour.*empty/i })
    expect(playBtn).toBeDisabled()
  })

  it('create button opens dialog', async () => {
    const user = userEvent.setup()

    render(<TourSidebar {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /create new tour/i }))

    expect(screen.getByRole('heading', { name: 'Create Tour' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('create dialog calls onCreateTour with name and description', async () => {
    const user = userEvent.setup()
    const onCreateTour = vi.fn()

    render(<TourSidebar {...defaultProps} onCreateTour={onCreateTour} />)

    // Open dialog
    await user.click(screen.getByRole('button', { name: /create new tour/i }))

    // Fill form — use short values to keep character-by-character typing fast
    await user.type(screen.getByLabelText('Name'), 'Tour')
    await user.type(screen.getByPlaceholderText(/brief description/i), 'Desc')

    // Submit
    await user.click(screen.getByRole('button', { name: 'Create Tour' }))

    expect(onCreateTour).toHaveBeenCalledWith('Tour', 'Desc')
  }, 15_000)

  it('create button in empty state also opens dialog', async () => {
    const user = userEvent.setup()

    render(<TourSidebar {...defaultProps} tours={[]} />)

    // The empty state has a visible "Create" button (not the header icon)
    const createButtons = screen.getAllByRole('button', { name: /create/i })
    // Click the visible one in the empty state (the last one with visible text)
    const emptyStateBtn = createButtons.find((btn) => btn.textContent?.trim() === 'Create')
    expect(emptyStateBtn).toBeDefined()
    await user.click(emptyStateBtn!)

    expect(screen.getByRole('heading', { name: 'Create Tour' })).toBeInTheDocument()
  })
})
