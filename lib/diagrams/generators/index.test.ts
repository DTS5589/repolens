import { generateDiagram } from '@/lib/diagrams/generators/index'
import { createRealisticAnalysis, createMockCodeIndex, createMockFileTree } from '@/lib/diagrams/__fixtures__/mock-analysis'
import type { CodeIndex } from '@/lib/code/code-index'

describe('generateDiagram dispatcher', () => {
  const analysis = createRealisticAnalysis()
  const codeIndex = createMockCodeIndex()
  const files = createMockFileTree()

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

  it('defaults to topology for unrecognized type', () => {
    const result = generateDiagram('unknown' as any, codeIndex, files, analysis)
    expect(result.type).toBe('topology')
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

  it('routes "focus" with default empty target when focusTarget is omitted', () => {
    const result = generateDiagram('focus', codeIndex, files, analysis)
    expect(result.type).toBe('focus')
    // Should not crash even without focusTarget/focusHops
  })

  it('routes all diagram types without crashing on empty analysis', () => {
    const emptyIndex: CodeIndex = {
      files: new Map(),
      totalFiles: 0,
      totalLines: 0,
      isIndexing: false,
    }
    const types: Array<'topology' | 'imports' | 'classes' | 'entrypoints' | 'modules' | 'treemap' | 'externals'> = [
      'topology', 'imports', 'classes', 'entrypoints', 'modules', 'treemap', 'externals',
    ]
    for (const type of types) {
      const result = generateDiagram(type, emptyIndex, [])
      expect(result.type).toBe(type)
    }
  })
})
