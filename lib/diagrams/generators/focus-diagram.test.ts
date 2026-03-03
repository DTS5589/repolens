import { generateFocusDiagram } from '@/lib/diagrams/generators/focus-diagram'
import { createRealisticAnalysis, createMinimalAnalysis, createEmptyAnalysis } from '@/lib/diagrams/__fixtures__/mock-analysis'

describe('generateFocusDiagram', () => {
  it('shows immediate neighbors with 1-hop focus', () => {
    const analysis = createRealisticAnalysis()
    const result = generateFocusDiagram(analysis, 'src/app.tsx', 1)

    expect(result.type).toBe('focus')
    expect(result.title).toContain('app.tsx')
    expect(result.title).toContain('1-hop')
    expect(result.chart).toContain('flowchart LR')
    expect(result.chart).toContain('targetStyle')
    // Should include direct deps (Button.tsx, helpers.ts) and importers (index.ts)
    expect(result.stats.totalNodes).toBeGreaterThanOrEqual(4)
    expect(result.stats.totalEdges).toBeGreaterThan(0)
  })

  it('expands neighborhood with 2-hop focus', () => {
    const analysis = createRealisticAnalysis()
    const result1 = generateFocusDiagram(analysis, 'src/app.tsx', 1)
    const result2 = generateFocusDiagram(analysis, 'src/app.tsx', 2)

    // 2-hop should include more nodes than 1-hop
    expect(result2.stats.totalNodes).toBeGreaterThanOrEqual(result1.stats.totalNodes)
    expect(result2.title).toContain('2-hop')
  })

  it('shows isolated message for a file with no connections', () => {
    const analysis = createRealisticAnalysis()
    const result = generateFocusDiagram(analysis, 'src/orphan.ts', 1)

    expect(result.chart).toContain('No connections found')
    expect(result.stats.totalNodes).toBe(1)
  })

  it('handles a file not in the graph', () => {
    const analysis = createRealisticAnalysis()
    const result = generateFocusDiagram(analysis, 'nonexistent/file.ts', 1)

    expect(result.type).toBe('focus')
    expect(result.chart).toContain('No connections found')
    expect(result.stats.totalNodes).toBe(1)
  })

  it('populates nodePathMap for all neighborhood nodes', () => {
    const analysis = createRealisticAnalysis()
    const result = generateFocusDiagram(analysis, 'src/types.ts', 1)

    // src/types.ts is a hub, imported by multiple files
    expect(result.nodePathMap.size).toBeGreaterThan(1)
    for (const path of result.nodePathMap.values()) {
      expect(path).toBeTruthy()
    }
  })

  it('handles completely empty analysis without crashing', () => {
    const analysis = createEmptyAnalysis()
    const result = generateFocusDiagram(analysis, 'any-file.ts', 1)

    expect(result.type).toBe('focus')
    expect(result.chart).toContain('No connections found')
    expect(result.stats.totalNodes).toBe(1)
  })

  it('handles empty string as focusTarget', () => {
    const analysis = createRealisticAnalysis()
    const result = generateFocusDiagram(analysis, '', 1)

    expect(result.type).toBe('focus')
    // Empty target should not crash
    expect(result.stats.totalNodes).toBeGreaterThanOrEqual(1)
  })
})
