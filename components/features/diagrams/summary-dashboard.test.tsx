import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SummaryDashboard } from './summary-dashboard'
import type { ProjectSummary } from '@/lib/diagrams/types'

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

function createSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    languages: [
      { lang: 'typescript', files: 80, lines: 12_000, pct: 60 },
      { lang: 'css', files: 20, lines: 3_000, pct: 20 },
      { lang: 'json', files: 15, lines: 2_000, pct: 13.3 },
      { lang: 'markdown', files: 5, lines: 1_000, pct: 6.7 },
    ],
    topHubs: [
      { path: 'src/utils.ts', importerCount: 25 },
      { path: 'src/types.ts', importerCount: 18 },
    ],
    topConsumers: [
      { path: 'src/app.tsx', depCount: 12 },
      { path: 'src/main.ts', depCount: 9 },
    ],
    circularDeps: [['src/a.ts', 'src/b.ts']],
    orphanFiles: ['src/orphan.ts'],
    entryPoints: ['src/index.ts'],
    connectors: ['src/bridge.ts'],
    clusterCount: 4,
    maxDepth: 6,
    totalFiles: 120,
    totalLines: 18_000,
    frameworkDetected: 'Next.js',
    primaryLanguage: 'TypeScript',
    healthIssues: ['Large file: src/big.ts exceeds 500 lines'],
    folderBreakdown: [
      { folder: 'src', files: 80, lines: 12_000, pct: 66.7 },
      { folder: 'lib', files: 30, lines: 4_000, pct: 22.2 },
      { folder: 'test', files: 10, lines: 2_000, pct: 11.1 },
    ],
    externalDeps: [
      { pkg: 'react', usedByCount: 45 },
      { pkg: 'next', usedByCount: 22 },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SummaryDashboard', () => {
  describe('stat cards', () => {
    it('renders totalFiles and totalLines', () => {
      render(<SummaryDashboard data={createSummary()} />)
      // toLocaleString formats vary — look for the raw numbers
      expect(screen.getByText('Files')).toBeInTheDocument()
      expect(screen.getByText('Lines of Code')).toBeInTheDocument()
      expect(screen.getByText('120')).toBeInTheDocument()
      expect(screen.getByText('18,000')).toBeInTheDocument()
    })

    it('renders clusterCount and maxDepth stats', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('Clusters')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('Max Depth')).toBeInTheDocument()
      expect(screen.getByText('6')).toBeInTheDocument()
    })
  })

  describe('framework and badges', () => {
    it('displays primary language badge', () => {
      render(<SummaryDashboard data={createSummary()} />)
      // "TypeScript" appears in the badge and in the language legend — just verify at least one exists
      const matches = screen.getAllByText('TypeScript')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('displays framework badge when framework is detected', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('Next.js')).toBeInTheDocument()
    })

    it('hides framework badge when frameworkDetected is null', () => {
      render(<SummaryDashboard data={createSummary({ frameworkDetected: null })} />)
      expect(screen.queryByText('Next.js')).not.toBeInTheDocument()
    })

    it('displays entry points count', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('1 entry point')).toBeInTheDocument()
    })

    it('pluralizes entry points correctly', () => {
      render(
        <SummaryDashboard
          data={createSummary({ entryPoints: ['a.ts', 'b.ts'] })}
        />,
      )
      expect(screen.getByText('2 entry points')).toBeInTheDocument()
    })

    it('displays connectors count', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('1 connector')).toBeInTheDocument()
    })

    it('hides entry points badge when empty', () => {
      render(<SummaryDashboard data={createSummary({ entryPoints: [] })} />)
      expect(screen.queryByText(/entry point/)).not.toBeInTheDocument()
    })

    it('hides connectors badge when empty', () => {
      render(<SummaryDashboard data={createSummary({ connectors: [] })} />)
      expect(screen.queryByText(/connector/)).not.toBeInTheDocument()
    })
  })

  describe('language breakdown', () => {
    it('renders language names and percentages', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('Language Breakdown')).toBeInTheDocument()
      // LANGUAGE_LABELS maps 'typescript' → 'TypeScript'
      // The primary language badge also says TypeScript, so we check for percentages
      expect(screen.getByText('60.0%')).toBeInTheDocument()
      expect(screen.getByText('20.0%')).toBeInTheDocument()
      expect(screen.getByText('13.3%')).toBeInTheDocument()
    })

    it('renders the language distribution bar with role="img"', () => {
      const { container } = render(<SummaryDashboard data={createSummary()} />)
      const bar = container.querySelector('[role="img"]')
      expect(bar).toBeInTheDocument()
      expect(bar).toHaveAttribute('aria-label', 'Language distribution bar')
    })

    it('hides language breakdown when languages array is empty', () => {
      render(<SummaryDashboard data={createSummary({ languages: [] })} />)
      expect(screen.queryByText('Language Breakdown')).not.toBeInTheDocument()
    })
  })

  describe('folder breakdown', () => {
    it('renders folder names and file counts', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('Folder Breakdown')).toBeInTheDocument()
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('80 files')).toBeInTheDocument()
      expect(screen.getByText('lib')).toBeInTheDocument()
      expect(screen.getByText('30 files')).toBeInTheDocument()
    })

    it('hides folder breakdown when folderBreakdown is empty', () => {
      render(<SummaryDashboard data={createSummary({ folderBreakdown: [] })} />)
      expect(screen.queryByText('Folder Breakdown')).not.toBeInTheDocument()
    })
  })

  describe('hubs and consumers', () => {
    it('renders top hubs with importer counts', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('Most Imported (Hubs)')).toBeInTheDocument()
      expect(screen.getByText('utils.ts')).toBeInTheDocument()
      expect(screen.getByText('25 importers')).toBeInTheDocument()
    })

    it('renders top consumers with dep counts', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('Most Dependencies (Consumers)')).toBeInTheDocument()
      expect(screen.getByText('app.tsx')).toBeInTheDocument()
      expect(screen.getByText('12 deps')).toBeInTheDocument()
    })

    it('hides hubs section when topHubs is empty', () => {
      render(<SummaryDashboard data={createSummary({ topHubs: [] })} />)
      expect(screen.queryByText('Most Imported (Hubs)')).not.toBeInTheDocument()
    })

    it('hides consumers section when topConsumers is empty', () => {
      render(<SummaryDashboard data={createSummary({ topConsumers: [] })} />)
      expect(screen.queryByText('Most Dependencies (Consumers)')).not.toBeInTheDocument()
    })
  })

  describe('external dependencies', () => {
    it('renders external dependencies', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('External Dependencies')).toBeInTheDocument()
      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.getByText('(45)')).toBeInTheDocument()
    })

    it('hides externals section when externalDeps is empty', () => {
      render(<SummaryDashboard data={createSummary({ externalDeps: [] })} />)
      expect(screen.queryByText('External Dependencies')).not.toBeInTheDocument()
    })
  })

  describe('health issues', () => {
    it('renders health issues section when issues exist', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText('Health Issues')).toBeInTheDocument()
      expect(screen.getByText('Large file: src/big.ts exceeds 500 lines')).toBeInTheDocument()
    })

    it('renders circular dependency count', () => {
      render(<SummaryDashboard data={createSummary()} />)
      // "1" appears for both circular deps and orphan files — verify the circular dep label is present
      expect(screen.getByText('circular dependency')).toBeInTheDocument()
    })

    it('pluralizes circular dependencies correctly', () => {
      render(
        <SummaryDashboard
          data={createSummary({
            circularDeps: [
              ['a.ts', 'b.ts'],
              ['c.ts', 'd.ts'],
            ],
          })}
        />,
      )
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('circular dependencies')).toBeInTheDocument()
    })

    it('renders orphan file count', () => {
      render(<SummaryDashboard data={createSummary()} />)
      expect(screen.getByText(/orphan file/)).toBeInTheDocument()
    })

    it('hides health section when all health arrays are empty', () => {
      render(
        <SummaryDashboard
          data={createSummary({
            healthIssues: [],
            circularDeps: [],
            orphanFiles: [],
          })}
        />,
      )
      expect(screen.queryByText('Health Issues')).not.toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('renders with minimal data (all arrays empty)', () => {
      const minimal = createSummary({
        languages: [],
        topHubs: [],
        topConsumers: [],
        circularDeps: [],
        orphanFiles: [],
        entryPoints: [],
        connectors: [],
        healthIssues: [],
        folderBreakdown: [],
        externalDeps: [],
        totalFiles: 0,
        totalLines: 0,
      })
      const { container } = render(<SummaryDashboard data={minimal} />)
      // Should still render stat cards
      expect(screen.getByText('Files')).toBeInTheDocument()
      // "0" appears for both totalFiles and totalLines — just verify at least two stat cards show 0
      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBeGreaterThanOrEqual(2)
      // Container should exist
      expect(container.firstChild).toBeInTheDocument()
    })

    it('passes className prop to root element', () => {
      const { container } = render(
        <SummaryDashboard data={createSummary()} className="custom-class" />,
      )
      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('limits languages to 8', () => {
      const manyLangs = Array.from({ length: 12 }, (_, i) => ({
        lang: `lang${i}`,
        files: 10,
        lines: 1000,
        pct: 8.33,
      }))
      render(<SummaryDashboard data={createSummary({ languages: manyLangs })} />)
      // Should only show 8 items in the legend (8.33% repeated 8 times)
      const pctElements = screen.getAllByText('8.3%')
      expect(pctElements.length).toBe(8)
    })
  })
})
