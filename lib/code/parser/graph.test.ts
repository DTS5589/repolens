import { detectCircularDeps } from '@/lib/code/parser/graph'

describe('detectCircularDeps', () => {
  it('detects direct circular dependency (A <-> B)', () => {
    const edges = new Map<string, Set<string>>([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['a.ts'])],
    ])
    const result = detectCircularDeps(edges)
    expect(result.length).toBeGreaterThanOrEqual(1)
    // The pair [a.ts, b.ts] should be present (order may vary)
    const flat = result.flat()
    expect(flat).toContain('a.ts')
    expect(flat).toContain('b.ts')
  })

  it('detects transitive cycle (A -> B -> C -> A)', () => {
    const edges = new Map<string, Set<string>>([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['c.ts'])],
      ['c.ts', new Set(['a.ts'])],
    ])
    const result = detectCircularDeps(edges)
    expect(result.length).toBeGreaterThanOrEqual(1)
    const flat = result.flat()
    expect(flat).toContain('a.ts')
    expect(flat).toContain('b.ts')
    expect(flat).toContain('c.ts')
  })

  it('returns empty for acyclic graph', () => {
    const edges = new Map<string, Set<string>>([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['c.ts'])],
      ['c.ts', new Set()],
    ])
    const result = detectCircularDeps(edges)
    expect(result).toHaveLength(0)
  })

  it('returns empty for graph with no edges', () => {
    const edges = new Map<string, Set<string>>([
      ['a.ts', new Set()],
      ['b.ts', new Set()],
    ])
    const result = detectCircularDeps(edges)
    expect(result).toHaveLength(0)
  })

  it('returns empty for empty graph', () => {
    const edges = new Map<string, Set<string>>()
    const result = detectCircularDeps(edges)
    expect(result).toHaveLength(0)
  })

  it('handles self-loop', () => {
    const edges = new Map<string, Set<string>>([
      ['a.ts', new Set(['a.ts'])],
    ])
    const result = detectCircularDeps(edges)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('handles multiple disconnected cycles', () => {
    const edges = new Map<string, Set<string>>([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['a.ts'])],
      ['c.ts', new Set(['d.ts'])],
      ['d.ts', new Set(['c.ts'])],
    ])
    const result = detectCircularDeps(edges)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('handles complex graph with some cycles', () => {
    const edges = new Map<string, Set<string>>([
      ['entry.ts', new Set(['a.ts', 'b.ts'])],
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['c.ts'])],
      ['c.ts', new Set(['a.ts'])], // cycle: a -> b -> c -> a
    ])
    const result = detectCircularDeps(edges)
    expect(result.length).toBeGreaterThanOrEqual(1)
    const flat = result.flat()
    expect(flat).toContain('a.ts')
  })
})
