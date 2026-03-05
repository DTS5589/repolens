import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { PinnedContextChips } from '../pinned-context-chips'
import type { PinnedFile } from '@/types/types'
import { PINNED_CONTEXT_CONFIG } from '@/config/constants'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPinnedFiles(
  entries: Array<{ path: string; type?: 'file' | 'directory' }>,
): Map<string, PinnedFile> {
  const map = new Map<string, PinnedFile>()
  for (const entry of entries) {
    map.set(entry.path, { path: entry.path, type: entry.type ?? 'file' })
  }
  return map
}

const defaultProps = {
  onUnpin: vi.fn(),
  onClearAll: vi.fn(),
  totalBytes: 1024,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PinnedContextChips', () => {
  it('renders nothing when pinnedFiles is empty', () => {
    const { container } = render(
      <PinnedContextChips
        pinnedFiles={new Map()}
        {...defaultProps}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a chip for each pinned file with the filename', () => {
    const pinnedFiles = createPinnedFiles([
      { path: 'src/utils.ts' },
      { path: 'src/lib/helpers.ts' },
    ])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        {...defaultProps}
      />,
    )

    expect(screen.getByText('utils.ts')).toBeInTheDocument()
    expect(screen.getByText('helpers.ts')).toBeInTheDocument()
  })

  it('shows folder icon for directory pins and file icon for file pins', () => {
    const pinnedFiles = createPinnedFiles([
      { path: 'src/utils.ts', type: 'file' },
      { path: 'src/lib', type: 'directory' },
    ])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        {...defaultProps}
      />,
    )

    // aria-labels differentiate between file and directory pins
    expect(
      screen.getByLabelText(/Pinned file: src\/utils\.ts/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/Pinned directory: src\/lib/),
    ).toBeInTheDocument()
  })

  it('Delete key on chip calls onUnpin with the correct path', () => {
    const onUnpin = vi.fn()
    const pinnedFiles = createPinnedFiles([{ path: 'src/app.ts' }])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        onUnpin={onUnpin}
        onClearAll={vi.fn()}
        totalBytes={100}
      />,
    )

    const chip = screen.getByLabelText(/Pinned file:.*app\.ts/i)
    fireEvent.keyDown(chip, { key: 'Delete' })

    expect(onUnpin).toHaveBeenCalledWith('src/app.ts')
  })

  it('"Clear all" button does NOT appear with only 1 pin', () => {
    const pinnedFiles = createPinnedFiles([{ path: 'src/single.ts' }])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        {...defaultProps}
      />,
    )

    expect(screen.queryByLabelText('Clear all pinned files')).not.toBeInTheDocument()
  })

  it('"Clear all" button appears with 2+ pins and calls onClearAll', () => {
    const onClearAll = vi.fn()
    const pinnedFiles = createPinnedFiles([
      { path: 'src/a.ts' },
      { path: 'src/b.ts' },
    ])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        onUnpin={vi.fn()}
        onClearAll={onClearAll}
        totalBytes={200}
      />,
    )

    const clearBtn = screen.getByLabelText('Clear all pinned files')
    expect(clearBtn).toBeInTheDocument()

    fireEvent.click(clearBtn)
    expect(onClearAll).toHaveBeenCalledOnce()
  })

  it('displays file count and byte size', () => {
    const pinnedFiles = createPinnedFiles([
      { path: 'src/a.ts' },
      { path: 'src/b.ts' },
      { path: 'src/c.ts' },
    ])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        onUnpin={vi.fn()}
        onClearAll={vi.fn()}
        totalBytes={2150}
      />,
    )

    // "3 files · 2.1 KB"
    expect(screen.getByText(/3 files/)).toBeInTheDocument()
    expect(screen.getByText(/2\.1 KB/)).toBeInTheDocument()
  })

  it('shows singular "file" for 1 pinned file', () => {
    const pinnedFiles = createPinnedFiles([{ path: 'src/a.ts' }])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        onUnpin={vi.fn()}
        onClearAll={vi.fn()}
        totalBytes={500}
      />,
    )

    expect(screen.getByText(/1 file ·/)).toBeInTheDocument()
  })

  it('shows warning color when near size limit', () => {
    const nearLimitBytes = PINNED_CONTEXT_CONFIG.MAX_PINNED_BYTES * 0.85
    const pinnedFiles = createPinnedFiles([{ path: 'src/a.ts' }])

    const { container } = render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        onUnpin={vi.fn()}
        onClearAll={vi.fn()}
        totalBytes={nearLimitBytes}
      />,
    )

    // The size indicator should have the warning class
    const sizeSpan = container.querySelector('.text-status-warning')
    expect(sizeSpan).not.toBeNull()
  })

  it('keyboard Delete on a focused chip calls handleUnpin', () => {
    const onUnpin = vi.fn()
    const pinnedFiles = createPinnedFiles([
      { path: 'src/first.ts' },
      { path: 'src/second.ts' },
    ])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        onUnpin={onUnpin}
        onClearAll={vi.fn()}
        totalBytes={200}
      />,
    )

    const chip = screen.getByLabelText(/Pinned file: src\/first\.ts/)
    chip.focus()
    fireEvent.keyDown(chip, { key: 'Delete' })

    expect(onUnpin).toHaveBeenCalledWith('src/first.ts')
  })

  it('keyboard Backspace on a focused chip calls handleUnpin', () => {
    const onUnpin = vi.fn()
    const pinnedFiles = createPinnedFiles([{ path: 'src/only.ts' }])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        onUnpin={onUnpin}
        onClearAll={vi.fn()}
        totalBytes={100}
      />,
    )

    const chip = screen.getByLabelText(/Pinned file: src\/only\.ts/)
    chip.focus()
    fireEvent.keyDown(chip, { key: 'Backspace' })

    expect(onUnpin).toHaveBeenCalledWith('src/only.ts')
  })

  it('has aria-live="polite" on the container for screen reader announcements', () => {
    const pinnedFiles = createPinnedFiles([{ path: 'src/a.ts' }])

    render(
      <PinnedContextChips
        pinnedFiles={pinnedFiles}
        {...defaultProps}
      />,
    )

    const container = screen.getByRole('list')
    expect(container).toHaveAttribute('aria-live', 'polite')
  })
})
