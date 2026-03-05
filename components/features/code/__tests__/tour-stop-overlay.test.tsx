import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock react-markdown to avoid ESM/WASM issues in test environment
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}))

vi.mock('remark-gfm', () => ({
  default: () => {},
}))

import { TourStopOverlay } from '../tour-stop-overlay'
import type { TourStop } from '@/types/tours'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStop(overrides: Partial<TourStop> = {}): TourStop {
  return {
    id: 'stop-1',
    filePath: 'src/index.ts',
    startLine: 1,
    endLine: 20,
    annotation: 'This is the **main entry point** of the application.',
    title: 'Entry Point',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TourStopOverlay', () => {
  it('renders stop title', () => {
    render(
      <TourStopOverlay
        stop={makeStop()}
        stopIndex={0}
        totalStops={5}
      />,
    )

    expect(screen.getByText('Entry Point')).toBeInTheDocument()
  })

  it('renders stop number indicator', () => {
    render(
      <TourStopOverlay
        stop={makeStop()}
        stopIndex={2}
        totalStops={8}
      />,
    )

    expect(screen.getByText('3/8')).toBeInTheDocument()
  })

  it('renders annotation text', () => {
    render(
      <TourStopOverlay
        stop={makeStop({ annotation: 'This function handles auth.' })}
        stopIndex={0}
        totalStops={3}
      />,
    )

    expect(screen.getByText('This function handles auth.')).toBeInTheDocument()
  })

  it('renders without title when title is not provided', () => {
    render(
      <TourStopOverlay
        stop={makeStop({ title: undefined })}
        stopIndex={0}
        totalStops={3}
      />,
    )

    // The annotation should still be present
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument()
    // But no title text
    expect(screen.queryByText('Entry Point')).not.toBeInTheDocument()
  })

  it('collapse toggle minimizes the overlay', async () => {
    const user = userEvent.setup()

    render(
      <TourStopOverlay
        stop={makeStop()}
        stopIndex={1}
        totalStops={5}
      />,
    )

    // Initially the annotation is visible
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument()

    // Click collapse button
    await user.click(screen.getByRole('button', { name: /collapse tour annotation/i }))

    // After collapse, the full annotation should no longer be visible
    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()

    // But the collapsed indicator should show stop info
    expect(screen.getByRole('button', { name: /expand tour annotation/i })).toBeInTheDocument()
  })

  it('expand button restores the overlay after collapse', async () => {
    const user = userEvent.setup()

    render(
      <TourStopOverlay
        stop={makeStop()}
        stopIndex={0}
        totalStops={3}
      />,
    )

    // Collapse
    await user.click(screen.getByRole('button', { name: /collapse tour annotation/i }))
    expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument()

    // Expand
    await user.click(screen.getByRole('button', { name: /expand tour annotation/i }))
    expect(screen.getByTestId('markdown-content')).toBeInTheDocument()
  })

  it('collapsed state shows stop number and title', async () => {
    const user = userEvent.setup()

    render(
      <TourStopOverlay
        stop={makeStop({ title: 'Config' })}
        stopIndex={3}
        totalStops={10}
      />,
    )

    await user.click(screen.getByRole('button', { name: /collapse tour annotation/i }))

    const expandBtn = screen.getByRole('button', { name: /expand tour annotation/i })
    expect(expandBtn).toHaveTextContent('4/10')
    expect(expandBtn).toHaveTextContent('Config')
  })
})
