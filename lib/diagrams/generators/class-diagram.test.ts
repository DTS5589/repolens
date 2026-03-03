import { generateClassDiagram } from '@/lib/diagrams/generators/class-diagram'
import { createRealisticAnalysis, createMinimalAnalysis, createEmptyAnalysis } from '@/lib/diagrams/__fixtures__/mock-analysis'

describe('generateClassDiagram', () => {
  it('produces a classDiagram with types for realistic analysis', () => {
    const result = generateClassDiagram(createRealisticAnalysis())

    expect(result.type).toBe('classes')
    expect(result.chart).toContain('classDiagram')
    // Should include the interface and class from mock data
    expect(result.chart).toContain('ButtonProps')
    expect(result.chart).toContain('<<interface>>')
    expect(result.chart).toContain('ApiClient')
    expect(result.stats.totalNodes).toBeGreaterThanOrEqual(3)
  })

  it('renders enum types with <<enumeration>> stereotype', () => {
    const result = generateClassDiagram(createRealisticAnalysis())

    expect(result.chart).toContain('Theme')
    expect(result.chart).toContain('<<enumeration>>')
  })

  it('renders extends/implements relationships', () => {
    const result = generateClassDiagram(createRealisticAnalysis())

    // ApiClient extends BaseClient
    expect(result.chart).toContain('BaseClient <|-- ApiClient')
    // ApiClient implements HttpClient
    expect(result.chart).toContain('HttpClient <|.. ApiClient')
    expect(result.stats.totalEdges).toBeGreaterThanOrEqual(2)
  })

  it('shows fallback message when no types exist', () => {
    const result = generateClassDiagram(createMinimalAnalysis())

    expect(result.chart).toContain('No classes, interfaces, or types found')
    expect(result.stats.totalNodes).toBe(0)
  })

  it('handles empty analysis without crashing', () => {
    const result = generateClassDiagram(createEmptyAnalysis())

    expect(result.type).toBe('classes')
    expect(result.stats.totalNodes).toBe(0)
  })

  it('includes parent types referenced by extends even if not in top N', () => {
    const result = generateClassDiagram(createRealisticAnalysis())

    // BaseClient and HttpClient are referenced via extends/implements
    // They should be pulled in even if they wouldn't be in the top 40
    expect(result.chart).toContain('BaseClient')
    expect(result.chart).toContain('HttpClient')
  })

  it('populates nodePathMap', () => {
    const result = generateClassDiagram(createRealisticAnalysis())

    expect(result.nodePathMap.size).toBeGreaterThan(0)
    // All type names should map to their source file paths
    expect(result.nodePathMap.get('ButtonProps')).toBe('src/types.ts')
    expect(result.nodePathMap.get('ApiClient')).toBe('src/services/api.ts')
  })
})
