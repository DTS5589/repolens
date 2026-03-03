import { generateModuleUsageTree } from '@/lib/diagrams/generators/module-usage'
import { createRealisticAnalysis, createMinimalAnalysis, createEmptyAnalysis } from '@/lib/diagrams/__fixtures__/mock-analysis'

describe('generateModuleUsageTree', () => {
  it('produces a JSX component tree when jsxComponents exist', () => {
    const result = generateModuleUsageTree(createRealisticAnalysis())

    expect(result.type).toBe('modules')
    expect(result.title).toContain('Component Tree')
    expect(result.chart).toContain('flowchart TD')
    // Should have edges from JSX render relationships
    expect(result.chart).toContain('-->')
    expect(result.stats.totalNodes).toBeGreaterThan(0)
  })

  it('falls back to hub-based tree when no JSX components', () => {
    const analysis = createRealisticAnalysis()
    // Remove all JSX component data
    for (const [, fileAnalysis] of analysis.files) {
      fileAnalysis.jsxComponents = []
      for (const exp of fileAnalysis.exports) {
        if (exp.kind === 'component') exp.kind = 'function'
      }
    }

    const result = generateModuleUsageTree(analysis)

    expect(result.type).toBe('modules')
    // Should show hub usage (src/types.ts is a hub)
    expect(result.chart).toContain('hubStyle')
    expect(result.stats.totalNodes).toBeGreaterThan(0)
  })

  it('shows empty message if no hubs and no JSX components', () => {
    const result = generateModuleUsageTree(createMinimalAnalysis())

    expect(result.type).toBe('modules')
    expect(result.chart).toContain('No module dependency tree to show')
    expect(result.stats.totalNodes).toBe(0)
  })

  it('handles empty analysis', () => {
    const result = generateModuleUsageTree(createEmptyAnalysis())

    expect(result.type).toBe('modules')
    expect(result.stats.totalNodes).toBe(0)
  })
})
