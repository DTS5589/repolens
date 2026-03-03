import { generateExternalDeps } from '@/lib/diagrams/generators/external-deps'
import { createRealisticAnalysis, createMinimalAnalysis, createEmptyAnalysis } from '@/lib/diagrams/__fixtures__/mock-analysis'

describe('generateExternalDeps', () => {
  it('categorizes external packages for a realistic analysis', () => {
    const result = generateExternalDeps(createRealisticAnalysis())

    expect(result.type).toBe('externals')
    expect(result.chart).toContain('flowchart LR')
    // react should be categorized under "UI Framework"
    expect(result.chart).toContain('UI Framework')
    expect(result.chart).toContain('react')
    // axios is State & Data category
    expect(result.chart).toContain('axios')
    expect(result.stats.totalNodes).toBeGreaterThan(0)
  })

  it('shows project node linking to category subgraphs', () => {
    const result = generateExternalDeps(createRealisticAnalysis())

    expect(result.chart).toContain('Project')
    expect(result.chart).toContain('imports')
    expect(result.chart).toContain('subgraph')
  })

  it('shows empty message when no external deps exist', () => {
    const result = generateExternalDeps(createMinimalAnalysis())

    expect(result.type).toBe('externals')
    expect(result.chart).toContain('No external dependencies detected')
    expect(result.stats.totalNodes).toBe(0)
  })

  it('handles empty analysis', () => {
    const result = generateExternalDeps(createEmptyAnalysis())

    expect(result.type).toBe('externals')
    expect(result.stats.totalNodes).toBe(0)
  })

  it('includes import count in package labels', () => {
    const result = generateExternalDeps(createRealisticAnalysis())

    // react is used by 3 files
    expect(result.chart).toContain('react (3)')
  })

  it('uses Python categories when primaryLanguage is python', () => {
    const analysis = createRealisticAnalysis()
    analysis.primaryLanguage = 'python'
    analysis.graph.externalDeps = new Map([
      ['flask', new Set(['app.py'])],
      ['numpy', new Set(['data.py', 'analysis.py'])],
    ])

    const result = generateExternalDeps(analysis)

    expect(result.chart).toContain('Web Framework')
    expect(result.chart).toContain('Data Science')
  })
})
