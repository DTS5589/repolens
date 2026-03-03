import { COMPOSITE_RULES, scanCompositeRules } from '@/lib/code/scanner/rules-composite'
import { createEmptyIndex, indexFile } from '@/lib/code/code-index'

describe('COMPOSITE_RULES', () => {
  it('has composite rules defined', () => {
    expect(COMPOSITE_RULES.length).toBeGreaterThanOrEqual(3)
  })

  it('all rules have required fields', () => {
    for (const rule of COMPOSITE_RULES) {
      expect(rule.id).toBeTruthy()
      expect(rule.category).toBeTruthy()
      expect(rule.severity).toMatch(/^(critical|warning|info)$/)
      expect(rule.title).toBeTruthy()
      expect(rule.description).toBeTruthy()
      expect(rule.requiredPatterns.length).toBeGreaterThanOrEqual(2)
      expect(rule.sinkPattern).toBeTruthy()
      expect(rule.fileFilter.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('scanCompositeRules', () => {
  it('detects command injection via exec with variable', () => {
    let index = createEmptyIndex()
    const dangerousCode = [
      `const { exec } = require('child_process')`,
      `const cmd = \`ls \${userInput}\``,
      `exec(cmd, (err, stdout) => {})`,
    ].join('\n')
    index = indexFile(index, 'src/runner.js', dangerousCode, 'javascript')

    const issues = scanCompositeRules(index)
    const cmdInjections = issues.filter(i => i.ruleId.startsWith('composite-cmd-injection'))
    expect(cmdInjections.length).toBeGreaterThanOrEqual(1)
  })

  it('does not trigger when mitigations are present', () => {
    let index = createEmptyIndex()
    const safeCode = [
      `const { execFile } = require('child_process')`,
      `execFile('ls', ['-la'], (err, stdout) => {})`,
    ].join('\n')
    index = indexFile(index, 'src/safe-runner.js', safeCode, 'javascript')

    const issues = scanCompositeRules(index)
    const cmdInjections = issues.filter(i => i.ruleId.startsWith('composite-cmd-injection'))
    expect(cmdInjections).toHaveLength(0)
  })

  it('does not trigger on files with wrong extension', () => {
    let index = createEmptyIndex()
    const code = [
      `const { exec } = require('child_process')`,
      `exec(cmd)`,
    ].join('\n')
    index = indexFile(index, 'README.md', code)

    const issues = scanCompositeRules(index)
    expect(issues).toHaveLength(0)
  })

  it('skips vendored paths', () => {
    let index = createEmptyIndex()
    const code = [
      `const { exec } = require('child_process')`,
      `exec(cmd)`,
    ].join('\n')
    index = indexFile(index, 'node_modules/some-pkg/index.js', code, 'javascript')

    const issues = scanCompositeRules(index)
    expect(issues).toHaveLength(0)
  })

  it('detects Python os.system with formatted string', () => {
    let index = createEmptyIndex()
    const code = [
      `import os`,
      `cmd = f"ls {user_dir}"`,
      `os.system(cmd)`,
    ].join('\n')
    index = indexFile(index, 'src/runner.py', code, 'python')

    const issues = scanCompositeRules(index)
    const osCmdIssues = issues.filter(i => i.ruleId === 'composite-python-os-cmd')
    expect(osCmdIssues.length).toBeGreaterThanOrEqual(1)
    expect(osCmdIssues[0].severity).toBe('critical')
  })

  it('does not flag Python os.system when shlex.quote mitigation is present', () => {
    let index = createEmptyIndex()
    const code = [
      `import os, shlex`,
      `safe = shlex.quote(user_input)`,
      `cmd = f"ls {safe}"`,
      `os.system(cmd)`,
    ].join('\n')
    index = indexFile(index, 'src/safe_runner.py', code, 'python')

    const issues = scanCompositeRules(index)
    const osCmdIssues = issues.filter(i => i.ruleId === 'composite-python-os-cmd')
    expect(osCmdIssues).toHaveLength(0)
  })

  it('detects path traversal with request params and file ops', () => {
    let index = createEmptyIndex()
    const code = [
      `const filePath = req.params.filename`,
      `const data = readFileSync(filePath)`,
    ].join('\n')
    index = indexFile(index, 'src/handler.ts', code, 'typescript')

    const issues = scanCompositeRules(index)
    const pathTraversal = issues.filter(i => i.ruleId === 'composite-path-traversal-req')
    expect(pathTraversal.length).toBeGreaterThanOrEqual(1)
    expect(pathTraversal[0].severity).toBe('critical')
  })

  it('detects SSRF with request params and fetch', () => {
    let index = createEmptyIndex()
    const code = [
      `const url = req.query.url`,
      `const response = await fetch(url)`,
    ].join('\n')
    index = indexFile(index, 'src/proxy.ts', code, 'typescript')

    const issues = scanCompositeRules(index)
    const ssrf = issues.filter(i => i.ruleId === 'composite-ssrf')
    expect(ssrf.length).toBeGreaterThanOrEqual(1)
    expect(ssrf[0].severity).toBe('critical')
  })

  it('does not flag SSRF when URL allowlist mitigation is present', () => {
    let index = createEmptyIndex()
    const code = [
      `const url = req.query.url`,
      `if (!isValidUrl(url)) throw new Error("blocked")`,
      `const response = await fetch(url)`,
    ].join('\n')
    index = indexFile(index, 'src/safe-proxy.ts', code, 'typescript')

    const issues = scanCompositeRules(index)
    const ssrf = issues.filter(i => i.ruleId === 'composite-ssrf')
    expect(ssrf).toHaveLength(0)
  })

  it('returns empty array for empty code index', () => {
    const index = createEmptyIndex()
    const issues = scanCompositeRules(index)
    expect(issues).toHaveLength(0)
  })
})
