import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompareLoading from '../loading'

describe('CompareLoading', () => {
  it('renders without crashing', () => {
    const { container } = render(<CompareLoading />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders the header placeholder skeleton', () => {
    const { container } = render(<CompareLoading />)
    // Header has a h-14 border-b bar with a skeleton inside
    const header = container.querySelector('.h-14')
    expect(header).toBeTruthy()
  })

  it('renders multiple skeleton elements for the page structure', () => {
    const { container } = render(<CompareLoading />)
    // The Skeleton component renders div elements with the animate-pulse class
    const skeletons = container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]')
    // Should have many skeletons (back link, title, subtitle, inputs, metrics, deps)
    expect(skeletons.length).toBeGreaterThanOrEqual(5)
  })

  it('renders repo input bar skeleton section', () => {
    const { container } = render(<CompareLoading />)
    // Check for the input skeleton group (h-10 w-full)
    const inputSkeletons = container.querySelectorAll('.h-10')
    expect(inputSkeletons.length).toBeGreaterThanOrEqual(2)
  })

  it('renders 4 metric skeleton rows', () => {
    const { container } = render(<CompareLoading />)
    // Each metric row has h-4 w-24 label + two h-2 bars
    const metricBars = container.querySelectorAll('.h-2')
    // 4 metrics × 2 bars each = 8
    expect(metricBars.length).toBeGreaterThanOrEqual(8)
  })
})
