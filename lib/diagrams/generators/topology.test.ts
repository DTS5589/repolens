import { generateTopologyDiagram } from '@/lib/diagrams/generators/topology'
import { createRealisticAnalysis, createMinimalAnalysis, createEmptyAnalysis, createLargeAnalysis } from '@/lib/diagrams/__fixtures__/mock-analysis'

describe('generateTopologyDiagram', () => {
  it('returns a valid MermaidDiagramResult for minimal input', () => {
    const result = generateTopologyDiagram(createMinimalAnalysis())

    expect(result.type).toBe('topology')
    expect(result.title).toContain('Architecture')
    expect(result.chart).toContain('flowchart TD')
    expect(result.stats.totalNodes).toBe(1)
    expect(result.nodePathMap.size).toBeGreaterThanOrEqual(1)
  })

  it('produces nodes and edges for a realistic analysis', () => {
    const result = generateTopologyDiagram(createRealisticAnalysis())

    expect(result.chart).toContain('flowchart TD')
    // Should reference file nodes
    expect(result.chart).toContain('entryStyle')
    expect(result.chart).toContain('hubStyle')
    expect(result.chart).toContain('orphanStyle')
    // Should have edges
    expect(result.chart).toContain('-->')
    // Circular dep should be displayed as dotted
    expect(result.chart).toContain('circular')
    expect(result.stats.totalNodes).toBe(8)
  })

  it('groups nodes into cluster subgraphs', () => {
    const result = generateTopologyDiagram(createRealisticAnalysis())

    // Both clusters have 2+ files, so they should be rendered as subgraphs
    expect(result.chart).toContain('subgraph cluster_0')
    expect(result.chart).toContain('subgraph cluster_1')
  })

  it('handles empty analysis without crashing', () => {
    const result = generateTopologyDiagram(createEmptyAnalysis())

    expect(result.type).toBe('topology')
    expect(result.stats.totalNodes).toBe(0)
  })

  it('populates nodePathMap for all rendered nodes', () => {
    const result = generateTopologyDiagram(createRealisticAnalysis())

    for (const [_id, path] of result.nodePathMap) {
      expect(path).toBeTruthy()
    }
  })

  it('collapses to directory-level view for large projects (>80 files)', () => {
    const result = generateTopologyDiagram(createLargeAnalysis(100))

    expect(result.type).toBe('topology')
    // Should reference directories, not individual files
    expect(result.chart).toContain('files)')
    // Should aggregate edges between directories
    expect(result.chart).toContain('-->')
    // Should have role-based classDefs
    expect(result.chart).toContain('classDef entryStyle')
    expect(result.chart).toContain('classDef hubStyle')
    // Node count should be number of unique directories, not 100
    expect(result.stats.totalNodes).toBeLessThan(100)
  })
})
