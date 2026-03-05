import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DownloadSparkline } from '../download-sparkline'
import type { DownloadPoint } from '@/lib/deps/types'

// Mock Recharts — jsdom has no SVG layout support
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="area-chart">{children}</svg>
  ),
  Area: () => <g data-testid="area" />,
  Tooltip: () => null,
}))

describe('DownloadSparkline', () => {
  it('renders chart with valid data', () => {
    const data: DownloadPoint[] = [
      { day: '2026-03-01', downloads: 5000 },
      { day: '2026-03-02', downloads: 6000 },
      { day: '2026-03-03', downloads: 7000 },
    ]

    render(<DownloadSparkline data={data} />)

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('renders fallback "—" when data is empty', () => {
    render(<DownloadSparkline data={[]} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()
  })

  it('applies custom width and height', () => {
    const data: DownloadPoint[] = [{ day: '2026-03-01', downloads: 1000 }]
    const { container } = render(
      <DownloadSparkline data={data} width={100} height={30} />,
    )

    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('100px')
    expect(wrapper.style.height).toBe('30px')
  })
})
