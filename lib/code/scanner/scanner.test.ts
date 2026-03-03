import { scanIssues } from '@/lib/code/scanner/scanner'
import { createEmptyIndex, indexFile } from '@/lib/code/code-index'

describe('scanIssues', () => {
  it('returns empty results for clean code', () => {
    let index = createEmptyIndex()
    index = indexFile(index, 'src/clean.ts', 'const add = (a: number, b: number) => a + b', 'typescript')

    const result = scanIssues(index, null)
    expect(result.issues.length).toBeLessThanOrEqual(1) // may find nothing or trivial info
    expect(result.summary.total).toBe(result.issues.length)
    expect(result.scannedFiles).toBe(1)
    expect(result.scannedAt).toBeInstanceOf(Date)
  })

  it('detects security issues in code with eval', () => {
    let index = createEmptyIndex()
    index = indexFile(index, 'src/danger.ts', 'const result = eval(userInput)', 'typescript')

    const result = scanIssues(index, null)
    const evalIssues = result.issues.filter(i => i.ruleId === 'eval-usage')
    expect(evalIssues.length).toBeGreaterThanOrEqual(1)
    expect(evalIssues[0].category).toBe('security')
    expect(evalIssues[0].severity).toBe('critical')
  })

  it('detects bad practice issues', () => {
    let index = createEmptyIndex()
    index = indexFile(index, 'src/messy.ts', 'console.log("debug info")', 'typescript')

    const result = scanIssues(index, null)
    const consoleIssues = result.issues.filter(i => i.ruleId === 'console-log')
    expect(consoleIssues.length).toBeGreaterThanOrEqual(1)
    expect(consoleIssues[0].category).toBe('bad-practice')
  })

  it('computes health score', () => {
    let index = createEmptyIndex()
    index = indexFile(index, 'src/clean.ts', 'const x = 1', 'typescript')

    const result = scanIssues(index, null)
    expect(result.healthScore).toBeGreaterThanOrEqual(0)
    expect(result.healthScore).toBeLessThanOrEqual(100)
    expect(result.healthGrade).toMatch(/^[A-F]$/)
  })

  it('penalizes health score for critical issues', () => {
    let index = createEmptyIndex()
    index = indexFile(index, 'src/danger.ts', 'const x = eval(input)', 'typescript')

    const result = scanIssues(index, null)
    // Critical issues hard cap score at 35 (grade D)
    expect(result.healthScore).toBeLessThanOrEqual(35)
  })

  it('sorts issues by severity (critical first)', () => {
    let index = createEmptyIndex()
    const code = [
      'console.log("debug")',       // info
      'eval(userInput)',             // critical
      'const x: any = 1',           // warning
    ].join('\n')
    index = indexFile(index, 'src/mixed.ts', code, 'typescript')

    const result = scanIssues(index, null)
    if (result.issues.length >= 2) {
      const severities = result.issues.map(i => i.severity)
      const critIdx = severities.indexOf('critical')
      const warnIdx = severities.indexOf('warning')
      const infoIdx = severities.indexOf('info')
      if (critIdx >= 0 && warnIdx >= 0) expect(critIdx).toBeLessThan(warnIdx)
      if (warnIdx >= 0 && infoIdx >= 0) expect(warnIdx).toBeLessThan(infoIdx)
    }
  })

  it('reports correct summary counts', () => {
    let index = createEmptyIndex()
    const code = [
      'eval(input)',            // critical security
      'console.log("test")',   // info bad-practice
    ].join('\n')
    index = indexFile(index, 'src/test.ts', code, 'typescript')

    const result = scanIssues(index, null)
    expect(result.summary.total).toBe(result.issues.length)
    expect(result.summary.critical + result.summary.warning + result.summary.info).toBe(result.summary.total)
  })

  it('detects languages present in the index', () => {
    let index = createEmptyIndex()
    index = indexFile(index, 'src/app.ts', 'const x = 1', 'typescript')
    index = indexFile(index, 'src/main.py', 'x = 1', 'python')

    const result = scanIssues(index, null)
    expect(result.languagesDetected).toContain('JavaScript/TypeScript')
    expect(result.languagesDetected).toContain('Python')
  })

  it('caps per-rule issues at 15 and tracks overflow', () => {
    let index = createEmptyIndex()
    // Create many eval usages to exceed MAX_PER_RULE
    const lines = Array.from({ length: 20 }, (_, i) => `const r${i} = eval("x${i}")`)
    index = indexFile(index, 'src/many-evals.ts', lines.join('\n'), 'typescript')

    const result = scanIssues(index, null)
    const evalIssues = result.issues.filter(i => i.ruleId === 'eval-usage')
    expect(evalIssues.length).toBeLessThanOrEqual(15)
    // Overflow should be tracked
    if (evalIssues.length === 15) {
      expect(result.ruleOverflow.has('eval-usage')).toBe(true)
    }
  })

  it('handles empty index', () => {
    const index = createEmptyIndex()
    const result = scanIssues(index, null)
    expect(result.issues).toHaveLength(0)
    expect(result.healthScore).toBe(100)
    expect(result.healthGrade).toBe('A')
  })
})
