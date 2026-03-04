import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import {
  IssuesTabSkeleton,
  DocsTabSkeleton,
  DiagramTabSkeleton,
  CodeTabSkeleton,
  MermaidDiagramSkeleton,
} from '../tab-skeleton'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count all elements that have the Skeleton shimmer class. */
function countSkeletonElements(container: HTMLElement): number {
  return container.querySelectorAll('.animate-pulse').length
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tab Skeleton Components', () => {
  // -----------------------------------------------------------------------
  // IssuesTabSkeleton
  // -----------------------------------------------------------------------

  describe('IssuesTabSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<IssuesTabSkeleton />)
      expect(container.firstChild).toBeTruthy()
    })

    it('contains shimmer Skeleton elements', () => {
      const { container } = render(<IssuesTabSkeleton />)
      // Toolbar (3 skeletons) + 8 rows × 3 skeletons each = 27
      expect(countSkeletonElements(container)).toBeGreaterThanOrEqual(10)
    })

    it('renders 8 issue placeholder rows', () => {
      const { container } = render(<IssuesTabSkeleton />)
      // Each row has a border class in its wrapper div
      const rows = container.querySelectorAll('.border')
      expect(rows.length).toBe(8)
    })
  })

  // -----------------------------------------------------------------------
  // DocsTabSkeleton
  // -----------------------------------------------------------------------

  describe('DocsTabSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<DocsTabSkeleton />)
      expect(container.firstChild).toBeTruthy()
    })

    it('contains shimmer Skeleton elements', () => {
      const { container } = render(<DocsTabSkeleton />)
      expect(countSkeletonElements(container)).toBeGreaterThanOrEqual(5)
    })

    it('renders a sidebar and content area', () => {
      const { container } = render(<DocsTabSkeleton />)
      // Sidebar has border-r class
      const sidebar = container.querySelector('.border-r')
      expect(sidebar).toBeTruthy()
    })
  })

  // -----------------------------------------------------------------------
  // DiagramTabSkeleton
  // -----------------------------------------------------------------------

  describe('DiagramTabSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<DiagramTabSkeleton />)
      expect(container.firstChild).toBeTruthy()
    })

    it('contains shimmer Skeleton elements', () => {
      const { container } = render(<DiagramTabSkeleton />)
      expect(countSkeletonElements(container)).toBeGreaterThanOrEqual(3)
    })

    it('renders a toolbar with multiple skeleton buttons', () => {
      const { container } = render(<DiagramTabSkeleton />)
      // Toolbar area has border-b class
      const toolbar = container.querySelector('.border-b')
      expect(toolbar).toBeTruthy()
    })
  })

  // -----------------------------------------------------------------------
  // CodeTabSkeleton
  // -----------------------------------------------------------------------

  describe('CodeTabSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<CodeTabSkeleton />)
      expect(container.firstChild).toBeTruthy()
    })

    it('contains shimmer Skeleton elements', () => {
      const { container } = render(<CodeTabSkeleton />)
      expect(countSkeletonElements(container)).toBeGreaterThanOrEqual(10)
    })

    it('renders a file tree sidebar with border separator', () => {
      const { container } = render(<CodeTabSkeleton />)
      const sidebar = container.querySelector('.border-r')
      expect(sidebar).toBeTruthy()
    })
  })

  // -----------------------------------------------------------------------
  // MermaidDiagramSkeleton
  // -----------------------------------------------------------------------

  describe('MermaidDiagramSkeleton', () => {
    it('renders without crashing', () => {
      const { container } = render(<MermaidDiagramSkeleton />)
      expect(container.firstChild).toBeTruthy()
    })

    it('contains a shimmer Skeleton element', () => {
      const { container } = render(<MermaidDiagramSkeleton />)
      expect(countSkeletonElements(container)).toBeGreaterThanOrEqual(1)
    })
  })
})
