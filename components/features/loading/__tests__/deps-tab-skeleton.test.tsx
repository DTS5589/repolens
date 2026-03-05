import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DepsTabSkeleton } from '../tab-skeleton'

describe('DepsTabSkeleton', () => {
  it('renders with loading role and aria-label', () => {
    render(<DepsTabSkeleton />)

    const container = screen.getByRole('status')
    expect(container).toHaveAttribute('aria-label', 'Loading dependencies')
  })

  it('renders 4 summary card skeletons', () => {
    const { container } = render(<DepsTabSkeleton />)

    // Summary cards are in a grid with 4 items
    const grid = container.querySelector('.grid')
    expect(grid).toBeInTheDocument()
    const cards = grid!.children
    expect(cards.length).toBe(4)
  })

  it('renders table row skeletons', () => {
    const { container } = render(<DepsTabSkeleton />)

    // Table rows have border-b class
    const rows = container.querySelectorAll('.border-b')
    expect(rows.length).toBeGreaterThanOrEqual(5)
  })
})
