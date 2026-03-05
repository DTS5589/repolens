import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Mock syntax highlighting to return plain tokens (avoids Shiki WASM)
vi.mock('../hooks/use-syntax-highlighting', () => ({
  useSyntaxHighlighting: (content: string) => {
    return content.split('\n').map((line) => [{ content: line, color: undefined }])
  },
}))

import { CodeEditor } from '../code-editor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_CODE = [
  'function hello() {',
  '  console.log("hello");',
  '}',
  '',
  'function world() {',
  '  console.log("world");',
  '}',
  '',
  'export { hello, world };',
].join('\n')

function renderEditor(props: Partial<React.ComponentProps<typeof CodeEditor>> = {}) {
  return render(
    <CodeEditor
      content={SAMPLE_CODE}
      language="typescript"
      {...props}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodeEditor — highlightedRange', () => {
  it('lines within highlightedRange receive tour highlight classes', () => {
    const { container } = renderEditor({
      highlightedRange: { startLine: 1, endLine: 3 },
    })

    // Lines 1, 2, 3 should have the tour highlight class
    const rows = container.querySelectorAll('tr[data-line]')
    for (let i = 0; i < 3; i++) {
      const row = rows[i]
      expect(row.className).toContain('bg-blue-500/10')
      expect(row.className).toContain('border-blue-500')
    }
  })

  it('lines outside highlightedRange do not get tour highlight class', () => {
    const { container } = renderEditor({
      highlightedRange: { startLine: 1, endLine: 3 },
    })

    const rows = container.querySelectorAll('tr[data-line]')
    // Lines 4+ should not have the tour highlight class
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i]
      expect(row.className).not.toContain('bg-blue-500/10')
    }
  })

  it('no highlight classes when highlightedRange is undefined', () => {
    const { container } = renderEditor({
      highlightedRange: undefined,
    })

    const rows = container.querySelectorAll('tr[data-line]')
    for (const row of rows) {
      expect(row.className).not.toContain('bg-blue-500/10')
    }
  })

  it('no highlight classes when highlightedRange is null', () => {
    const { container } = renderEditor({
      highlightedRange: null,
    })

    const rows = container.querySelectorAll('tr[data-line]')
    for (const row of rows) {
      expect(row.className).not.toContain('bg-blue-500/10')
    }
  })

  it('highlightedRange and highlightedLine can coexist without conflicts', () => {
    const { container } = renderEditor({
      highlightedRange: { startLine: 1, endLine: 3 },
      highlightedLine: 5,
    })

    const rows = container.querySelectorAll('tr[data-line]')

    // Line 1-3 should have tour highlight
    expect(rows[0].className).toContain('bg-blue-500/10')
    expect(rows[1].className).toContain('bg-blue-500/10')
    expect(rows[2].className).toContain('bg-blue-500/10')

    // Line 5 should have single-line highlight (animate-pulse)
    expect(rows[4].className).toContain('animate-pulse')
  })

  it('range spanning a single line applies highlight to that one line', () => {
    const { container } = renderEditor({
      highlightedRange: { startLine: 5, endLine: 5 },
    })

    const rows = container.querySelectorAll('tr[data-line]')

    // Only line 5 (index 4) should be highlighted
    expect(rows[4].className).toContain('bg-blue-500/10')
    expect(rows[3].className).not.toContain('bg-blue-500/10')
    expect(rows[5].className).not.toContain('bg-blue-500/10')
  })
})
