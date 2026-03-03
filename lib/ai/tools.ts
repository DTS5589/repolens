import { tool } from 'ai'
import * as z from 'zod'

/**
 * Core tools shared between chat and docs routes:
 * readFile, searchFiles, listDirectory.
 */
export function createCodeTools(fileMap: Map<string, string>) {
  const allPaths = Array.from(fileMap.keys()).sort()

  return {
    readFile: tool({
      description: 'Read the full contents of a file. Always read files before making claims about their code.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to repo root'),
      }),
      execute: async ({ path }) => {
        const content = fileMap.get(path)
        if (!content) {
          const match = allPaths.find(p => p.endsWith(path) || p.includes(path))
          if (match) {
            return { path: match, content: fileMap.get(match)!, lineCount: fileMap.get(match)!.split('\n').length }
          }
          return { error: `File not found: ${path}. Use searchFiles or check the file tree.` }
        }
        return { path, content, lineCount: content.split('\n').length }
      },
    }),

    searchFiles: tool({
      description: 'Search for files by path pattern or search for text content across all files. Returns matching file paths and line matches.',
      inputSchema: z.object({
        query: z.string().describe('Search query -- matches against file paths AND file contents'),
        maxResults: z.number().nullable().describe('Max results to return. Defaults to 15.'),
      }),
      execute: async ({ query, maxResults }) => {
        const limit = maxResults ?? 15
        const q = query.toLowerCase()
        const results: { path: string; matchType: 'path' | 'content'; preview?: string }[] = []

        for (const path of allPaths) {
          if (results.length >= limit) break
          if (path.toLowerCase().includes(q)) {
            results.push({ path, matchType: 'path' })
          }
        }

        if (results.length < limit) {
          for (const [path, content] of fileMap) {
            if (results.length >= limit) break
            if (results.some(r => r.path === path)) continue
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(q)) {
                results.push({
                  path,
                  matchType: 'content',
                  preview: `L${i + 1}: ${lines[i].trim().slice(0, 120)}`,
                })
                break
              }
            }
          }
        }

        return { totalFiles: allPaths.length, matchCount: results.length, results }
      },
    }),

    listDirectory: tool({
      description: 'List files and subdirectories in a specific directory. Useful to explore folder structure.',
      inputSchema: z.object({
        path: z.string().describe('Directory path relative to repo root, e.g. "src" or "src/components". Use "" for root.'),
      }),
      execute: async ({ path }) => {
        const prefix = path ? (path.endsWith('/') ? path : path + '/') : ''
        const entries = new Set<string>()

        for (const filePath of allPaths) {
          if (!filePath.startsWith(prefix)) continue
          const rest = filePath.slice(prefix.length)
          const firstPart = rest.split('/')[0]
          if (firstPart) {
            const isDir = rest.includes('/')
            entries.add(isDir ? firstPart + '/' : firstPart)
          }
        }

        return {
          directory: path || '(root)',
          entries: Array.from(entries).sort((a, b) => {
            const aDir = a.endsWith('/')
            const bDir = b.endsWith('/')
            if (aDir && !bDir) return -1
            if (!aDir && bDir) return 1
            return a.localeCompare(b)
          }),
        }
      },
    }),
  }
}

/**
 * Advanced analysis tools used only by the chat route:
 * findSymbol, getFileStats, analyzeImports, scanIssues, generateDiagram, getProjectOverview.
 */
export function createAdvancedTools(fileMap: Map<string, string>) {
  const allPaths = Array.from(fileMap.keys()).sort()

  return {
    findSymbol: tool({
      description: 'Find function, class, interface, type, or enum definitions across the codebase by name. Returns file path and line number.',
      inputSchema: z.object({
        name: z.string().describe('Symbol name to search for (function, class, interface, type, enum name)'),
        kind: z.enum(['function', 'class', 'interface', 'type', 'enum', 'any']).describe('Symbol kind filter').optional(),
      }),
      execute: async ({ name, kind }) => {
        const results: Array<{ path: string; line: number; kind: string; match: string }> = []
        const patterns = [
          { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, kind: 'function' },
          { regex: /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/g, kind: 'function' },
          { regex: /(?:export\s+)?class\s+(\w+)/g, kind: 'class' },
          { regex: /(?:export\s+)?interface\s+(\w+)/g, kind: 'interface' },
          { regex: /(?:export\s+)?type\s+(\w+)\s*[=<{]/g, kind: 'type' },
          { regex: /(?:export\s+)?enum\s+(\w+)/g, kind: 'enum' },
        ]
        const nameL = name.toLowerCase()

        for (const [filePath, content] of fileMap) {
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            for (const pat of patterns) {
              if (kind && kind !== 'any' && pat.kind !== kind) continue
              pat.regex.lastIndex = 0
              let m
              while ((m = pat.regex.exec(lines[i])) !== null) {
                if (m[1].toLowerCase() === nameL) {
                  results.push({ path: filePath, line: i + 1, kind: pat.kind, match: lines[i].trim() })
                }
              }
            }
          }
          if (results.length >= 20) break
        }

        return { symbolName: name, matchCount: results.length, results: results.slice(0, 20) }
      },
    }),

    getFileStats: tool({
      description: 'Get statistics for a file: line count, language, imports, and exports.',
      inputSchema: z.object({
        path: z.string().describe('File path'),
      }),
      execute: async ({ path }) => {
        const content = fileMap.get(path) || [...fileMap.entries()].find(([p]) => p.endsWith(path))?.[1]
        if (!content) return { error: `File not found: ${path}` }
        const lines = content.split('\n')
        const ext = path.split('.').pop() || ''
        const importLines = lines.filter(l => l.match(/^import\s/))
        const exportLines = lines.filter(l => l.match(/^export\s/))
        return {
          path,
          lineCount: lines.length,
          language: ext,
          importCount: importLines.length,
          exportCount: exportLines.length,
          imports: importLines.slice(0, 20).map(l => l.trim()),
          exports: exportLines.slice(0, 20).map(l => l.trim()),
        }
      },
    }),

    analyzeImports: tool({
      description: 'Analyze import relationships for a file. Shows what it imports and what other files import it.',
      inputSchema: z.object({
        path: z.string().describe('File path to analyze imports for'),
      }),
      execute: async ({ path }) => {
        const resolvedPath = fileMap.has(path) ? path : [...fileMap.keys()].find(p => p.endsWith(path))
        if (!resolvedPath) return { error: `File not found: ${path}` }

        const content = fileMap.get(resolvedPath)!
        const importRegex = /import\s+.*from\s+['"](.*)['"]/g
        const imports: string[] = []
        let m
        while ((m = importRegex.exec(content)) !== null) imports.push(m[1])

        const baseName = resolvedPath.replace(/\.(ts|tsx|js|jsx)$/, '')
        const fileName = resolvedPath.split('/').pop()?.replace(/\.\w+$/, '')
        const importedBy: string[] = []
        for (const [filePath, fileContent] of fileMap) {
          if (filePath === resolvedPath) continue
          if (fileContent.includes(baseName) || (fileName && fileContent.includes('./' + fileName))) {
            importedBy.push(filePath)
          }
        }

        return { path: resolvedPath, imports, importedBy: importedBy.slice(0, 30) }
      },
    }),

    scanIssues: tool({
      description: 'Run the code quality and security scanner on a specific file. Returns issues found with severity.',
      inputSchema: z.object({
        path: z.string().describe('File path to scan'),
      }),
      execute: async ({ path }) => {
        const content = fileMap.get(path) || [...fileMap.entries()].find(([p]) => p.endsWith(path))?.[1]
        if (!content) return { error: `File not found: ${path}` }

        const issues: Array<{ line: number; severity: string; message: string }> = []
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.includes('eval(')) issues.push({ line: i + 1, severity: 'critical', message: 'Use of eval() is a security risk' })
          if (line.includes('innerHTML')) issues.push({ line: i + 1, severity: 'warning', message: 'innerHTML can cause XSS vulnerabilities' })
          if (line.match(/console\.(log|debug|info)\(/)) issues.push({ line: i + 1, severity: 'info', message: 'Console statement (remove before production)' })
          if (line.includes('any') && line.match(/:\s*any\b/)) issues.push({ line: i + 1, severity: 'warning', message: 'TypeScript `any` type reduces type safety' })
          if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) issues.push({ line: i + 1, severity: 'info', message: `Code annotation: ${line.trim().slice(0, 80)}` })
          if (line.includes('password') && line.match(/['"]\w+['"]/)) issues.push({ line: i + 1, severity: 'critical', message: 'Possible hardcoded credential' })
        }

        return { path, issueCount: issues.length, issues: issues.slice(0, 50) }
      },
    }),

    generateDiagram: tool({
      description: 'Generate a Mermaid diagram of the codebase. Types: summary, topology, import-graph, class-diagram, entry-points, module-usage, treemap, external-deps, focus-diagram.',
      inputSchema: z.object({
        type: z.enum(['summary', 'topology', 'import-graph', 'class-diagram', 'entry-points', 'module-usage', 'treemap', 'external-deps', 'focus-diagram']).describe('Diagram type'),
        focusFile: z.string().optional().describe('For focus-diagram: the file path to focus on'),
      }),
      execute: async ({ type, focusFile: _focusFile }) => {
        if (type === 'summary') {
          const languages: Record<string, number> = {}
          for (const path of allPaths) {
            const ext = path.split('.').pop() || 'other'
            languages[ext] = (languages[ext] || 0) + 1
          }
          const sorted = Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 8)
          const total = allPaths.length
          let mermaid = 'pie title File Distribution\n'
          for (const [lang, count] of sorted) {
            mermaid += `  "${lang}" : ${count}\n`
          }
          return { type, mermaid, fileCount: total }
        }

        if (type === 'topology' || type === 'import-graph') {
          const nodes = new Set<string>()
          const edges: Array<{ from: string; to: string }> = []
          for (const [filePath, content] of fileMap) {
            const dir = filePath.split('/').slice(0, -1).join('/') || '(root)'
            nodes.add(dir)
            const importRegex = /import\s+.*from\s+['"](\.\.?\/[^'"]+)['"]/g
            let m
            while ((m = importRegex.exec(content)) !== null) {
              const importPath = m[1].replace(/\.\w+$/, '')
              const parts = importPath.split('/')
              const targetDir = parts.slice(0, -1).join('/') || '(root)'
              if (targetDir !== dir) {
                nodes.add(targetDir)
                edges.push({ from: dir, to: targetDir })
              }
            }
          }
          const uniqueEdges = [...new Set(edges.map(e => `${e.from}|||${e.to}`))]
            .map(e => { const [from, to] = e.split('|||'); return { from, to } })
            .slice(0, 30)

          let mermaid = 'graph LR\n'
          for (const edge of uniqueEdges) {
            const fromId = edge.from.replace(/[^a-zA-Z0-9]/g, '_')
            const toId = edge.to.replace(/[^a-zA-Z0-9]/g, '_')
            mermaid += `  ${fromId}["${edge.from}"] --> ${toId}["${edge.to}"]\n`
          }
          return { type, mermaid, nodeCount: nodes.size, edgeCount: uniqueEdges.length }
        }

        return {
          type,
          note: `Diagram type '${type}' requires complex analysis. Here's the file structure you can reference in a Mermaid diagram:`,
          structure: allPaths.slice(0, 100),
          totalFiles: allPaths.length,
        }
      },
    }),

    getProjectOverview: tool({
      description: 'Get a comprehensive overview of the project: file count, languages, folder structure, and key patterns.',
      inputSchema: z.object({}),
      execute: async () => {
        const languages: Record<string, number> = {}
        const folders: Record<string, number> = {}
        let totalLines = 0

        for (const [path, content] of fileMap) {
          const ext = path.split('.').pop() || 'other'
          languages[ext] = (languages[ext] || 0) + 1
          const dir = path.split('/')[0] || '(root)'
          folders[dir] = (folders[dir] || 0) + 1
          totalLines += content.split('\n').length
        }

        return {
          totalFiles: allPaths.length,
          totalLines,
          languages: Object.entries(languages).sort((a, b) => b[1] - a[1]),
          topFolders: Object.entries(folders).sort((a, b) => b[1] - a[1]).slice(0, 15),
          hasTests: allPaths.some(p => p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__')),
          hasConfig: allPaths.some(p => p.includes('tsconfig') || p.includes('package.json')),
          entryPoints: allPaths.filter(p => p.match(/(index|main|app|page)\.(ts|tsx|js|jsx)$/)).slice(0, 10),
        }
      },
    }),
  }
}
