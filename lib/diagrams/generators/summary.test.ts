import { generateProjectSummary } from '@/lib/diagrams/generators/summary'
import { createRealisticAnalysis, createMinimalAnalysis, createMockCodeIndex } from '@/lib/diagrams/__fixtures__/mock-analysis'
import { createEmptyIndex } from '@/lib/code/code-index'

describe('generateProjectSummary', () => {
  it('returns valid SummaryDiagramResult with realistic data', () => {
    const analysis = createRealisticAnalysis()
    const codeIndex = createMockCodeIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.type).toBe('summary')
    expect(result.title).toBe('Project Summary')
    expect(result.data.totalFiles).toBe(8)
    expect(result.data.totalLines).toBeGreaterThan(0)
    expect(result.data.primaryLanguage).toBe('typescript')
  })

  it('computes language breakdown', () => {
    const analysis = createRealisticAnalysis()
    const codeIndex = createMockCodeIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.data.languages.length).toBeGreaterThan(0)
    expect(result.data.languages[0].lang).toBe('typescript')
    expect(result.data.languages[0].files).toBeGreaterThan(0)
  })

  it('identifies circular dependencies', () => {
    const analysis = createRealisticAnalysis()
    const codeIndex = createMockCodeIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.data.circularDeps).toHaveLength(1)
    expect(result.data.circularDeps[0]).toContain('src/services/api.ts')
  })

  it('lists orphan files', () => {
    const analysis = createRealisticAnalysis()
    const codeIndex = createMockCodeIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.data.orphanFiles).toContain('src/orphan.ts')
  })

  it('lists top hubs sorted by importer count', () => {
    const analysis = createRealisticAnalysis()
    const codeIndex = createMockCodeIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.data.topHubs.length).toBeGreaterThan(0)
    expect(result.data.topHubs[0].path).toBe('src/types.ts')
    expect(result.data.topHubs[0].importerCount).toBeGreaterThan(0)
  })

  it('lists external dependencies sorted by usage', () => {
    const analysis = createRealisticAnalysis()
    const codeIndex = createMockCodeIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.data.externalDeps.length).toBe(2) // react, axios
    expect(result.data.externalDeps[0].pkg).toBe('react')
    expect(result.data.externalDeps[0].usedByCount).toBe(3)
  })

  it('generates health issues for circular deps', () => {
    const analysis = createRealisticAnalysis()
    const codeIndex = createMockCodeIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.data.healthIssues.some(h => h.includes('circular'))).toBe(true)
  })

  it('handles minimal analysis with empty code index', () => {
    const analysis = createMinimalAnalysis()
    const codeIndex = createEmptyIndex()
    const result = generateProjectSummary(analysis, codeIndex)

    expect(result.type).toBe('summary')
    expect(result.data.totalFiles).toBe(1)
    expect(result.data.totalLines).toBe(0)
    expect(result.stats.totalNodes).toBe(1)
  })
})
