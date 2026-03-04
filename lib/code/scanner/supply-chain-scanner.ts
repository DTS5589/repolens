// Supply chain scanner — detects vulnerabilities in package.json, lockfiles,
// GitHub Actions workflows, and Python dependency files.

import type { CodeIndex } from '../code-index'
import type { CodeIssue } from './types'

// ---------------------------------------------------------------------------
// Suspicious patterns in lifecycle scripts
// ---------------------------------------------------------------------------
const SUSPICIOUS_SCRIPT_PATTERNS = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bhttp:\/\//i,
  /\bhttps:\/\//i,
  /\beval\b/,
  /\bexec\b/,
  /\bchild_process\b/,
  /\bBuffer\.from\b/,
  /\batob\b/,
  /\bbtoa\b/,
  // Base64-encoded strings (40+ chars of base64 alphabet)
  /[A-Za-z0-9+/]{40,}={0,2}/,
]

const LIFECYCLE_SCRIPTS = ['postinstall', 'preinstall', 'install'] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the 1-based line number of `needle` in `content`, starting search at `startLine` (0-based index). */
function findLine(lines: string[], needle: string, startLine = 0): number {
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1
  }
  return 1
}

/** Check whether any lockfile exists alongside a package.json in the code index. */
function hasLockfile(codeIndex: CodeIndex, pkgPath: string): boolean {
  const dir = pkgPath.includes('/') ? pkgPath.substring(0, pkgPath.lastIndexOf('/') + 1) : ''
  return (
    codeIndex.files.has(`${dir}package-lock.json`) ||
    codeIndex.files.has(`${dir}pnpm-lock.yaml`) ||
    codeIndex.files.has(`${dir}yarn.lock`)
  )
}

/** Determine if a path is a GitHub Actions workflow file. */
function isWorkflowFile(path: string): boolean {
  return /\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)
}

// ---------------------------------------------------------------------------
// Package.json checks
// ---------------------------------------------------------------------------

function scanPackageJson(
  path: string,
  content: string,
  lines: string[],
  codeIndex: CodeIndex,
  issues: CodeIssue[],
): void {
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(content) as Record<string, unknown>
  } catch {
    // Malformed JSON — nothing to scan
    return
  }

  const scripts = pkg.scripts as Record<string, string> | undefined

  // 1. Suspicious lifecycle scripts
  if (scripts && typeof scripts === 'object') {
    for (const hook of LIFECYCLE_SCRIPTS) {
      const value = scripts[hook]
      if (typeof value !== 'string') continue

      for (const pattern of SUSPICIOUS_SCRIPT_PATTERNS) {
        if (pattern.test(value)) {
          const line = findLine(lines, `"${hook}"`)
          issues.push({
            id: `supply-chain-suspicious-script-${path}-${line}`,
            ruleId: 'supply-chain-suspicious-script',
            category: 'security',
            severity: 'critical',
            title: 'Suspicious Lifecycle Script',
            description: `The "${hook}" script contains a suspicious pattern (${pattern.source}). Malicious packages commonly abuse lifecycle scripts to execute arbitrary code during installation.`,
            file: path,
            line,
            column: 0,
            snippet: `"${hook}": "${value}"`,
            suggestion: 'Review the script carefully. Remove or replace with a safe alternative. Use --ignore-scripts during installation if untrusted.',
            cwe: 'CWE-506',
            confidence: 'high',
          })
          break // one issue per hook is enough
        }
      }
    }
  }

  // 2. Missing lockfile
  if (!hasLockfile(codeIndex, path)) {
    issues.push({
      id: `supply-chain-no-lockfile-${path}`,
      ruleId: 'supply-chain-no-lockfile',
      category: 'security',
      severity: 'warning',
      title: 'Missing Lockfile',
      description: 'No package-lock.json, pnpm-lock.yaml, or yarn.lock found alongside this package.json. Without a lockfile, dependency versions are non-deterministic and vulnerable to substitution attacks.',
      file: path,
      line: 1,
      column: 0,
      snippet: 'package.json without lockfile',
      suggestion: 'Run `npm install`, `pnpm install`, or `yarn install` to generate a lockfile and commit it to version control.',
      cwe: 'CWE-353',
      confidence: 'medium',
    })
  }

  // 3. Star version ranges
  const depSections = ['dependencies', 'devDependencies'] as const
  for (const section of depSections) {
    const deps = pkg[section] as Record<string, string> | undefined
    if (!deps || typeof deps !== 'object') continue
    for (const [name, version] of Object.entries(deps)) {
      if (version === '*') {
        const line = findLine(lines, `"${name}"`)
        issues.push({
          id: `supply-chain-star-version-${path}-${name}`,
          ruleId: 'supply-chain-star-version',
          category: 'security',
          severity: 'warning',
          title: 'Wildcard Dependency Version',
          description: `"${name}" uses version "*", which accepts any version including potentially malicious ones. An attacker who publishes a compromised version will have it automatically installed.`,
          file: path,
          line,
          column: 0,
          snippet: `"${name}": "*"`,
          suggestion: 'Pin to a specific version range (e.g., "^1.0.0") and use a lockfile.',
          cwe: 'CWE-1104',
          confidence: 'high',
        })
      }
    }
  }

  // 4. Git dependencies
  for (const section of depSections) {
    const deps = pkg[section] as Record<string, string> | undefined
    if (!deps || typeof deps !== 'object') continue
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string' && /git(\+https?)?:\/\//i.test(version)) {
        const line = findLine(lines, `"${name}"`)
        issues.push({
          id: `supply-chain-git-dependency-${path}-${name}`,
          ruleId: 'supply-chain-git-dependency',
          category: 'security',
          severity: 'info',
          title: 'Git-Based Dependency',
          description: `"${name}" is installed from a git URL (${version}). Git dependencies bypass the npm registry's integrity checks and may point to mutable references.`,
          file: path,
          line,
          column: 0,
          snippet: `"${name}": "${version}"`,
          suggestion: 'Prefer installing from npm with a pinned version. If a git source is required, pin to a specific commit SHA.',
          cwe: 'CWE-829',
          confidence: 'medium',
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lockfile checks
// ---------------------------------------------------------------------------

function scanLockfile(
  path: string,
  content: string,
  lines: string[],
  issues: CodeIssue[],
): void {
  const isPackageLock = path.endsWith('package-lock.json')

  // 5. Missing integrity in package-lock.json
  if (isPackageLock) {
    try {
      const lock = JSON.parse(content) as Record<string, unknown>
      const packages = (lock.packages ?? lock.dependencies) as Record<string, Record<string, unknown>> | undefined
      if (packages && typeof packages === 'object') {
        let missingCount = 0
        let firstMissingPkg = ''
        let firstMissingLine = 1
        for (const [pkgName, pkgInfo] of Object.entries(packages)) {
          if (!pkgName || pkgName === '') continue // root entry
          if (typeof pkgInfo !== 'object' || pkgInfo === null) continue
          if (!('integrity' in pkgInfo) || !pkgInfo.integrity) {
            missingCount++
            if (missingCount === 1) {
              firstMissingPkg = pkgName
              firstMissingLine = findLine(lines, `"${pkgName}"`)
            }
          }
        }
        if (missingCount > 0) {
          issues.push({
            id: `supply-chain-lockfile-no-integrity-${path}`,
            ruleId: 'supply-chain-lockfile-no-integrity',
            category: 'security',
            severity: 'warning',
            title: 'Lockfile Missing Integrity Hashes',
            description: `${missingCount} package(s) in this lockfile lack integrity hashes (first: ${firstMissingPkg}). Without integrity verification, tampered packages can be installed silently.`,
            file: path,
            line: firstMissingLine,
            column: 0,
            snippet: `Missing "integrity" for ${firstMissingPkg}`,
            suggestion: 'Delete the lockfile and regenerate it with a current npm version (npm i --package-lock-only).',
            cwe: 'CWE-353',
            confidence: 'high',
          })
        }
      }
    } catch {
      // Malformed lockfile
    }
  }

  // 6. HTTP (non-HTTPS) registry URLs in lockfiles
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match resolved URLs that use plain http
    if (/["']?resolved["']?\s*[:=]\s*["']?http:\/\//i.test(line) || /http:\/\/registry\./i.test(line)) {
      issues.push({
        id: `supply-chain-http-registry-${path}-${i + 1}`,
        ruleId: 'supply-chain-http-registry',
        category: 'security',
        severity: 'critical',
        title: 'HTTP Registry URL in Lockfile',
        description: 'This lockfile references a package registry over plain HTTP instead of HTTPS. An attacker on the network can intercept and replace packages (man-in-the-middle).',
        file: path,
        line: i + 1,
        column: 0,
        snippet: line.trim(),
        suggestion: 'Ensure the npm/yarn registry is configured to use HTTPS. Regenerate the lockfile after fixing the registry URL.',
        cwe: 'CWE-319',
        confidence: 'high',
      })
      break // one issue per lockfile is sufficient
    }
  }
}

// ---------------------------------------------------------------------------
// GitHub Actions workflow checks
// ---------------------------------------------------------------------------

/** Match action references: `uses: owner/action@ref` */
const ACTION_USES_RE = /uses:\s*([^#\s]+)/

/** Detect `@main`, `@master`, or other branch-style refs (not SHA, not vN tags). */
function isUnpinnedRef(ref: string): boolean {
  // Pinned SHA (40-char hex) — safe
  if (/^[a-f0-9]{40}$/i.test(ref)) return false
  // Version tag like v1, v2.3, v3.1.2 — acceptable
  if (/^v\d+/i.test(ref)) return false
  // Everything else (main, master, latest, develop) — unpinned
  return true
}

function scanGitHubActions(
  path: string,
  content: string,
  lines: string[],
  issues: CodeIssue[],
): void {
  const hasPullRequestTarget = /on:\s*pull_request_target/i.test(content) ||
    /pull_request_target/i.test(content)
  const hasCheckout = /actions\/checkout/i.test(content)

  // 7. Unpinned actions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const usesMatch = line.match(ACTION_USES_RE)
    if (!usesMatch) continue
    const actionRef = usesMatch[1]
    if (!actionRef.includes('@')) continue
    // Only check third-party actions (not local actions like ./)
    if (actionRef.startsWith('./') || actionRef.startsWith('docker://')) continue

    const [, ref] = actionRef.split('@')
    if (ref && isUnpinnedRef(ref)) {
      issues.push({
        id: `gha-unpinned-action-${path}-${i + 1}`,
        ruleId: 'gha-unpinned-action',
        category: 'security',
        severity: 'warning',
        title: 'Unpinned GitHub Action',
        description: `Action "${actionRef}" uses a mutable reference (@${ref}). A compromised or force-pushed tag/branch can inject malicious code into your CI pipeline.`,
        file: path,
        line: i + 1,
        column: 0,
        snippet: line.trim(),
        suggestion: 'Pin the action to a full commit SHA (e.g., uses: owner/action@abc123...).',
        cwe: 'CWE-829',
        confidence: 'medium',
      })
    }
  }

  // 8. Dangerous trigger: pull_request_target + checkout
  if (hasPullRequestTarget && hasCheckout) {
    const triggerLine = findLine(lines, 'pull_request_target')
    issues.push({
      id: `gha-dangerous-trigger-${path}`,
      ruleId: 'gha-dangerous-trigger',
      category: 'security',
      severity: 'critical',
      title: 'Dangerous pull_request_target + Checkout',
      description: 'This workflow uses `pull_request_target` and checks out code. This is a known attack vector ("pwn request"): a malicious PR can execute arbitrary code with write permissions to the repository.',
      file: path,
      line: triggerLine,
      column: 0,
      snippet: 'on: pull_request_target with actions/checkout',
      suggestion: 'Avoid checking out PR code in pull_request_target workflows. If needed, use a separate unprivileged workflow for building/testing PR code.',
      cwe: 'CWE-94',
      confidence: 'high',
    })
  }

  // 9. Script injection via expression interpolation
  let inRunBlock = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*run:\s/i.test(line) || /^\s*run:\s*\|/i.test(line)) {
      inRunBlock = true
    } else if (/^\s*\w+:/i.test(line) && !/^\s*#/.test(line) && !/^\s*-/.test(line)) {
      // New YAML key at same or higher indent — exit run block.
      // Keep inRunBlock true for continuation lines (indented or starting with -)
      if (inRunBlock && !/^\s+/.test(line)) {
        inRunBlock = false
      }
    }

    if (inRunBlock && /\$\{\{\s*github\.event\./i.test(line)) {
      issues.push({
        id: `gha-script-injection-${path}-${i + 1}`,
        ruleId: 'gha-script-injection',
        category: 'security',
        severity: 'critical',
        title: 'GitHub Actions Script Injection',
        description: 'Interpolating `${{ github.event.* }}` directly in a `run:` step allows an attacker to inject arbitrary shell commands via crafted issue titles, PR bodies, or commit messages.',
        file: path,
        line: i + 1,
        column: 0,
        snippet: line.trim(),
        suggestion: 'Pass the value through an environment variable instead: env: TITLE: ${{ github.event.issue.title }} then use $TITLE in the script.',
        cwe: 'CWE-94',
        confidence: 'high',
      })
    }
  }

  // 10. Overly permissive permissions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*permissions:\s*write-all\s*$/i.test(line)) {
      issues.push({
        id: `gha-permissions-write-all-${path}-${i + 1}`,
        ruleId: 'gha-permissions-write-all',
        category: 'security',
        severity: 'warning',
        title: 'Overly Permissive Workflow Token',
        description: '`permissions: write-all` gives the GITHUB_TOKEN full write access to all scopes. If the workflow is compromised (e.g., via a supply chain attack on an action), the attacker gains excessive privileges.',
        file: path,
        line: i + 1,
        column: 0,
        snippet: line.trim(),
        suggestion: 'Apply the principle of least privilege — declare only the specific permissions needed (e.g., contents: read, issues: write).',
        cwe: 'CWE-250',
        confidence: 'high',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Python dependency checks
// ---------------------------------------------------------------------------

function scanPythonRequirements(
  path: string,
  lines: string[],
  issues: CodeIssue[],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Skip empty lines, comments, and options
    if (!line || line.startsWith('#') || line.startsWith('-')) continue
    // A pinned dependency uses == (e.g., requests==2.28.0)
    if (!line.includes('==')) {
      issues.push({
        id: `supply-chain-unpinned-python-${path}-${i + 1}`,
        ruleId: 'supply-chain-unpinned-python',
        category: 'security',
        severity: 'info',
        title: 'Unpinned Python Dependency',
        description: `"${line}" is not pinned to an exact version with ==. Unpinned dependencies may resolve to different (potentially compromised) versions across installs.`,
        file: path,
        line: i + 1,
        column: 0,
        snippet: line,
        suggestion: 'Pin to an exact version (e.g., requests==2.28.0) and use pip freeze or pip-compile for reproducible installs.',
        cwe: 'CWE-1104',
        confidence: 'low',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function scanSupplyChain(codeIndex: CodeIndex): CodeIssue[] {
  const issues: CodeIssue[] = []

  for (const [path, file] of codeIndex.files) {
    const { content, lines } = file
    const filename = path.split('/').pop() || ''

    if (filename === 'package.json') {
      scanPackageJson(path, content, lines, codeIndex, issues)
    }

    if (filename === 'package-lock.json' || filename === 'yarn.lock' || filename === 'pnpm-lock.yaml') {
      scanLockfile(path, content, lines, issues)
    }

    if (isWorkflowFile(path)) {
      scanGitHubActions(path, content, lines, issues)
    }

    if (filename === 'requirements.txt') {
      scanPythonRequirements(path, lines, issues)
    }
  }

  return issues
}
