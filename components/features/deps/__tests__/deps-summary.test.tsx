import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DepsSummary } from '../deps-summary'
import type { DependencyHealth, NpmPackageMeta } from '@/lib/deps/types'

function makeDep(overrides: Partial<DependencyHealth> = {}): DependencyHealth {
  return {
    packageName: 'test-pkg',
    currentVersion: '1.0.0',
    latestVersion: '1.0.0',
    npmMeta: null,
    isOutdated: false,
    outdatedType: null,
    cveCount: 0,
    score: 85,
    grade: 'A',
    ...overrides,
  }
}

describe('DepsSummary', () => {
  it('renders total dependency count', () => {
    const deps = [
      makeDep({ packageName: 'react' }),
      makeDep({ packageName: 'vue' }),
      makeDep({ packageName: 'next' }),
    ]

    render(<DepsSummary deps={deps} />)

    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Dependencies')).toBeInTheDocument()
  })

  it('renders grade distribution', () => {
    const deps = [
      makeDep({ packageName: 'pkg-a1', grade: 'A', score: 90 }),
      makeDep({ packageName: 'pkg-a2', grade: 'A', score: 85 }),
      makeDep({ packageName: 'pkg-b1', grade: 'B', score: 70 }),
      makeDep({ packageName: 'pkg-f1', grade: 'F', score: 10 }),
    ]

    render(<DepsSummary deps={deps} />)

    // A: 2, B: 1, F: 1
    expect(screen.getByText('A: 2')).toBeInTheDocument()
    expect(screen.getByText('B: 1')).toBeInTheDocument()
    expect(screen.getByText('F: 1')).toBeInTheDocument()
  })

  it('does not render grade pills for grades with 0 count', () => {
    const deps = [makeDep({ grade: 'A' })]

    render(<DepsSummary deps={deps} />)

    expect(screen.getByText('A: 1')).toBeInTheDocument()
    expect(screen.queryByText(/^B:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^C:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^D:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^F:/)).not.toBeInTheDocument()
  })

  it('renders total CVE count', () => {
    const deps = [
      makeDep({ packageName: 'react', cveCount: 2 }),
      makeDep({ packageName: 'vue', cveCount: 3 }),
      makeDep({ packageName: 'next', cveCount: 0 }),
    ]

    render(<DepsSummary deps={deps} />)

    expect(screen.getByText('Known CVEs')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders zero CVE count', () => {
    const deps = [makeDep({ cveCount: 0 })]
    render(<DepsSummary deps={deps} />)
    expect(screen.getByText('Known CVEs')).toBeInTheDocument()
    // Multiple "0" texts may appear (CVEs, outdated) — check that the CVE card contains 0
    const cveLabel = screen.getByText('Known CVEs')
    const cveCard = cveLabel.closest('[class*="flex"]')!
    expect(cveCard.textContent).toContain('0')
  })

  it('renders total outdated count with breakdown', () => {
    const deps = [
      makeDep({ packageName: 'a', outdatedType: 'major', isOutdated: true }),
      makeDep({ packageName: 'b', outdatedType: 'minor', isOutdated: true }),
      makeDep({ packageName: 'c', outdatedType: 'patch', isOutdated: true }),
      makeDep({ packageName: 'd', outdatedType: null, isOutdated: false }),
    ]

    render(<DepsSummary deps={deps} />)

    expect(screen.getByText('Outdated')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('1 major')).toBeInTheDocument()
    expect(screen.getByText('1 minor')).toBeInTheDocument()
    expect(screen.getByText('1 patch')).toBeInTheDocument()
  })

  it('renders empty state gracefully', () => {
    render(<DepsSummary deps={[]} />)

    expect(screen.getByText('Dependencies')).toBeInTheDocument()
    // Total should show 0
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1)
  })
})
