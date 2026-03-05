import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TourPlayerBar } from '../tour-player-bar'
import type { Tour } from '@/types/tours'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTour(stopCount = 5): Tour {
  const stops = Array.from({ length: stopCount }, (_, i) => ({
    id: `s${i + 1}`,
    filePath: `src/file-${i + 1}.ts`,
    startLine: 1,
    endLine: 10,
    annotation: `Annotation for stop ${i + 1}`,
    title: `Stop ${i + 1}`,
  }))

  return {
    id: 'tour-1',
    name: 'Player Test Tour',
    description: 'For testing the player bar',
    repoKey: 'owner/repo',
    stops,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const defaultProps = {
  tour: makeTour(),
  activeStopIndex: 0,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onStop: vi.fn(),
  onGoToStop: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TourPlayerBar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders current stop position indicator', () => {
    render(<TourPlayerBar {...defaultProps} activeStopIndex={2} />)

    // The component shows "3/5" format
    expect(screen.getByText('3/5')).toBeInTheDocument()
  })

  it('renders current stop title', () => {
    render(<TourPlayerBar {...defaultProps} activeStopIndex={0} />)

    expect(screen.getByText('Stop 1')).toBeInTheDocument()
  })

  it('renders filePath when stop has no title', () => {
    const tour = makeTour()
    tour.stops[0] = { ...tour.stops[0], title: undefined }

    render(<TourPlayerBar {...defaultProps} tour={tour} activeStopIndex={0} />)

    expect(screen.getByText('src/file-1.ts')).toBeInTheDocument()
  })

  it('calls onPrev when prev button is clicked', async () => {
    const user = userEvent.setup()
    const onPrev = vi.fn()

    render(
      <TourPlayerBar
        {...defaultProps}
        activeStopIndex={2}
        onPrev={onPrev}
      />,
    )

    await user.click(screen.getByRole('button', { name: /previous stop/i }))

    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('calls onNext when next button is clicked', async () => {
    const user = userEvent.setup()
    const onNext = vi.fn()

    render(
      <TourPlayerBar
        {...defaultProps}
        activeStopIndex={0}
        onNext={onNext}
      />,
    )

    await user.click(screen.getByRole('button', { name: /next stop/i }))

    expect(onNext).toHaveBeenCalledOnce()
  })

  it('calls onStop when stop button is clicked', async () => {
    const user = userEvent.setup()
    const onStop = vi.fn()

    render(
      <TourPlayerBar
        {...defaultProps}
        activeStopIndex={0}
        onStop={onStop}
      />,
    )

    await user.click(screen.getByRole('button', { name: /stop tour/i }))

    expect(onStop).toHaveBeenCalledOnce()
  })

  it('prev button is disabled at index 0', () => {
    render(<TourPlayerBar {...defaultProps} activeStopIndex={0} />)

    const prevBtn = screen.getByRole('button', { name: /previous stop/i })
    expect(prevBtn).toBeDisabled()
  })

  it('next button is disabled at last stop index', () => {
    const tour = makeTour(5)
    render(<TourPlayerBar {...defaultProps} tour={tour} activeStopIndex={4} />)

    const nextBtn = screen.getByRole('button', { name: /next stop/i })
    expect(nextBtn).toBeDisabled()
  })

  it('prev button is enabled when not at first stop', () => {
    render(<TourPlayerBar {...defaultProps} activeStopIndex={2} />)

    const prevBtn = screen.getByRole('button', { name: /previous stop/i })
    expect(prevBtn).not.toBeDisabled()
  })

  it('next button is enabled when not at last stop', () => {
    render(<TourPlayerBar {...defaultProps} activeStopIndex={0} />)

    const nextBtn = screen.getByRole('button', { name: /next stop/i })
    expect(nextBtn).not.toBeDisabled()
  })

  it('has toolbar role with accessible label', () => {
    render(<TourPlayerBar {...defaultProps} />)

    expect(screen.getByRole('toolbar', { name: /tour player controls/i })).toBeInTheDocument()
  })

  // ---- Keyboard events ---------------------------------------------------

  it('ArrowRight triggers onNext when not at last stop', () => {
    const onNext = vi.fn()
    render(<TourPlayerBar {...defaultProps} activeStopIndex={0} onNext={onNext} />)

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(onNext).toHaveBeenCalledOnce()
  })

  it('ArrowLeft triggers onPrev when not at first stop', () => {
    const onPrev = vi.fn()
    render(<TourPlayerBar {...defaultProps} activeStopIndex={2} onPrev={onPrev} />)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('ArrowRight does not trigger onNext at last stop', () => {
    const onNext = vi.fn()
    render(
      <TourPlayerBar {...defaultProps} activeStopIndex={4} onNext={onNext} />,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(onNext).not.toHaveBeenCalled()
  })

  it('ArrowLeft does not trigger onPrev at first stop', () => {
    const onPrev = vi.fn()
    render(
      <TourPlayerBar {...defaultProps} activeStopIndex={0} onPrev={onPrev} />,
    )

    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    expect(onPrev).not.toHaveBeenCalled()
  })

  it('Escape triggers onStop', () => {
    const onStop = vi.fn()
    render(<TourPlayerBar {...defaultProps} onStop={onStop} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onStop).toHaveBeenCalledOnce()
  })

  it('progress bar reflects current position', () => {
    const { container } = render(
      <TourPlayerBar {...defaultProps} activeStopIndex={2} />,
    )

    // At index 2 of 5 stops: (2 / 4) * 100 = 50%
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar).toBeTruthy()
    expect(progressBar!.getAttribute('style')).toContain('50%')
  })
})
