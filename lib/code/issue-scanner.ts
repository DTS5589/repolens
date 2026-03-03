// Issue Scanner — Comprehensive static analysis engine that detects security risks,
// bad practices, anti-patterns, and reliability issues across multiple languages.
// Uses searchIndex() for regex-based pattern matching and FullAnalysis for structural
// analysis (circular deps, dead modules, coupling).

import type { CodeIndex, SearchResult } from './code-index'
import { searchIndex } from './code-index'
import type { FullAnalysis } from './import-parser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssueSeverity = 'critical' | 'warning' | 'info'
export type IssueCategory = 'security' | 'bad-practice' | 'reliability'

export interface CodeIssue {
  id: string
  ruleId: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  description: string
  file: string
  line: number
  column: number
  snippet: string
  suggestion?: string
  /** CWE identifier if applicable, e.g. "CWE-79" */
  cwe?: string
  /** OWASP category if applicable, e.g. "A03:2021 Injection" */
  owasp?: string
  /** Link to further reading */
  learnMoreUrl?: string
}

export interface ScanRule {
  id: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  description: string
  suggestion?: string
  cwe?: string
  owasp?: string
  learnMoreUrl?: string
  // Regex-based rules use searchIndex
  pattern?: string
  patternOptions?: { caseSensitive?: boolean; regex?: boolean; wholeWord?: boolean }
  // Only apply to files matching these extensions
  fileFilter?: string[]
  // Exclude matches where the line content matches this
  excludePattern?: RegExp
  // Exclude files whose path matches this
  excludeFiles?: RegExp
  // Structural rules use a custom scan function
  structural?: boolean
}

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface ScanResults {
  issues: CodeIssue[]
  summary: {
    total: number
    critical: number
    warning: number
    info: number
    bySecurity: number
    byBadPractice: number
    byReliability: number
  }
  healthGrade: HealthGrade
  healthScore: number
  ruleOverflow: Map<string, number>
  /** Which languages were detected and scanned */
  languagesDetected: string[]
  /** How many rules were evaluated */
  rulesEvaluated: number
  scannedFiles: number
  scannedAt: Date
}

// ---------------------------------------------------------------------------
// Language detection helper
// ---------------------------------------------------------------------------

const LANG_EXTENSIONS: Record<string, string[]> = {
  'JavaScript/TypeScript': ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  'Python': ['.py', '.pyw'],
  'Go': ['.go'],
  'Rust': ['.rs'],
  'Java': ['.java'],
  'Kotlin': ['.kt', '.kts'],
  'C/C++': ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'],
  'C#': ['.cs'],
  'Ruby': ['.rb', '.rake'],
  'PHP': ['.php'],
  'Shell': ['.sh', '.bash', '.zsh'],
  'Swift': ['.swift'],
  'Dart': ['.dart'],
}

function detectLanguages(codeIndex: CodeIndex): string[] {
  const found = new Set<string>()
  for (const path of codeIndex.files.keys()) {
    const ext = '.' + (path.split('.').pop() || '')
    for (const [lang, exts] of Object.entries(LANG_EXTENSIONS)) {
      if (exts.includes(ext.toLowerCase())) found.add(lang)
    }
  }
  return Array.from(found)
}

// ---------------------------------------------------------------------------
// Rule definitions — organized by category, then by language
// ---------------------------------------------------------------------------

const JS_TS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']
const TS_ONLY = ['.ts', '.tsx']
const PY = ['.py', '.pyw']
const GO = ['.go']
const RUST = ['.rs']
const JAVA = ['.java']
const KOTLIN = ['.kt', '.kts']
const C_CPP = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp']
const CSHARP = ['.cs']
const RUBY = ['.rb', '.rake']
const PHP = ['.php']
const SHELL = ['.sh', '.bash', '.zsh']
const SWIFT = ['.swift']
const ALL_CODE = [...JS_TS, ...PY, ...GO, ...RUST, ...JAVA, ...KOTLIN, ...C_CPP, ...CSHARP, ...RUBY, ...PHP, ...SHELL, ...SWIFT]
const SKIP_VENDORED = /node_modules|vendor|dist|build|\.min\.|\.lock$|package-lock|yarn\.lock|pnpm-lock|__pycache__|\.pyc|target\/debug|target\/release/i

const RULES: ScanRule[] = [

  // ===========================================================================
  // SECURITY — Cross-language
  // ===========================================================================

  // --- Secrets & Credentials ---
  {
    id: 'hardcoded-aws-key',
    category: 'security',
    severity: 'critical',
    title: 'Hardcoded AWS Key',
    description: 'AWS access key ID found in source code. If committed, this grants access to your AWS account. Rotate the key immediately and use environment variables or IAM roles.',
    suggestion: 'Move to environment variable: process.env.AWS_ACCESS_KEY_ID or use IAM roles',
    cwe: 'CWE-798',
    owasp: 'A07:2021 Identification and Authentication Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/798.html',
    pattern: '(?:AKIA|ASIA)[A-Z0-9]{16}',
    patternOptions: { regex: true, caseSensitive: true },
  },
  {
    id: 'hardcoded-secret',
    category: 'security',
    severity: 'critical',
    title: 'Potential Hardcoded Secret',
    description: 'A value resembling an API key, token, or secret is assigned directly in code. Secrets in source code can be extracted from version history even after deletion.',
    suggestion: 'Move to environment variables or a secrets manager (Vault, AWS SSM, etc.)',
    cwe: 'CWE-798',
    owasp: 'A07:2021 Identification and Authentication Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/798.html',
    pattern: '(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret)\\s*[:=]\\s*["\'][^"\']{8,}["\']',
    patternOptions: { regex: true, caseSensitive: false },
    excludePattern: /process\.env|import\.meta\.env|env\.|getenv|os\.environ|ENV\[|example|placeholder|your[_-]|xxx|changeme|TODO|test[_-]|fake[_-]|mock[_-]|sample[_-]|dummy|fixture|\.md["']|README|schema|zod|yup|type\b|interface\b/i,
  },
  {
    id: 'hardcoded-password',
    category: 'security',
    severity: 'critical',
    title: 'Hardcoded Password',
    description: 'Password string found hardcoded in source. Attackers who gain source access immediately have credentials.',
    suggestion: 'Never store passwords in code. Use environment variables, a secrets manager, or prompt at runtime.',
    cwe: 'CWE-259',
    owasp: 'A07:2021 Identification and Authentication Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/259.html',
    pattern: '(?:password|passwd|pwd)\\s*[:=]\\s*["\'][^"\']{4,}["\']',
    patternOptions: { regex: true, caseSensitive: false },
    excludePattern: /process\.env|import\.meta\.env|env\.|getenv|os\.environ|placeholder|example|your[_-]|xxx|changeme|schema|zod|yup|validate|type\b|interface\b|Props|param|arg|hash|bcrypt|scrypt/i,
  },
  {
    id: 'private-key-inline',
    category: 'security',
    severity: 'critical',
    title: 'Private Key in Source',
    description: 'An SSH, PGP, or RSA private key marker was found in source code. Private keys must never be committed.',
    suggestion: 'Move to a file outside the repo, use a secrets manager, or mount at deploy time',
    cwe: 'CWE-321',
    owasp: 'A02:2021 Cryptographic Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/321.html',
    pattern: '-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
    patternOptions: { regex: true, caseSensitive: true },
    excludePattern: /example|test|mock|fixture|sample/i,
  },
  {
    id: 'github-token',
    category: 'security',
    severity: 'critical',
    title: 'GitHub Token in Source',
    description: 'A GitHub personal access token, OAuth token, or app token was found in code.',
    suggestion: 'Rotate the token immediately and use GITHUB_TOKEN env var',
    cwe: 'CWE-798',
    owasp: 'A07:2021 Identification and Authentication Failures',
    pattern: '(?:ghp_[A-Za-z0-9_]{36}|gho_[A-Za-z0-9_]{36}|ghu_[A-Za-z0-9_]{36}|ghs_[A-Za-z0-9_]{36}|github_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9]{59})',
    patternOptions: { regex: true, caseSensitive: true },
  },

  // --- Injection ---
  {
    id: 'eval-usage',
    category: 'security',
    severity: 'critical',
    title: 'eval() / new Function() Usage',
    description: 'eval() and new Function() execute arbitrary strings as code. If user input reaches these, it enables Remote Code Execution (RCE).',
    suggestion: 'Use JSON.parse() for data, or a sandboxed interpreter. Refactor to avoid dynamic code execution.',
    cwe: 'CWE-94',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/94.html',
    pattern: '\\b(?:eval|new\\s+Function)\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
    excludePattern: /\/\/.*eval|\/\*.*eval|\*.*eval|eslint|no-eval|JSON\.parse/,
  },
  {
    id: 'innerhtml-xss',
    category: 'security',
    severity: 'warning',
    title: 'innerHTML / dangerouslySetInnerHTML',
    description: 'Direct HTML injection creates Cross-Site Scripting (XSS) vulnerabilities if the content includes unsanitized user input. Attackers can steal session tokens and perform actions as the user.',
    suggestion: 'Sanitize with DOMPurify before injection, or use textContent/innerText for plain text',
    cwe: 'CWE-79',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/79.html',
    pattern: '(?:\\.innerHTML\\s*=|dangerouslySetInnerHTML)',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
    excludePattern: /DOMPurify|sanitize|purify|escape|xss/i,
  },
  {
    id: 'sql-injection',
    category: 'security',
    severity: 'critical',
    title: 'Potential SQL Injection',
    description: 'String interpolation or concatenation in an SQL query. If user input flows into this, attackers can read, modify, or delete your entire database.',
    suggestion: 'Use parameterized queries ($1, ?) or an ORM. Never concatenate user input into SQL.',
    cwe: 'CWE-89',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/89.html',
    pattern: '(?:query|execute|prepare|raw|exec)\\s*\\(\\s*[`"\']\\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE).*(?:\\$\\{|\\+\\s*["\']|\\+\\s*\\w)',
    patternOptions: { regex: true, caseSensitive: false },
  },
  {
    id: 'command-injection-template',
    category: 'security',
    severity: 'critical',
    title: 'Command Injection via Template Literal',
    description: 'Shell command built with template literal string interpolation. If user input reaches this, attackers can execute arbitrary OS commands on the server.',
    suggestion: 'Use execFile() or spawn() with an argument array instead of exec(). Never pass user input through a shell.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    pattern: '(?:child_process\\.exec|execSync|exec)\\s*\\(\\s*`',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
  },
  {
    id: 'command-injection-exec-direct',
    category: 'security',
    severity: 'critical',
    title: 'child_process.exec() Direct Call',
    description: 'child_process.exec() runs commands through a shell (/bin/sh), which parses metacharacters like ;, |, &&, $(), and backticks. If ANY part of the command string is constructed from external input (user data, filenames, URLs), an attacker can inject additional commands. Unlike execFile(), exec() always invokes a shell.',
    suggestion: 'Replace exec() with execFile() or spawn() using an array of arguments: execFile("cmd", ["arg1", "arg2"]). This bypasses the shell entirely, preventing injection.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    pattern: 'child_process\\.exec(?:Sync)?\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
    excludePattern: /execFile|\/\/.*exec|test|mock/i,
  },
  {
    id: 'command-injection-require-cp',
    category: 'security',
    severity: 'warning',
    title: 'child_process Imported',
    description: 'This file imports the child_process module which enables OS command execution. Files using child_process require careful review to ensure no user input flows into commands. The exec() function is particularly dangerous as it invokes a shell.',
    suggestion: 'Prefer execFile() over exec(). Validate and sanitize all inputs. Consider if child_process is truly necessary.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    pattern: '(?:require\\s*\\(\\s*[\'"]child_process[\'"]\\)|from\\s+[\'"]child_process[\'"]|from\\s+[\'"]node:child_process[\'"])',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
  },
  {
    id: 'command-injection-string-concat',
    category: 'security',
    severity: 'warning',
    title: 'Shell Command Built with String Concatenation',
    description: 'A variable named "command" or "cmd" is built using string concatenation (+). If this string is later passed to exec() or similar, any concatenated user input enables command injection.',
    suggestion: 'Use execFile() with argument arrays instead of building command strings',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    pattern: '(?:command|cmd)\\s*(?:=|\\+=)\\s*(?:[\'"`].*\\+|.*\\+\\s*[\'"`])',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
    excludePattern: /\/\/|sql|query|css|class|style/i,
  },
  {
    id: 'command-injection-util-format',
    category: 'security',
    severity: 'critical',
    title: 'Shell Command Built via util.format()',
    description: 'util.format() is used to construct strings that may be passed to shell execution. This is a classic command injection pattern: the format string builds a shell command with user-controlled values interpolated via %s/%d. An attacker can inject shell metacharacters (;, |, &&, $()) in the interpolated values to execute arbitrary commands.',
    suggestion: 'Use execFile() with an argument array instead. If you must build command strings, use shell-escape or shell-quote to sanitize interpolated values.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    pattern: 'util\\.format\\s*\\(\\s*[\'"][^\'"]*(?:convert|identify|gs|pdftk|ffmpeg|imagemagick|graphicsmagick|wkhtmlto|phantomjs|cmd|exec|bash|sh |rm |mv |cp |cat |chmod|chown|mkdir|curl|wget)',
    patternOptions: { regex: true, caseSensitive: false },
    fileFilter: JS_TS,
  },
  {
    id: 'path-traversal',
    category: 'security',
    severity: 'warning',
    title: 'Potential Path Traversal',
    description: 'File path constructed with string concatenation or template literals. If user input is included, attackers can read files outside the intended directory (e.g., /etc/passwd).',
    suggestion: 'Use path.resolve() with a base directory and validate the result stays within bounds. Use path.join() and check with startsWith().',
    cwe: 'CWE-22',
    owasp: 'A01:2021 Broken Access Control',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/22.html',
    pattern: '(?:readFile|writeFile|readdir|createReadStream|createWriteStream|open|access)(?:Sync)?\\s*\\(\\s*(?:`[^`]*\\$\\{|[^,]+\\+)',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
    excludePattern: /path\.resolve|path\.join.*startsWith|__dirname|__filename|process\.cwd/,
  },
  {
    id: 'open-redirect',
    category: 'security',
    severity: 'warning',
    title: 'Potential Open Redirect',
    description: 'Redirect destination may come from user input. Open redirects let attackers craft links that redirect victims to phishing sites while appearing to originate from your domain.',
    suggestion: 'Validate redirect URLs against an allowlist of trusted domains. Never redirect to arbitrary user-supplied URLs.',
    cwe: 'CWE-601',
    owasp: 'A01:2021 Broken Access Control',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/601.html',
    pattern: '(?:redirect|location\\.href|window\\.location|res\\.redirect)\\s*(?:=|\\()\\s*(?:req\\.|params\\.|query\\.|searchParams)',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
  },

  // --- Cryptography ---
  {
    id: 'weak-hash',
    category: 'security',
    severity: 'warning',
    title: 'Weak Hash Algorithm (MD5/SHA1)',
    description: 'MD5 and SHA1 are cryptographically broken and must not be used for passwords, signatures, or integrity checks. Collisions can be practically computed.',
    suggestion: 'Use SHA-256+ for integrity, bcrypt/scrypt/argon2 for passwords',
    cwe: 'CWE-328',
    owasp: 'A02:2021 Cryptographic Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/328.html',
    pattern: '(?:createHash|hashlib|MessageDigest\\.getInstance|Digest::)\\s*\\(?\\s*["\'](?:md5|sha1|sha-1)["\']',
    patternOptions: { regex: true, caseSensitive: false },
    excludePattern: /checksum|etag|cache|fingerprint|\.test\.|\.spec\./i,
  },
  {
    id: 'insecure-random',
    category: 'security',
    severity: 'warning',
    title: 'Insecure Random Number Generator',
    description: 'Math.random() is not cryptographically secure. If used for tokens, session IDs, or security-sensitive values, the output is predictable.',
    suggestion: 'Use crypto.randomUUID(), crypto.getRandomValues(), or crypto.randomBytes() for security-sensitive values',
    cwe: 'CWE-338',
    owasp: 'A02:2021 Cryptographic Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/338.html',
    pattern: 'Math\\.random\\(\\).*(?:token|session|secret|key|password|nonce|salt|csrf|id)',
    patternOptions: { regex: true, caseSensitive: false },
    fileFilter: JS_TS,
  },

  // --- Access Control ---
  {
    id: 'cors-wildcard',
    category: 'security',
    severity: 'warning',
    title: 'CORS Wildcard Origin',
    description: 'Access-Control-Allow-Origin: * permits any website to make requests to your API. Combined with credentials, this exposes authenticated endpoints to any origin.',
    suggestion: 'Restrict to specific trusted origins. If credentials are used, wildcard is already rejected by browsers.',
    cwe: 'CWE-942',
    owasp: 'A01:2021 Broken Access Control',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/942.html',
    pattern: 'Access-Control-Allow-Origin["\']?\\s*[:,]\\s*["\']\\*["\']',
    patternOptions: { regex: true },
  },
  {
    id: 'jwt-no-verify',
    category: 'security',
    severity: 'critical',
    title: 'JWT Decoded Without Verification',
    description: 'jwt.decode() reads the payload without verifying the signature. Attackers can forge tokens with arbitrary claims. Always use jwt.verify().',
    suggestion: 'Replace jwt.decode() with jwt.verify(token, secret) to validate the signature',
    cwe: 'CWE-347',
    owasp: 'A07:2021 Identification and Authentication Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/347.html',
    pattern: '\\bjwt\\.decode\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: [...JS_TS, ...PY],
  },

  // ===========================================================================
  // SECURITY — Language-specific
  // ===========================================================================

  // --- Python ---
  {
    id: 'python-exec',
    category: 'security',
    severity: 'critical',
    title: 'exec() / eval() in Python',
    description: 'exec() and eval() execute arbitrary Python code. If any part of the input is user-controlled, this is a Remote Code Execution vulnerability.',
    suggestion: 'Use ast.literal_eval() for safe data evaluation, or restructure to avoid dynamic execution',
    cwe: 'CWE-94',
    owasp: 'A03:2021 Injection',
    pattern: '\\b(?:exec|eval)\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: PY,
    excludePattern: /literal_eval|#.*exec|#.*eval/,
  },
  {
    id: 'python-pickle',
    category: 'security',
    severity: 'critical',
    title: 'Insecure Deserialization (pickle)',
    description: 'pickle.loads() can execute arbitrary code during deserialization. Never unpickle data from untrusted sources.',
    suggestion: 'Use JSON or MessagePack for data interchange. If pickle is required, use hmac to verify authenticity.',
    cwe: 'CWE-502',
    owasp: 'A08:2021 Software and Data Integrity Failures',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/502.html',
    pattern: '\\bpickle\\.(?:loads?|Unpickler)\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: PY,
  },
  {
    id: 'python-subprocess-shell',
    category: 'security',
    severity: 'critical',
    title: 'subprocess with shell=True',
    description: 'Running subprocess with shell=True passes the command through the system shell, enabling command injection if any argument is user-controlled.',
    suggestion: 'Use subprocess.run(["cmd", "arg1"], shell=False) with a list of arguments',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    pattern: 'subprocess\\.(?:run|call|Popen|check_output|check_call)\\s*\\([^)]*shell\\s*=\\s*True',
    patternOptions: { regex: true },
    fileFilter: PY,
  },
  {
    id: 'python-assert-security',
    category: 'security',
    severity: 'warning',
    title: 'Assert Used for Security Validation',
    description: 'Assert statements are stripped when Python runs with -O (optimize) flag. Never use assert for security or input validation checks in production.',
    suggestion: 'Use if/raise instead: if not condition: raise ValueError(...)',
    cwe: 'CWE-617',
    pattern: '\\bassert\\b.*(?:password|token|auth|permission|admin|role|user)',
    patternOptions: { regex: true, caseSensitive: false },
    fileFilter: PY,
  },
  {
    id: 'python-yaml-load',
    category: 'security',
    severity: 'critical',
    title: 'Unsafe YAML Loading',
    description: 'yaml.load() without SafeLoader can execute arbitrary Python code embedded in YAML. This is a deserialization attack vector.',
    suggestion: 'Use yaml.safe_load() or yaml.load(data, Loader=yaml.SafeLoader)',
    cwe: 'CWE-502',
    owasp: 'A08:2021 Software and Data Integrity Failures',
    pattern: '\\byaml\\.load\\s*\\([^)]*(?!SafeLoader|safe_load)',
    patternOptions: { regex: true },
    fileFilter: PY,
    excludePattern: /SafeLoader|safe_load/,
  },
  {
    id: 'python-django-debug',
    category: 'security',
    severity: 'warning',
    title: 'Django DEBUG = True',
    description: 'DEBUG mode in Django exposes stack traces, settings, and SQL queries to end users. Must be False in production.',
    suggestion: 'Set DEBUG = False in production settings and use environment variables',
    cwe: 'CWE-215',
    owasp: 'A05:2021 Security Misconfiguration',
    pattern: '\\bDEBUG\\s*=\\s*True\\b',
    patternOptions: { regex: true, caseSensitive: true },
    fileFilter: PY,
    excludePattern: /test|local|dev|#.*DEBUG/i,
    excludeFiles: /test|local_settings|dev_settings/i,
  },

  // --- Go ---
  {
    id: 'go-error-discard',
    category: 'bad-practice',
    severity: 'warning',
    title: 'Discarded Error Return Value',
    description: 'Error return value assigned to _ (blank identifier). Silent error handling causes hard-to-debug failures and can mask security issues.',
    suggestion: 'Handle the error: if err != nil { return fmt.Errorf("context: %w", err) }',
    cwe: 'CWE-252',
    pattern: '[^,]\\s*_\\s*(?::)?=\\s*\\S+\\(',
    patternOptions: { regex: true },
    fileFilter: GO,
    excludePattern: /range|type assertion|ok.*:?=|defer/,
  },
  {
    id: 'go-http-no-timeout',
    category: 'security',
    severity: 'warning',
    title: 'HTTP Client Without Timeout',
    description: 'http.Get/Post uses http.DefaultClient which has no timeout. Malicious or slow servers can exhaust your goroutines and file descriptors.',
    suggestion: 'Use &http.Client{Timeout: 10 * time.Second} instead of default client functions',
    cwe: 'CWE-400',
    pattern: '\\bhttp\\.(?:Get|Post|Head|PostForm)\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: GO,
  },
  {
    id: 'go-sql-concat',
    category: 'security',
    severity: 'critical',
    title: 'SQL String Concatenation in Go',
    description: 'String formatting or concatenation in SQL query. Go database/sql supports parameterized queries natively.',
    suggestion: 'Use db.Query("SELECT * FROM users WHERE id = $1", userID) with placeholders',
    cwe: 'CWE-89',
    owasp: 'A03:2021 Injection',
    pattern: '(?:Query|Exec|Prepare)(?:Context)?\\s*\\(\\s*(?:ctx\\s*,\\s*)?(?:fmt\\.Sprintf|.*\\+)',
    patternOptions: { regex: true },
    fileFilter: GO,
  },

  // --- Rust ---
  {
    id: 'rust-unsafe',
    category: 'security',
    severity: 'warning',
    title: 'Unsafe Block',
    description: 'Unsafe blocks bypass Rust\'s memory safety guarantees. While sometimes necessary, each unsafe block is a potential source of memory corruption, use-after-free, or data races.',
    suggestion: 'Minimize unsafe scope. Document invariants. Prefer safe abstractions. Consider safe-transmute or zerocopy crates.',
    cwe: 'CWE-119',
    learnMoreUrl: 'https://doc.rust-lang.org/book/ch19-01-unsafe-rust.html',
    pattern: '\\bunsafe\\s*\\{',
    patternOptions: { regex: true },
    fileFilter: RUST,
    excludePattern: /\/\/.*unsafe|#\[allow\(unsafe/,
  },
  {
    id: 'rust-unwrap',
    category: 'bad-practice',
    severity: 'info',
    title: 'unwrap() / expect() Usage',
    description: 'unwrap() and expect() panic on None/Err, crashing the program. In production code, handle errors gracefully.',
    suggestion: 'Use ? operator, match, or unwrap_or_default() for production code',
    pattern: '\\.(?:unwrap|expect)\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: RUST,
    excludeFiles: /test|example|bench/i,
  },

  // --- Java / Kotlin ---
  {
    id: 'java-sql-concat',
    category: 'security',
    severity: 'critical',
    title: 'SQL String Concatenation in Java',
    description: 'Building SQL queries with string concatenation enables SQL injection. Use PreparedStatement with parameterized queries.',
    suggestion: 'Use PreparedStatement: stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?")',
    cwe: 'CWE-89',
    owasp: 'A03:2021 Injection',
    pattern: '(?:Statement|createStatement).*(?:execute|Query)\\s*\\(\\s*["\'].*\\+',
    patternOptions: { regex: true },
    fileFilter: [...JAVA, ...KOTLIN],
  },
  {
    id: 'java-deserialization',
    category: 'security',
    severity: 'critical',
    title: 'Unsafe Deserialization',
    description: 'ObjectInputStream.readObject() can instantiate arbitrary classes and execute code during deserialization. This is a well-known RCE vector in Java.',
    suggestion: 'Use JSON/Protobuf for data interchange. If Java serialization is required, use a lookup-based filter.',
    cwe: 'CWE-502',
    owasp: 'A08:2021 Software and Data Integrity Failures',
    pattern: '\\bObjectInputStream\\b.*\\breadObject\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: JAVA,
  },
  {
    id: 'java-runtime-exec',
    category: 'security',
    severity: 'critical',
    title: 'Runtime.exec() Command Execution',
    description: 'Runtime.exec() executes OS commands. If the command string includes user input, this enables command injection.',
    suggestion: 'Use ProcessBuilder with explicit argument arrays. Validate and sanitize all inputs.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    pattern: 'Runtime\\.getRuntime\\(\\)\\.exec\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: [...JAVA, ...KOTLIN],
  },

  // --- C/C++ ---
  {
    id: 'c-gets',
    category: 'security',
    severity: 'critical',
    title: 'gets() — Buffer Overflow',
    description: 'gets() reads input with no length limit. It is impossible to use safely and has been removed from C11. Always causes buffer overflow vulnerabilities.',
    suggestion: 'Use fgets(buffer, sizeof(buffer), stdin) instead',
    cwe: 'CWE-120',
    owasp: 'A06:2021 Vulnerable and Outdated Components',
    pattern: '\\bgets\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: C_CPP,
  },
  {
    id: 'c-strcpy',
    category: 'security',
    severity: 'warning',
    title: 'strcpy/strcat — No Bounds Checking',
    description: 'strcpy() and strcat() copy strings without checking destination buffer size. If the source is longer than the destination, memory corruption occurs.',
    suggestion: 'Use strncpy()/strncat() with explicit size, or strlcpy()/strlcat() where available',
    cwe: 'CWE-120',
    pattern: '\\b(?:strcpy|strcat|sprintf|vsprintf)\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: C_CPP,
    excludePattern: /strncpy|strncat|snprintf|vsnprintf/,
  },
  {
    id: 'c-format-string',
    category: 'security',
    severity: 'critical',
    title: 'Format String Vulnerability',
    description: 'printf() family called with a non-literal format string. If user input reaches the format string, attackers can read memory, crash the program, or gain code execution.',
    suggestion: 'Always use a string literal as format: printf("%s", user_input) instead of printf(user_input)',
    cwe: 'CWE-134',
    pattern: '\\b(?:printf|fprintf|sprintf|snprintf)\\s*\\(\\s*[^"\'\\s,]',
    patternOptions: { regex: true },
    fileFilter: C_CPP,
    excludePattern: /stderr|stdout|^#/,
  },

  // --- Ruby ---
  {
    id: 'ruby-system-exec',
    category: 'security',
    severity: 'critical',
    title: 'Shell Command Execution',
    description: 'system(), exec(), backticks, and %x{} execute OS commands. If user input is interpolated, this enables command injection.',
    suggestion: 'Use the array form: system("cmd", "arg1", "arg2") to avoid shell interpretation',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    pattern: '(?:\\bsystem\\s*\\(|\\bexec\\s*\\(|`[^`]*#\\{|%x\\{)',
    patternOptions: { regex: true },
    fileFilter: RUBY,
    excludePattern: /Kernel\.system.*\[|#.*system/,
  },
  {
    id: 'ruby-mass-assignment',
    category: 'security',
    severity: 'warning',
    title: 'Mass Assignment Risk',
    description: 'params.permit! or using params directly without strong parameters allows attackers to set any model attribute, including admin flags.',
    suggestion: 'Always use strong parameters: params.require(:user).permit(:name, :email)',
    cwe: 'CWE-915',
    owasp: 'A01:2021 Broken Access Control',
    pattern: 'params\\.permit!|params\\[:',
    patternOptions: { regex: true },
    fileFilter: RUBY,
    excludePattern: /require\(|permit\(/,
  },

  // --- PHP ---
  {
    id: 'php-eval',
    category: 'security',
    severity: 'critical',
    title: 'eval() / preg_replace /e',
    description: 'eval() and the /e modifier execute arbitrary PHP code. If user input reaches these, it enables RCE.',
    suggestion: 'Use alternatives: preg_replace_callback() instead of /e. Avoid eval() entirely.',
    cwe: 'CWE-94',
    owasp: 'A03:2021 Injection',
    pattern: '\\b(?:eval|assert)\\s*\\(|preg_replace\\s*\\([^)]+/[a-z]*e[a-z]*["\']',
    patternOptions: { regex: true },
    fileFilter: PHP,
  },
  {
    id: 'php-sql-injection',
    category: 'security',
    severity: 'critical',
    title: 'SQL Injection in PHP',
    description: 'Variable interpolation in SQL query string. PHP has excellent PDO support with prepared statements.',
    suggestion: 'Use PDO prepared statements: $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?"); $stmt->execute([$id]);',
    cwe: 'CWE-89',
    owasp: 'A03:2021 Injection',
    pattern: '(?:mysql_query|mysqli_query|\\$\\w+->query)\\s*\\(\\s*["\']\\s*(?:SELECT|INSERT|UPDATE|DELETE).*\\$',
    patternOptions: { regex: true, caseSensitive: false },
    fileFilter: PHP,
  },
  {
    id: 'php-include-var',
    category: 'security',
    severity: 'critical',
    title: 'Dynamic File Include',
    description: 'include/require with a variable path enables Local/Remote File Inclusion (LFI/RFI). Attackers can include arbitrary files or URLs.',
    suggestion: 'Use a whitelist of allowed files instead of dynamic paths',
    cwe: 'CWE-98',
    owasp: 'A03:2021 Injection',
    pattern: '(?:include|require|include_once|require_once)\\s*\\(?\\s*\\$',
    patternOptions: { regex: true },
    fileFilter: PHP,
  },

  // --- Shell ---
  {
    id: 'shell-unquoted-var',
    category: 'security',
    severity: 'warning',
    title: 'Unquoted Shell Variable',
    description: 'Unquoted variables undergo word splitting and glob expansion. If the variable contains spaces or special characters, the command behaves unexpectedly, potentially executing injected commands.',
    suggestion: 'Always double-quote variables: "$variable" instead of $variable',
    cwe: 'CWE-78',
    pattern: '(?:rm|mv|cp|cat|chmod|chown|mkdir)\\s+(?:-[a-zA-Z]+\\s+)*\\$[A-Za-z_]',
    patternOptions: { regex: true },
    fileFilter: SHELL,
    excludePattern: /"\$/,
  },

  // ===========================================================================
  // BAD PRACTICES — Cross-language & language-specific
  // ===========================================================================

  {
    id: 'console-log',
    category: 'bad-practice',
    severity: 'info',
    title: 'console.log in Production Code',
    description: 'Console statements leak information and clutter output in production. They can expose sensitive data in browser consoles.',
    suggestion: 'Remove or replace with a structured logging library (pino, winston)',
    pattern: '\\bconsole\\.(log|debug|info|trace)\\s*\\(',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
    excludePattern: /\/\/.*console|\/\*.*console|logger/,
    excludeFiles: /\.test\.|\.spec\.|__tests__|__mocks__|\.stories\./,
  },
  {
    id: 'any-type',
    category: 'bad-practice',
    severity: 'warning',
    title: 'TypeScript "any" Type',
    description: 'Using "any" disables type checking for that value and everything it flows into. It defeats TypeScript\'s purpose and hides bugs that would be caught at compile time.',
    suggestion: 'Use "unknown" if the type is uncertain (requires narrowing), or define a proper type/interface',
    cwe: 'CWE-20',
    pattern: ':\\s*any\\b|<any>|as\\s+any\\b',
    patternOptions: { regex: true },
    fileFilter: TS_ONLY,
    excludePattern: /eslint-disable|@ts-ignore|@ts-expect-error|\/\/.*any/i,
  },
  {
    id: 'eslint-disable',
    category: 'bad-practice',
    severity: 'info',
    title: 'Linting Suppression',
    description: 'Suppressed linting rules may hide real issues. Each suppression should have a justification comment explaining why.',
    suggestion: 'Fix the underlying issue. If suppression is necessary, add a comment explaining why.',
    pattern: '(?:eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|noinspection|# noqa|# type: ignore|#nosec)',
    patternOptions: { regex: true },
  },
  {
    id: 'empty-catch',
    category: 'bad-practice',
    severity: 'warning',
    title: 'Empty Catch Block',
    description: 'Silently swallowing errors makes debugging impossible and can mask security-critical failures. At minimum, log the error.',
    suggestion: 'Log the error, re-throw it, or handle it explicitly. Comment if intentional.',
    cwe: 'CWE-390',
    pattern: 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}',
    patternOptions: { regex: true },
    fileFilter: [...JS_TS, ...JAVA, ...KOTLIN, ...CSHARP],
  },
  {
    id: 'var-usage',
    category: 'bad-practice',
    severity: 'info',
    title: '"var" Declaration (JS)',
    description: '"var" has function scope and is hoisted, leading to subtle bugs. "let" and "const" have block scope and are safer.',
    suggestion: 'Replace with "const" (preferred) or "let" for reassigned variables',
    pattern: '\\bvar\\s+[a-zA-Z_$]',
    patternOptions: { regex: true },
    fileFilter: JS_TS,
    excludePattern: /\/\/.*var|\.var|--var|CSS|custom property/,
  },
  {
    id: 'python-bare-except',
    category: 'bad-practice',
    severity: 'warning',
    title: 'Bare except Clause (Python)',
    description: 'Bare except catches ALL exceptions including SystemExit and KeyboardInterrupt. This makes it impossible to terminate the program normally and hides real errors.',
    suggestion: 'Catch specific exceptions, or at minimum use "except Exception:" to exclude system signals',
    pattern: '\\bexcept\\s*:',
    patternOptions: { regex: true },
    fileFilter: PY,
  },
  {
    id: 'python-star-import',
    category: 'bad-practice',
    severity: 'warning',
    title: 'Wildcard Import (Python)',
    description: '"from X import *" pollutes the namespace with all public names from X. It makes code harder to read, maintain, and debug because symbol origins are unclear.',
    suggestion: 'Import specific names: from X import a, b, c',
    pattern: 'from\\s+\\S+\\s+import\\s+\\*',
    patternOptions: { regex: true },
    fileFilter: PY,
    excludePattern: /#.*import|__init__/,
  },
  {
    id: 'go-unused-import-comment',
    category: 'bad-practice',
    severity: 'info',
    title: 'Blank Import Without Justification',
    description: 'Blank imports (_ "pkg") import a package only for its side effects. Without a comment, it is unclear why the import exists.',
    suggestion: 'Add a comment: _ "pkg" // for init() side effect',
    pattern: '_\\s+"[^"]+(?<!_test)"\\s*$',
    patternOptions: { regex: true },
    fileFilter: GO,
    excludePattern: /\/\//,
  },
  {
    id: 'hardcoded-ip',
    category: 'bad-practice',
    severity: 'info',
    title: 'Hardcoded IP Address',
    description: 'IP addresses in code break when infrastructure changes. They should be configurable via environment variables or service discovery.',
    suggestion: 'Use environment variables or DNS names instead of hardcoded IPs',
    pattern: '["\']\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(?::\\d+)?["\']',
    patternOptions: { regex: true },
    excludePattern: /127\.0\.0\.1|0\.0\.0\.0|localhost|example|test|mock|placeholder|192\.168\.|10\.|172\.\d{2}\./i,
  },

  // ===========================================================================
  // RELIABILITY
  // ===========================================================================

  {
    id: 'todo-fixme',
    category: 'reliability',
    severity: 'info',
    title: 'TODO / FIXME / HACK Comment',
    description: 'Unresolved task markers in code indicate incomplete work. These should be tracked in an issue tracker and addressed before release.',
    suggestion: 'Create a tracking issue and address it, or remove if no longer relevant',
    pattern: '(?://|#|/\\*|--|%%)\\s*(?:TODO|FIXME|HACK|XXX|BUG|TEMP|WORKAROUND)\\b',
    patternOptions: { regex: true, caseSensitive: false },
  },
]

// ---------------------------------------------------------------------------
// Composite file-level rules — detect co-occurring dangerous patterns
// These rules analyze the FULL file content to catch vulnerabilities where
// the danger comes from the combination of patterns, not a single line.
// ---------------------------------------------------------------------------

interface CompositeRule {
  id: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  description: string
  suggestion: string
  cwe?: string
  owasp?: string
  learnMoreUrl?: string
  /** File extensions to scan */
  fileFilter: string[]
  /** ALL of these patterns must be present in the same file to trigger */
  requiredPatterns: RegExp[]
  /** Report on the line matching this pattern (the "sink") */
  sinkPattern: RegExp
  /** Skip if ANY of these patterns are present (mitigations) */
  mitigations?: RegExp[]
}

const COMPOSITE_RULES: CompositeRule[] = [
  // child_process imported + command string built from variables/format
  {
    id: 'composite-cmd-injection-exec-var',
    category: 'security',
    severity: 'critical',
    title: 'Command Injection: exec() with Constructed String',
    description: 'This file imports child_process and calls exec()/execSync() with a string variable rather than a literal. When the command string is built from user input, file paths, or util.format(), this enables OS command injection (CWE-78). The exec() function always invokes a shell which interprets metacharacters like ;, |, &&, and $().',
    suggestion: 'Replace exec(cmd) with execFile("program", [arg1, arg2]) which bypasses the shell. If exec() is required, use the shell-quote or shell-escape library to sanitize all interpolated values.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    fileFilter: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    requiredPatterns: [
      /(?:require\s*\(\s*['"]child_process['"]\)|from\s+['"]child_process['"]|from\s+['"]node:child_process['"])/,
      /\bexec(?:Sync)?\s*\(\s*[a-zA-Z_$]/,  // exec called with a variable, not a string literal
    ],
    sinkPattern: /\bexec(?:Sync)?\s*\(\s*[a-zA-Z_$]/,
    mitigations: [/execFile|shell-quote|shell-escape|shellescape/],
  },
  // child_process + util.format (the exact node-pdf-image pattern)
  {
    id: 'composite-cmd-injection-format',
    category: 'security',
    severity: 'critical',
    title: 'Command Injection: Shell Command Built with util.format()',
    description: 'This file uses child_process for execution AND util.format() to build strings. This is a classic command injection pattern: format strings construct shell commands with interpolated values. If any interpolated value comes from user input (filenames, URLs, request parameters), an attacker can inject shell metacharacters to execute arbitrary commands. This exact pattern (CVE-2024-56334) has caused critical RCE vulnerabilities in popular npm packages.',
    suggestion: 'Use execFile() with an array of arguments instead of exec() with a formatted string. Example: execFile("identify", [pdfPath]) instead of exec(util.format(\'identify "%s"\', pdfPath))',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    fileFilter: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    requiredPatterns: [
      /(?:require\s*\(\s*['"]child_process['"]\)|from\s+['"]child_process['"]|from\s+['"]node:child_process['"])/,
      /util\.format\s*\(/,
    ],
    sinkPattern: /util\.format\s*\(/,
    mitigations: [/execFile|shell-quote|shell-escape|shellescape/],
  },
  // child_process + string concatenation for command building
  {
    id: 'composite-cmd-injection-concat',
    category: 'security',
    severity: 'critical',
    title: 'Command Injection: Shell Command Built with String Concatenation',
    description: 'This file uses child_process for execution AND builds strings with concatenation (+) that appear to be command strings. String concatenation for shell commands is inherently dangerous because the concatenated values may contain shell metacharacters.',
    suggestion: 'Use execFile() or spawn() with an array of arguments. Never concatenate user input into command strings.',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/78.html',
    fileFilter: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    requiredPatterns: [
      /(?:require\s*\(\s*['"]child_process['"]\)|from\s+['"]child_process['"]|from\s+['"]node:child_process['"])/,
      /(?:command|cmd)\s*(?:=|\+=)\s*.*\+/,
    ],
    sinkPattern: /(?:command|cmd)\s*(?:=|\+=)\s*.*\+/,
    mitigations: [/execFile|shell-quote|shell-escape|shellescape/],
  },
  // Python: os.system/os.popen with string formatting
  {
    id: 'composite-python-os-cmd',
    category: 'security',
    severity: 'critical',
    title: 'Command Injection: os.system/popen with Formatted String',
    description: 'This file uses os.system() or os.popen() with string formatting (f-strings, .format(), or %). If any formatted value comes from user input, this enables command injection.',
    suggestion: 'Use subprocess.run(["cmd", "arg1"], shell=False) with a list of arguments instead',
    cwe: 'CWE-78',
    owasp: 'A03:2021 Injection',
    fileFilter: ['.py', '.pyw'],
    requiredPatterns: [
      /\bos\.(?:system|popen)\s*\(/,
      /(?:f['"]|\.format\s*\(|%\s*[(\w])/,
    ],
    sinkPattern: /\bos\.(?:system|popen)\s*\(/,
    mitigations: [/shlex\.quote|pipes\.quote/],
  },
  // Node.js: request parameter passed directly to file system operation
  {
    id: 'composite-path-traversal-req',
    category: 'security',
    severity: 'critical',
    title: 'Path Traversal: User Input in File Operation',
    description: 'This file reads request parameters (req.params, req.query, req.body) AND performs file system operations. If the request parameter flows into the file path without validation, attackers can read arbitrary files (../../etc/passwd).',
    suggestion: 'Validate the path with path.resolve() and verify it starts with your intended base directory using startsWith()',
    cwe: 'CWE-22',
    owasp: 'A01:2021 Broken Access Control',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/22.html',
    fileFilter: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    requiredPatterns: [
      /(?:req\.params|req\.query|req\.body|request\.params|searchParams\.get)/,
      /(?:readFile|writeFile|createReadStream|readdir|unlink|stat|access)(?:Sync)?\s*\(/,
    ],
    sinkPattern: /(?:readFile|writeFile|createReadStream|readdir|unlink|stat|access)(?:Sync)?\s*\(/,
    mitigations: [/path\.resolve.*startsWith|sanitize.*path|whitelist|allowedPaths/],
  },
  // SSRF: user input flows into HTTP request
  {
    id: 'composite-ssrf',
    category: 'security',
    severity: 'critical',
    title: 'Potential SSRF: User Input in HTTP Request URL',
    description: 'This file reads user input (request params, query, body) AND makes outbound HTTP requests. If the URL is constructed from user input, attackers can make your server request internal resources (metadata APIs, internal services, cloud credentials).',
    suggestion: 'Validate URLs against an allowlist of trusted hosts. Block private/internal IP ranges. Use a URL parser to verify the host before making requests.',
    cwe: 'CWE-918',
    owasp: 'A10:2021 Server-Side Request Forgery',
    learnMoreUrl: 'https://cwe.mitre.org/data/definitions/918.html',
    fileFilter: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    requiredPatterns: [
      /(?:req\.params|req\.query|req\.body|request\.params|searchParams\.get)/,
      /(?:fetch\s*\(|axios\.|got\(|http\.request|https\.request|urllib)/,
    ],
    sinkPattern: /(?:fetch\s*\(|axios\.|got\(|http\.request|https\.request)/,
    mitigations: [/allowlist|whitelist|allowedHosts|validUrl|isValidUrl|URL_ALLOWLIST/i],
  },
]

function scanCompositeRules(codeIndex: CodeIndex): CodeIssue[] {
  const issues: CodeIssue[] = []

  for (const [path, file] of codeIndex.files) {
    // Check file extension
    const ext = '.' + (path.split('.').pop() || '').toLowerCase()
    
    for (const rule of COMPOSITE_RULES) {
      if (!rule.fileFilter.includes(ext)) continue
      if (SKIP_VENDORED.test(path)) continue

      // Build full file content from lines
      const content = file.lines.join('\n')

      // Check ALL required patterns are present
      const allPresent = rule.requiredPatterns.every(p => p.test(content))
      if (!allPresent) continue

      // Check mitigations — if ANY mitigation is present, skip
      if (rule.mitigations && rule.mitigations.some(m => m.test(content))) continue

      // Find the sink line (where the dangerous operation happens)
      let sinkLine = 1
      let sinkSnippet = ''
      for (let i = 0; i < file.lines.length; i++) {
        if (rule.sinkPattern.test(file.lines[i])) {
          sinkLine = i + 1
          sinkSnippet = file.lines[i].trim()
          break
        }
      }

      issues.push({
        id: `${rule.id}-${path}`,
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        description: rule.description,
        file: path,
        line: sinkLine,
        column: 0,
        snippet: sinkSnippet || 'Multiple dangerous patterns detected in this file',
        suggestion: rule.suggestion,
        cwe: rule.cwe,
        owasp: rule.owasp,
        learnMoreUrl: rule.learnMoreUrl,
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Structural rules (use FullAnalysis graph data, not regex)
// ---------------------------------------------------------------------------

function scanStructuralIssues(codeIndex: CodeIndex, analysis: FullAnalysis | null): CodeIssue[] {
  const issues: CodeIssue[] = []
  if (!analysis) return issues

  // Circular dependencies
  for (const [a, b] of analysis.graph.circular) {
    issues.push({
      id: `circular-${a}-${b}`,
      ruleId: 'circular-dep',
      category: 'reliability',
      severity: 'warning',
      title: 'Circular Dependency',
      description: `${a.split('/').pop()} and ${b.split('/').pop()} import each other, creating a circular dependency. This can cause partially-initialized modules, undefined values at import time, and makes the code impossible to refactor safely.`,
      file: a,
      line: 1,
      column: 0,
      snippet: `${a} <-> ${b}`,
      suggestion: 'Extract shared logic into a third module to break the cycle',
      cwe: 'CWE-1047',
    })
  }

  // Large files (> 400 lines)
  for (const [path, file] of codeIndex.files) {
    if (file.lineCount > 400) {
      issues.push({
        id: `large-file-${path}`,
        ruleId: 'large-file',
        category: 'reliability',
        severity: file.lineCount > 800 ? 'warning' : 'info',
        title: 'Large File',
        description: `${file.lineCount} lines. Large files are harder to navigate, test, review, and maintain. They tend to accumulate unrelated concerns.`,
        file: path,
        line: 1,
        column: 0,
        snippet: `${file.lineCount} lines of code`,
        suggestion: 'Split into smaller, focused modules with clear responsibilities (aim for < 300 lines)',
        cwe: 'CWE-1080',
      })
    }
  }

  // High coupling — files imported by 15+ others
  for (const [path, importers] of analysis.graph.reverseEdges) {
    if (importers.size >= 15) {
      issues.push({
        id: `high-coupling-${path}`,
        ruleId: 'high-coupling',
        category: 'reliability',
        severity: 'warning',
        title: 'Highly Coupled Module',
        description: `Imported by ${importers.size} files. Any change to this module ripples across the codebase. High coupling slows development and increases regression risk.`,
        file: path,
        line: 1,
        column: 0,
        snippet: `Imported by ${importers.size} other files`,
        suggestion: 'Split into smaller modules with focused exports. Consider the Interface Segregation Principle.',
        cwe: 'CWE-1047',
      })
    }
  }

  // Dead modules
  for (const [path, fileAnalysis] of analysis.files) {
    const importers = analysis.graph.reverseEdges.get(path)
    if (analysis.topology.entryPoints.includes(path)) continue
    if (/config|\.d\.ts|index\.(ts|js)$|\.test\.|\.spec\.|__tests__|__init__|migrations/i.test(path)) continue
    if (fileAnalysis.exports.length === 0) continue
    if (analysis.topology.orphans.includes(path)) continue

    if (!importers || importers.size === 0) {
      issues.push({
        id: `dead-module-${path}`,
        ruleId: 'dead-module',
        category: 'reliability',
        severity: 'info',
        title: 'Dead Module',
        description: `Exports ${fileAnalysis.exports.length} symbol(s) but no internal file imports from it. This is likely dead code that increases bundle size and maintenance burden.`,
        file: path,
        line: 1,
        column: 0,
        snippet: `Exports: ${fileAnalysis.exports.map(e => e.name).slice(0, 6).join(', ')}${fileAnalysis.exports.length > 6 ? '...' : ''}`,
        suggestion: 'Remove if unused. Verify it\'s not consumed externally (CLI entry, dynamic import, tests).',
        cwe: 'CWE-561',
      })
    }
  }

  // Deep dependency chains
  if (analysis.topology.maxDepth > 10) {
    const deepestFile = Array.from(analysis.topology.depthMap.entries())
      .sort(([, a], [, b]) => b - a)[0]
    if (deepestFile) {
      issues.push({
        id: `deep-chain-${deepestFile[0]}`,
        ruleId: 'deep-chain',
        category: 'reliability',
        severity: 'warning',
        title: 'Deep Dependency Chain',
        description: `Import chain is ${deepestFile[1]} levels deep. Deep chains make initialization order fragile, increase cold start time, and make refactoring dangerous.`,
        file: deepestFile[0],
        line: 1,
        column: 0,
        snippet: `Chain depth: ${deepestFile[1]} levels`,
        suggestion: 'Flatten the dependency graph. Use dependency injection or lazy imports to reduce depth.',
        cwe: 'CWE-1047',
      })
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export function scanIssues(codeIndex: CodeIndex, analysis: FullAnalysis | null): ScanResults {
  const issues: CodeIssue[] = []
  const seenIds = new Set<string>()

  const MAX_PER_RULE = 15
  const ruleOverflow = new Map<string, number>()

  // 1. Run regex-based rules via searchIndex
  let rulesEvaluated = 0
  for (const rule of RULES) {
    if (!rule.pattern) continue

    // Skip rules for languages not present in the codebase
    if (rule.fileFilter && rule.fileFilter.length > 0) {
      const hasMatchingFile = Array.from(codeIndex.files.keys()).some(path => {
        const ext = '.' + (path.split('.').pop() || '')
        return rule.fileFilter!.includes(ext.toLowerCase())
      })
      if (!hasMatchingFile) continue
    }

    rulesEvaluated++
    let ruleCount = 0
    const results: SearchResult[] = searchIndex(codeIndex, rule.pattern, {
      caseSensitive: rule.patternOptions?.caseSensitive ?? false,
      regex: rule.patternOptions?.regex ?? false,
      wholeWord: rule.patternOptions?.wholeWord ?? false,
    })

    for (const result of results) {
      if (rule.fileFilter && rule.fileFilter.length > 0) {
        const ext = '.' + (result.file.split('.').pop() || '')
        if (!rule.fileFilter.includes(ext.toLowerCase())) continue
      }

      if (SKIP_VENDORED.test(result.file)) continue
      if (rule.excludeFiles && rule.excludeFiles.test(result.file)) continue

      for (const match of result.matches) {
        if (rule.excludePattern && rule.excludePattern.test(match.content)) continue

        const issueId = `${rule.id}-${result.file}-${match.line}`
        if (seenIds.has(issueId)) continue
        seenIds.add(issueId)

        ruleCount++
        if (ruleCount > MAX_PER_RULE) {
          ruleOverflow.set(rule.id, (ruleOverflow.get(rule.id) || 0) + 1)
          continue
        }

        issues.push({
          id: issueId,
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          file: result.file,
          line: match.line,
          column: match.column,
          snippet: match.content.trim(),
          suggestion: rule.suggestion,
          cwe: rule.cwe,
          owasp: rule.owasp,
          learnMoreUrl: rule.learnMoreUrl,
        })
      }
    }
  }

  // 2. Run composite file-level rules
  const compositeIssues = scanCompositeRules(codeIndex)
  rulesEvaluated += COMPOSITE_RULES.length
  for (const issue of compositeIssues) {
    if (!seenIds.has(issue.id)) {
      seenIds.add(issue.id)
      issues.push(issue)
    }
  }

  // 3. Run structural rules
  const structuralIssues = scanStructuralIssues(codeIndex, analysis)
  const structuralRuleIds = new Set(structuralIssues.map(i => i.ruleId))
  rulesEvaluated += structuralRuleIds.size
  for (const issue of structuralIssues) {
    if (!seenIds.has(issue.id)) {
      seenIds.add(issue.id)
      issues.push(issue)
    }
  }

  // Sort: critical first, then warning, then info. Within same severity, by file.
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 }
  issues.sort((a, b) => {
    const sev = severityOrder[a.severity] - severityOrder[b.severity]
    if (sev !== 0) return sev
    return a.file.localeCompare(b.file)
  })

  // Health score — critical issues are grade-killing, not minor deductions.
  // Any critical = maximum D. Each critical drops 30 pts FLAT (not per-kline).
  // Warnings drop 8 pts each, info drops 2 pts each. No normalization by 
  // codebase size — a single RCE in 100k lines is just as bad as in 100 lines.
  const critCount = issues.filter(i => i.severity === 'critical').length
  const warnCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length
  const penalty = (critCount * 30) + (warnCount * 8) + (infoCount * 2)
  let healthScore = Math.max(0, Math.min(100, 100 - penalty))
  // Hard cap: any critical issue means max score is 35 (grade D)
  if (critCount > 0) healthScore = Math.min(healthScore, 35)
  // Any security warning caps at B
  const securityWarnings = issues.filter(i => i.severity === 'warning' && i.category === 'security').length
  if (securityWarnings > 0) healthScore = Math.min(healthScore, 74)
  healthScore = Math.round(healthScore)
  const healthGrade: HealthGrade =
    healthScore >= 90 ? 'A' :
    healthScore >= 75 ? 'B' :
    healthScore >= 60 ? 'C' :
    healthScore >= 40 ? 'D' : 'F'

  return {
    issues,
    summary: {
      total: issues.length,
      critical: critCount,
      warning: warnCount,
      info: infoCount,
      bySecurity: issues.filter(i => i.category === 'security').length,
      byBadPractice: issues.filter(i => i.category === 'bad-practice').length,
      byReliability: issues.filter(i => i.category === 'reliability').length,
    },
    healthGrade,
    healthScore,
    ruleOverflow,
    languagesDetected: detectLanguages(codeIndex),
    rulesEvaluated,
    scannedFiles: codeIndex.totalFiles,
    scannedAt: new Date(),
  }
}
