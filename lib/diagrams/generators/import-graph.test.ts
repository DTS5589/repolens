import { generateImportGraph } from '@/lib/diagrams/generators/import-graph'
import { createRealisticAnalysis, createMinimalAnalysis, createEmptyAnalysis, createLargeAnalysis } from '@/lib/diagrams/__fixtures__/mock-analysis'

describe('generateImportGraph', () => {
  it('returns a valid MermaidDiagramResult for a single file', () => {
    const result = generateImportGraph(createMinimalAnalysis())

    expect(result.type).toBe('imports')
    expect(result.chart).toContain('flowchart LR')
    expect(result.stats.totalNodes).toBe(1)
  })

  it('creates edges matching the dependency graph', () => {
    const result = generateImportGraph(createRealisticAnalysis())

    expect(result.chart).toContain('flowchart LR')
    // File-level view (under 50 files), should create subgraphs by directory
    expect(result.chart).toContain('subgraph')
    // Should have edges
    expect(result.chart).toContain('-->')
    // Circular deps rendered as dotted
    expect(result.chart).toContain('circular')
    expect(result.stats.totalNodes).toBe(8)
  })

  it('handles empty analysis', () => {
    const result = generateImportGraph(createEmptyAnalysis())

    expect(result.type).toBe('imports')
    expect(result.stats.totalNodes).toBe(0)
  })

  it('populates nodePathMap correctly', () => {
    const result = generateImportGraph(createRealisticAnalysis())

    expect(result.nodePathMap.size).toBeGreaterThan(0)
    // All mapped paths should be files from our analysis
    for (const path of result.nodePathMap.values()) {
      expect(path).toBeTruthy()
    }
  })

  it('collapses to directory-level view for large projects (>50 files)', () => {
    const result = generateImportGraph(createLargeAnalysis(60))

    expect(result.type).toBe('imports')
    expect(result.title).toContain('collapsed')
    expect(result.title).toContain('dirs')
    // Should render directories, not individual files
    expect(result.chart).toContain('files)')
    // Directory-level edges should show counts
    expect(result.chart).toContain('-->')
    // Node count should be directory count, not 60
    expect(result.stats.totalNodes).toBeLessThan(60)
  })
})
