import { scanStructuralIssues } from '@/lib/code/scanner/structural-scanner'
import { createEmptyIndex, indexFile } from '@/lib/code/code-index'
import type { FullAnalysis } from '@/lib/code/parser/types'

function makeAnalysis(overrides: Partial<FullAnalysis> = {}): FullAnalysis {
  return {
    files: new Map(),
    graph: {
      edges: new Map(),
      reverseEdges: new Map(),
      circular: [],
      externalDeps: new Map(),
    },
    topology: {
      entryPoints: [],
      hubs: [],
      orphans: [],
      leafNodes: [],
      connectors: [],
      clusters: [],
      depthMap: new Map(),
      maxDepth: 0,
    },
    detectedFramework: null,
    primaryLanguage: 'typescript',
    ...overrides,
  }
}

describe('scanStructuralIssues', () => {
  it('returns empty when analysis is null', () => {
    const index = createEmptyIndex()
    const result = scanStructuralIssues(index, null)
    expect(result).toHaveLength(0)
  })

  it('detects circular dependencies', () => {
    const index = createEmptyIndex()
    const analysis = makeAnalysis({
      graph: {
        edges: new Map(),
        reverseEdges: new Map(),
        circular: [['a.ts', 'b.ts']],
        externalDeps: new Map(),
      },
    })
    const result = scanStructuralIssues(index, analysis)
    const circular = result.filter(i => i.ruleId === 'circular-dep')
    expect(circular).toHaveLength(1)
    expect(circular[0].severity).toBe('warning')
  })

  it('detects large files (>400 lines)', () => {
    const longContent = Array(500).fill('const x = 1').join('\n')
    let index = createEmptyIndex()
    index = indexFile(index, 'src/big-file.ts', longContent, 'typescript')
    const analysis = makeAnalysis()

    const result = scanStructuralIssues(index, analysis)
    const largeFile = result.filter(i => i.ruleId === 'large-file')
    expect(largeFile).toHaveLength(1)
    expect(largeFile[0].severity).toBe('info')
  })

  it('flags very large files (>800 lines) as warning', () => {
    const longContent = Array(900).fill('const x = 1').join('\n')
    let index = createEmptyIndex()
    index = indexFile(index, 'src/huge-file.ts', longContent, 'typescript')
    const analysis = makeAnalysis()

    const result = scanStructuralIssues(index, analysis)
    const largeFile = result.filter(i => i.ruleId === 'large-file')
    expect(largeFile).toHaveLength(1)
    expect(largeFile[0].severity).toBe('warning')
  })

  it('detects high coupling (15+ importers)', () => {
    const index = createEmptyIndex()
    const importers = new Set(Array.from({ length: 16 }, (_, i) => `file${i}.ts`))
    const analysis = makeAnalysis({
      graph: {
        edges: new Map(),
        reverseEdges: new Map([['shared/utils.ts', importers]]),
        circular: [],
        externalDeps: new Map(),
      },
    })

    const result = scanStructuralIssues(index, analysis)
    const highCoupling = result.filter(i => i.ruleId === 'high-coupling')
    expect(highCoupling).toHaveLength(1)
  })

  it('detects deep dependency chains (>10 levels)', () => {
    const index = createEmptyIndex()
    const depthMap = new Map([['deep-file.ts', 12]])
    const analysis = makeAnalysis({
      topology: {
        entryPoints: ['entry.ts'],
        hubs: [],
        orphans: [],
        leafNodes: [],
        connectors: [],
        clusters: [],
        depthMap,
        maxDepth: 12,
      },
    })

    const result = scanStructuralIssues(index, analysis)
    const deepChain = result.filter(i => i.ruleId === 'deep-chain')
    expect(deepChain).toHaveLength(1)
    expect(deepChain[0].severity).toBe('warning')
  })

  it('does not flag small files', () => {
    const shortContent = Array(50).fill('const x = 1').join('\n')
    let index = createEmptyIndex()
    index = indexFile(index, 'src/small.ts', shortContent, 'typescript')
    const analysis = makeAnalysis()

    const result = scanStructuralIssues(index, analysis)
    const largeFile = result.filter(i => i.ruleId === 'large-file')
    expect(largeFile).toHaveLength(0)
  })

  it('does not flag file with exactly 400 lines (boundary)', () => {
    const content = Array(400).fill('const x = 1').join('\n')
    let index = createEmptyIndex()
    index = indexFile(index, 'src/boundary.ts', content, 'typescript')
    const analysis = makeAnalysis()

    const result = scanStructuralIssues(index, analysis)
    const largeFile = result.filter(i => i.ruleId === 'large-file')
    expect(largeFile).toHaveLength(0)
  })

  it('flags file with 401 lines (just over boundary)', () => {
    const content = Array(401).fill('const x = 1').join('\n')
    let index = createEmptyIndex()
    index = indexFile(index, 'src/over-boundary.ts', content, 'typescript')
    const analysis = makeAnalysis()

    const result = scanStructuralIssues(index, analysis)
    const largeFile = result.filter(i => i.ruleId === 'large-file')
    expect(largeFile).toHaveLength(1)
    expect(largeFile[0].severity).toBe('info')
  })

  it('does not flag high coupling with 14 importers (under threshold)', () => {
    const index = createEmptyIndex()
    const importers = new Set(Array.from({ length: 14 }, (_, i) => `file${i}.ts`))
    const analysis = makeAnalysis({
      graph: {
        edges: new Map(),
        reverseEdges: new Map([['shared/utils.ts', importers]]),
        circular: [],
        externalDeps: new Map(),
      },
    })

    const result = scanStructuralIssues(index, analysis)
    const highCoupling = result.filter(i => i.ruleId === 'high-coupling')
    expect(highCoupling).toHaveLength(0)
  })

  it('does not flag deep chain at exactly depth 10 (threshold is >10)', () => {
    const index = createEmptyIndex()
    const depthMap = new Map([['file.ts', 10]])
    const analysis = makeAnalysis({
      topology: {
        entryPoints: ['entry.ts'],
        hubs: [],
        orphans: [],
        leafNodes: [],
        connectors: [],
        clusters: [],
        depthMap,
        maxDepth: 10,
      },
    })

    const result = scanStructuralIssues(index, analysis)
    const deepChain = result.filter(i => i.ruleId === 'deep-chain')
    expect(deepChain).toHaveLength(0)
  })

  it('detects multiple circular dependencies', () => {
    const index = createEmptyIndex()
    const analysis = makeAnalysis({
      graph: {
        edges: new Map(),
        reverseEdges: new Map(),
        circular: [
          ['a.ts', 'b.ts'],
          ['c.ts', 'd.ts'],
          ['e.ts', 'f.ts'],
        ],
        externalDeps: new Map(),
      },
    })

    const result = scanStructuralIssues(index, analysis)
    const circular = result.filter(i => i.ruleId === 'circular-dep')
    expect(circular).toHaveLength(3)
  })

  it('detects dead modules (exports symbols but no importer)', () => {
    const index = createEmptyIndex()
    const analysis = makeAnalysis({
      files: new Map([
        ['src/entry.ts', {
          path: 'src/entry.ts',
          imports: [],
          exports: [{ name: 'main', kind: 'function', isDefault: true }],
          types: [],
          classes: [],
          jsxComponents: [],
          language: 'typescript',
        }],
        ['src/unused.ts', {
          path: 'src/unused.ts',
          imports: [],
          exports: [{ name: 'helper', kind: 'function', isDefault: false }],
          types: [],
          classes: [],
          jsxComponents: [],
          language: 'typescript',
        }],
      ]),
      graph: {
        edges: new Map(),
        reverseEdges: new Map(),
        circular: [],
        externalDeps: new Map(),
      },
      topology: {
        entryPoints: ['src/entry.ts'],
        hubs: [],
        orphans: [],
        leafNodes: [],
        connectors: [],
        clusters: [],
        depthMap: new Map(),
        maxDepth: 0,
      },
    })

    const result = scanStructuralIssues(index, analysis)
    const deadModules = result.filter(i => i.ruleId === 'dead-module')
    expect(deadModules).toHaveLength(1)
    expect(deadModules[0].file).toBe('src/unused.ts')
  })

  it('does not flag config/test/index files as dead modules', () => {
    const index = createEmptyIndex()
    const analysis = makeAnalysis({
      files: new Map([
        ['src/index.ts', {
          path: 'src/index.ts',
          imports: [],
          exports: [{ name: 'default', kind: 'function', isDefault: true }],
          types: [],
          classes: [],
          jsxComponents: [],
          language: 'typescript',
        }],
        ['src/app.test.ts', {
          path: 'src/app.test.ts',
          imports: [],
          exports: [{ name: 'test', kind: 'function', isDefault: false }],
          types: [],
          classes: [],
          jsxComponents: [],
          language: 'typescript',
        }],
      ]),
      graph: {
        edges: new Map(),
        reverseEdges: new Map(),
        circular: [],
        externalDeps: new Map(),
      },
      topology: {
        entryPoints: [],
        hubs: [],
        orphans: [],
        leafNodes: [],
        connectors: [],
        clusters: [],
        depthMap: new Map(),
        maxDepth: 0,
      },
    })

    const result = scanStructuralIssues(index, analysis)
    const deadModules = result.filter(i => i.ruleId === 'dead-module')
    expect(deadModules).toHaveLength(0)
  })
})
