import { generateDiagram } from '@/lib/diagrams/generators/index'
import { createRealisticAnalysis, createMockCodeIndex, createMockFileTree } from '@/lib/diagrams/__fixtures__/mock-analysis'
import type { CodeIndex } from '@/lib/code/code-index'

describe('generateDiagram dispatcher', () => {
  const analysis = createRealisticAnalysis()
  const codeIndex = createMockCodeIndex()
  const files = createMockFileTree()

  it('routes "summary" to generateProjectSummary', () => {
    const result = generateDiagram('summary', codeIndex, files, analysis)
    expect(result.type).toBe('summary')
    expect('data' in result).toBe(true)
  })

  it('routes "topology" to generateTopologyDiagram', () => {
    const result = generateDiagram('topology', codeIndex, files, analysis)
    expect(result.type).toBe('topology')
    expect('chart' in result).toBe(true)
  })

  it('routes "imports" to generateImportGraph', () => {
    const result = generateDiagram('imports', codeIndex, files, analysis)
    expect(result.type).toBe('imports')
    expect('chart' in result).toBe(true)
  })

  it('routes "classes" to generateClassDiagram', () => {
    const result = generateDiagram('classes', codeIndex, files, analysis)
    expect(result.type).toBe('classes')
  })

  it('routes "entrypoints" to generateEntryPoints', () => {
    const result = generateDiagram('entrypoints', codeIndex, files, analysis)
    expect(result.type).toBe('entrypoints')
  })

  it('routes "modules" to generateModuleUsageTree', () => {
    const result = generateDiagram('modules', codeIndex, files, analysis)
    expect(result.type).toBe('modules')
  })

  it('routes "treemap" to generateTreemap', () => {
    const result = generateDiagram('treemap', codeIndex, files, analysis)
    expect(result.type).toBe('treemap')
    expect('data' in result).toBe(true)
  })

  it('routes "externals" to generateExternalDeps', () => {
    const result = generateDiagram('externals', codeIndex, files, analysis)
    expect(result.type).toBe('externals')
  })

  it('routes "focus" to generateFocusDiagram with focusTarget', () => {
    const result = generateDiagram('focus', codeIndex, files, analysis, 'src/app.tsx', 1)
    expect(result.type).toBe('focus')
    expect('chart' in result).toBe(true)
  })

  it('defaults to summary for unrecognized type', () => {
    const result = generateDiagram('unknown' as any, codeIndex, files, analysis)
    expect(result.type).toBe('summary')
  })

  it('creates analysis from codeIndex if analysis is not provided', () => {
    // This tests the fallback path that calls analyzeCodebase.
    // With an empty code index, it should still return without crashing.
    const emptyIndex: CodeIndex = {
      files: new Map(),
      totalFiles: 0,
      totalLines: 0,
      isIndexing: false,
    }
    const result = generateDiagram('topology', emptyIndex, [])
    expect(result.type).toBe('topology')
  })
})
