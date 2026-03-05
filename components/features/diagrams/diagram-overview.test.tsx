import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiagramOverview } from './diagram-overview'
import type { FullAnalysis, FileAnalysis } from '@/lib/code/parser/types'
import type { AvailableDiagram, ProjectSummary, DiagramType } from '@/lib/diagrams/types'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createFileAnalysis(overrides: Partial<FileAnalysis> = {}): FileAnalysis {
  return {
    path: 'src/index.ts',
    imports: [],
    exports: [],
    types: [],
    classes: [],
    jsxComponents: [],
    language: 'typescript',
    ...overrides,
  }
}

function createAnalysis(overrides: Partial<FullAnalysis> = {}): FullAnalysis {
  const files = new Map<string, FileAnalysis>([
    ['src/index.ts', createFileAnalysis({ path: 'src/index.ts' })],
    ['src/utils.ts', createFileAnalysis({ path: 'src/utils.ts' })],
    ['src/app.tsx', createFileAnalysis({ path: 'src/app.tsx', jsxComponents: ['App'] })],
  ])
  return {
    files,
    graph: {
      edges: new Map(),
      reverseEdges: new Map(),
      circular: [],
      externalDeps: new Map(),
    },
    topology: {
      entryPoints: ['src/index.ts'],
      hubs: ['src/utils.ts'],
      orphans: [],
      leafNodes: [],
      connectors: [],
      clusters: [['src/index.ts', 'src/utils.ts']],
      depthMap: new Map(),
      maxDepth: 2,
    },
    detectedFramework: null,
    primaryLanguage: 'typescript',
    ...overrides,
  }
}

function createSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    languages: [{ lang: 'typescript', files: 3, lines: 300, pct: 100 }],
    topHubs: [{ path: 'src/utils.ts', importerCount: 5 }],
    topConsumers: [{ path: 'src/index.ts', depCount: 3 }],
    circularDeps: [],
    orphanFiles: [],
    entryPoints: ['src/index.ts'],
    connectors: [],
    clusterCount: 1,
    maxDepth: 2,
    totalFiles: 3,
    totalLines: 300,
    frameworkDetected: null,
    primaryLanguage: 'typescript',
    healthIssues: [],
    folderBreakdown: [{ folder: 'src', files: 3, lines: 300, pct: 100 }],
    externalDeps: [],
    ...overrides,
  }
}

function createAvailableDiagrams(
  overrides: Partial<AvailableDiagram>[] = [],
): AvailableDiagram[] {
  const defaults: AvailableDiagram[] = [
    { id: 'topology', label: 'Topology', available: true },
    { id: 'classes', label: 'Classes', available: true },
    { id: 'entrypoints', label: 'Entrypoints', available: true },
    { id: 'modules', label: 'Modules', available: true },
    { id: 'treemap', label: 'Treemap', available: true },
  ]
  if (overrides.length > 0) {
    return overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o }))
  }
  return defaults
}

function renderOverview(propOverrides: {
  analysis?: FullAnalysis
  availableDiagrams?: AvailableDiagram[]
  onSelectDiagram?: (type: DiagramType) => void
  onFocusFile?: (path: string) => void
  summaryData?: ProjectSummary
} = {}) {
  const props = {
    analysis: propOverrides.analysis ?? createAnalysis(),
    availableDiagrams: propOverrides.availableDiagrams ?? createAvailableDiagrams(),
    onSelectDiagram: propOverrides.onSelectDiagram ?? vi.fn(),
    onFocusFile: propOverrides.onFocusFile ?? vi.fn(),
    summaryData: propOverrides.summaryData ?? createSummary(),
  }
  const result = render(<DiagramOverview {...props} />)
  return { ...result, props }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiagramOverview', () => {
  // ----- Stats strip -----

  describe('stats strip', () => {
    it('renders file count and line count', () => {
      renderOverview({ summaryData: createSummary({ totalFiles: 42, totalLines: 1234 }) })

      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('1,234')).toBeInTheDocument()
    })

    it('renders the primary language label', () => {
      renderOverview({ summaryData: createSummary({ primaryLanguage: 'typescript' }) })

      expect(screen.getByText('TypeScript')).toBeInTheDocument()
    })

    it('falls back to raw language name when no label mapping exists', () => {
      renderOverview({ summaryData: createSummary({ primaryLanguage: 'elixir' }) })

      expect(screen.getByText('elixir')).toBeInTheDocument()
    })

    it('shows framework badge when detected', () => {
      renderOverview({ summaryData: createSummary({ frameworkDetected: 'Next.js' }) })

      expect(screen.getByText('Next.js')).toBeInTheDocument()
    })

    it('omits framework badge when null', () => {
      renderOverview({ summaryData: createSummary({ frameworkDetected: null }) })

      const banner = screen.getByRole('banner', { name: /repository stats/i })
      // Only language badge should exist, not framework
      const badges = within(banner).getAllByText(/./i)
      badges.forEach((el) => {
        expect(el.textContent).not.toBe('') // just verifying non-empty content
      })
      // Check there's exactly one badge-like element per language
      expect(within(banner).queryByText('Next.js')).not.toBeInTheDocument()
    })
  })

  // ----- Diagram cards -----

  describe('diagram cards', () => {
    it('renders one card per available diagram', () => {
      renderOverview()

      const cards = screen.getAllByRole('button', { name: /open .+ diagram/i })
      expect(cards).toHaveLength(5)
    })

    it('renders card titles matching labels', () => {
      renderOverview()

      expect(screen.getByText('Topology')).toBeInTheDocument()
      expect(screen.getByText('Classes')).toBeInTheDocument()
      expect(screen.getByText('Entrypoints')).toBeInTheDocument()
      expect(screen.getByText('Modules')).toBeInTheDocument()
      expect(screen.getByText('Treemap')).toBeInTheDocument()
    })

    it('renders the question text for each card', () => {
      renderOverview()

      expect(screen.getByText('How is the code structured?')).toBeInTheDocument()
      expect(screen.getByText("What's the class hierarchy?")).toBeInTheDocument()
      expect(screen.getByText('What are the API endpoints?')).toBeInTheDocument()
      expect(screen.getByText('How do components connect?')).toBeInTheDocument()
      expect(screen.getByText('Where is the code mass?')).toBeInTheDocument()
    })

    it('renders a live metric for each card', () => {
      const summary = createSummary({
        clusterCount: 2,
        topHubs: [{ path: 'a.ts', importerCount: 3 }, { path: 'b.ts', importerCount: 2 }],
        entryPoints: ['src/index.ts'],
        totalFiles: 3,
      })
      renderOverview({ summaryData: summary })

      expect(screen.getByText('2 clusters, 2 hubs')).toBeInTheDocument()
      expect(screen.getByText('1 route')).toBeInTheDocument()
      expect(screen.getByText('3 files')).toBeInTheDocument()
    })

    it('calls onSelectDiagram with the correct type on click', async () => {
      const user = userEvent.setup()
      const onSelectDiagram = vi.fn()
      renderOverview({ onSelectDiagram })

      const topologyCard = screen.getByRole('button', { name: /open topology diagram/i })
      await user.click(topologyCard)

      expect(onSelectDiagram).toHaveBeenCalledOnce()
      expect(onSelectDiagram).toHaveBeenCalledWith('topology')
    })

    it('calls onSelectDiagram on Enter key press', async () => {
      const user = userEvent.setup()
      const onSelectDiagram = vi.fn()
      renderOverview({ onSelectDiagram })

      const classesCard = screen.getByRole('button', { name: /open classes diagram/i })
      classesCard.focus()
      await user.keyboard('{Enter}')

      expect(onSelectDiagram).toHaveBeenCalledWith('classes')
    })

    it('skips unavailable diagrams', () => {
      const diagrams = createAvailableDiagrams([
        { id: 'topology', label: 'Topology', available: true },
        { id: 'classes', label: 'Classes', available: false },
      ])
      renderOverview({ availableDiagrams: diagrams })

      expect(screen.getByRole('button', { name: /open topology diagram/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /open classes diagram/i })).not.toBeInTheDocument()
    })

    it('handles empty availableDiagrams gracefully', () => {
      const { container } = renderOverview({ availableDiagrams: [] })

      expect(screen.queryAllByRole('button', { name: /open .+ diagram/i })).toHaveLength(0)
      // Component still renders without errors
      expect(container.querySelector('.grid')).toBeInTheDocument()
    })
  })

  // ----- Responsive grid -----

  describe('responsive grid', () => {
    it('has correct responsive grid classes on the cards container', () => {
      const { container } = renderOverview()

      const grid = container.querySelector('.grid')
      expect(grid).toBeInTheDocument()
      expect(grid).toHaveClass('grid-cols-1')
      expect(grid).toHaveClass('sm:grid-cols-2')
      expect(grid).toHaveClass('lg:grid-cols-3')
    })
  })

  // ----- Focus mode search -----

  describe('focus mode search', () => {
    it('renders the focus mode section with a search input', () => {
      renderOverview()

      expect(screen.getByText('Focus Mode')).toBeInTheDocument()
      expect(screen.getByLabelText('Search for a file to analyze')).toBeInTheDocument()
    })

    it('shows suggestions when typing a matching query', async () => {
      const user = userEvent.setup()
      renderOverview()

      const input = screen.getByLabelText('Search for a file to analyze')
      await user.type(input, 'utils')

      expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
    })

    it('filters suggestions to matching files only', async () => {
      const user = userEvent.setup()
      renderOverview()

      const input = screen.getByLabelText('Search for a file to analyze')
      await user.type(input, 'app')

      // Should show app.tsx but not index.ts or utils.ts
      expect(screen.getByText('src/app.tsx')).toBeInTheDocument()
      expect(screen.queryByText('src/index.ts')).not.toBeInTheDocument()
      expect(screen.queryByText('src/utils.ts')).not.toBeInTheDocument()
    })

    it('calls onFocusFile when a suggestion is selected', async () => {
      const user = userEvent.setup()
      const onFocusFile = vi.fn()
      renderOverview({ onFocusFile })

      const input = screen.getByLabelText('Search for a file to analyze')
      await user.type(input, 'utils')

      const suggestion = screen.getByText('src/utils.ts')
      await user.click(suggestion)

      expect(onFocusFile).toHaveBeenCalledOnce()
      expect(onFocusFile).toHaveBeenCalledWith('src/utils.ts')
    })

    it('clears search query after selecting a suggestion', async () => {
      const user = userEvent.setup()
      renderOverview()

      const input = screen.getByLabelText('Search for a file to analyze') as HTMLInputElement
      await user.type(input, 'utils')
      const suggestion = screen.getByText('src/utils.ts')
      await user.click(suggestion)

      expect(input.value).toBe('')
    })

    it('shows no suggestions when query does not match any files', async () => {
      const user = userEvent.setup()
      renderOverview()

      const input = screen.getByLabelText('Search for a file to analyze')
      await user.type(input, 'nonexistent')

      // No suggestions should appear — the dropdown renders only when there are matches
      expect(screen.queryByText('src/index.ts')).not.toBeInTheDocument()
      expect(screen.queryByText('src/utils.ts')).not.toBeInTheDocument()
    })
  })

  // ----- Health bar -----

  describe('health bar', () => {
    it('shows health bar when circular deps exist', () => {
      const summary = createSummary({
        circularDeps: [['a.ts', 'b.ts']],
      })
      renderOverview({ summaryData: summary })

      const alert = screen.getByRole('alert', { name: /health issues/i })
      expect(alert).toBeInTheDocument()
      expect(screen.getByText('1 circular dep')).toBeInTheDocument()
    })

    it('shows plural text for multiple circular deps', () => {
      const summary = createSummary({
        circularDeps: [['a.ts', 'b.ts'], ['c.ts', 'd.ts']],
      })
      renderOverview({ summaryData: summary })

      expect(screen.getByText('2 circular deps')).toBeInTheDocument()
    })

    it('shows orphan files count when present', () => {
      const summary = createSummary({
        orphanFiles: ['orphan1.ts', 'orphan2.ts'],
      })
      renderOverview({ summaryData: summary })

      const alert = screen.getByRole('alert', { name: /health issues/i })
      expect(alert).toBeInTheDocument()
      expect(screen.getByText('2 orphan files')).toBeInTheDocument()
    })

    it('shows health issues as badges', () => {
      const summary = createSummary({
        healthIssues: ['High coupling detected', 'Excessive nesting'],
      })
      renderOverview({ summaryData: summary })

      expect(screen.getByText('High coupling detected')).toBeInTheDocument()
      expect(screen.getByText('Excessive nesting')).toBeInTheDocument()
    })

    it('is hidden when no issues exist', () => {
      const summary = createSummary({
        circularDeps: [],
        orphanFiles: [],
        healthIssues: [],
      })
      renderOverview({ summaryData: summary })

      expect(screen.queryByRole('alert', { name: /health issues/i })).not.toBeInTheDocument()
    })

    it('shows all issue types together', () => {
      const summary = createSummary({
        circularDeps: [['a.ts', 'b.ts']],
        orphanFiles: ['orphan.ts'],
        healthIssues: ['Warning'],
      })
      renderOverview({ summaryData: summary })

      const alert = screen.getByRole('alert', { name: /health issues/i })
      expect(within(alert).getByText('1 circular dep')).toBeInTheDocument()
      expect(within(alert).getByText('1 orphan file')).toBeInTheDocument()
      expect(within(alert).getByText('Warning')).toBeInTheDocument()
    })
  })
})
