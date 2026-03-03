// TypeScript/JavaScript Code Parser
// Uses regex-based parsing for basic extraction (no external AST library needed)

import type { ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParsedExport } from '@/types/repository'

/**
 * Parse a TypeScript/JavaScript file and extract structure
 */
export function parseTypeScriptFile(content: string, path: string): ParsedFile {
  const imports = extractImports(content)
  const exports = extractExports(content)
  const functions = extractFunctions(content)
  const classes = extractClasses(content)
  
  // Build dependency list from imports
  const dependencies = imports.map(imp => imp.source)

  return {
    path,
    language: path.endsWith('.tsx') || path.endsWith('.ts') ? 'typescript' : 'javascript',
    imports,
    exports,
    functions,
    classes,
    dependencies,
  }
}

/**
 * Extract import statements
 */
function extractImports(content: string): ParsedImport[] {
  const imports: ParsedImport[] = []
  
  // Match ES6 imports
  const importRegex = /import\s+(?:(?:(\*\s+as\s+\w+)|(\{[^}]+\})|(\w+))(?:\s*,\s*(?:(\{[^}]+\})|(\w+)))?\s+from\s+)?['"]([^'"]+)['"]/g
  
  let match
  while ((match = importRegex.exec(content)) !== null) {
    const [, namespace, namedImports, defaultImport, namedImports2, defaultImport2, source] = match
    
    const specifiers: string[] = []
    let isDefault = false
    let isNamespace = false
    
    if (namespace) {
      isNamespace = true
      specifiers.push(namespace.replace('* as ', ''))
    }
    
    if (defaultImport || defaultImport2) {
      isDefault = true
      specifiers.push(defaultImport || defaultImport2)
    }
    
    if (namedImports || namedImports2) {
      const named = (namedImports || namedImports2)
        .replace(/[{}]/g, '')
        .split(',')
        .map(s => s.trim().split(' as ')[0].trim())
        .filter(Boolean)
      specifiers.push(...named)
    }
    
    imports.push({
      source,
      specifiers,
      isDefault,
      isNamespace,
    })
  }
  
  return imports
}

/**
 * Extract export statements
 */
function extractExports(content: string): ParsedExport[] {
  const exports: ParsedExport[] = []
  
  // Match export statements
  const patterns = [
    // export default
    { regex: /export\s+default\s+(function|class|const|let|var)\s+(\w+)/g, isDefault: true },
    // export function/class/const
    { regex: /export\s+(function|class|const|let|var|type|interface)\s+(\w+)/g, isDefault: false },
    // export { name }
    { regex: /export\s+\{([^}]+)\}/g, isDefault: false },
  ]
  
  for (const { regex, isDefault } of patterns) {
    let match
    while ((match = regex.exec(content)) !== null) {
      if (match[1] && match[2]) {
        exports.push({
          name: match[2],
          type: mapExportType(match[1]),
          isDefault,
        })
      } else if (match[1] && !match[2]) {
        // Handle export { name1, name2 }
        const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim())
        for (const name of names) {
          if (name) {
            exports.push({ name, type: 'variable', isDefault: false })
          }
        }
      }
    }
  }
  
  return exports
}

function mapExportType(keyword: string): ParsedExport['type'] {
  switch (keyword) {
    case 'function': return 'function'
    case 'class': return 'class'
    case 'type': return 'type'
    case 'interface': return 'interface'
    default: return 'variable'
  }
}

/**
 * Extract function declarations
 */
function extractFunctions(content: string): ParsedFunction[] {
  const functions: ParsedFunction[] = []
  const lines = content.split('\n')
  
  // Match function declarations
  const functionPatterns = [
    // Regular functions: function name(params) or export function name(params)
    /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)(\s*:\s*[^{]+)?/,
    // Arrow functions: const name = (params) => or export const name = (params) =>
    /^(\s*)(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(async\s+)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/,
    // Arrow functions single param: const name = param =>
    /^(\s*)(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?(\w+)\s*=>/,
  ]
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    for (const pattern of functionPatterns) {
      const match = line.match(pattern)
      if (match) {
        const isExported = !!match[2]
        const isAsync = !!(match[3] || match[5])
        const name = match[4]
        const params = extractParams(match[6] || match[6] || '')
        
        // Find end of function (simple heuristic based on braces)
        const endLine = findBlockEnd(lines, i)
        
        // Extract JSDoc comment if present
        const docstring = extractJSDoc(lines, i)
        
        functions.push({
          name,
          type: line.includes('=>') ? 'arrow' : 'function',
          params,
          startLine: i + 1,
          endLine: endLine + 1,
          docstring,
          isExported,
          isAsync,
        })
        
        break
      }
    }
  }
  
  return functions
}

/**
 * Extract class declarations
 */
function extractClasses(content: string): ParsedClass[] {
  const classes: ParsedClass[] = []
  const lines = content.split('\n')
  
  const classRegex = /^(\s*)(export\s+)?(default\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(classRegex)
    if (match) {
      const isExported = !!match[2]
      const name = match[4]
      const extendsClass = match[5]
      const implementsClasses = match[6]?.split(',').map(s => s.trim()).filter(Boolean)
      
      const endLine = findBlockEnd(lines, i)
      const docstring = extractJSDoc(lines, i)
      
      // Extract methods from class body
      const classBody = lines.slice(i, endLine + 1).join('\n')
      const methods = extractClassMethods(classBody, i)
      
      classes.push({
        name,
        methods,
        properties: [],
        extends: extendsClass,
        implements: implementsClasses,
        startLine: i + 1,
        endLine: endLine + 1,
        docstring,
        isExported,
      })
    }
  }
  
  return classes
}

function extractClassMethods(classBody: string, startLineOffset: number): ParsedFunction[] {
  const methods: ParsedFunction[] = []
  const lines = classBody.split('\n')
  
  const methodRegex = /^\s*(async\s+)?(\w+)\s*\(([^)]*)\)(\s*:\s*[^{]+)?/
  
  for (let i = 1; i < lines.length - 1; i++) {
    const match = lines[i].match(methodRegex)
    if (match && !lines[i].includes('function') && !lines[i].includes('class')) {
      const isAsync = !!match[1]
      const name = match[2]
      
      if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) {
        if (name === 'constructor') {
          methods.push({
            name: 'constructor',
            type: 'method',
            params: extractParams(match[3]),
            startLine: startLineOffset + i + 1,
            endLine: startLineOffset + i + 1,
            isExported: false,
            isAsync: false,
          })
        }
        continue
      }
      
      methods.push({
        name,
        type: 'method',
        params: extractParams(match[3]),
        startLine: startLineOffset + i + 1,
        endLine: startLineOffset + i + 1,
        isExported: false,
        isAsync,
      })
    }
  }
  
  return methods
}

function extractParams(paramsStr: string): string[] {
  if (!paramsStr.trim()) return []
  
  return paramsStr
    .split(',')
    .map(p => p.trim().split(':')[0].split('=')[0].trim())
    .filter(Boolean)
}

function findBlockEnd(lines: string[], startLine: number): number {
  let braceCount = 0
  let started = false
  
  for (let i = startLine; i < lines.length; i++) {
    for (const char of lines[i]) {
      if (char === '{') {
        braceCount++
        started = true
      } else if (char === '}') {
        braceCount--
        if (started && braceCount === 0) {
          return i
        }
      }
    }
  }
  
  return lines.length - 1
}

function extractJSDoc(lines: string[], functionLine: number): string | undefined {
  // Look for JSDoc comment above the function
  let commentEnd = functionLine - 1
  while (commentEnd >= 0 && lines[commentEnd].trim() === '') {
    commentEnd--
  }
  
  if (commentEnd < 0 || !lines[commentEnd].includes('*/')) {
    return undefined
  }
  
  let commentStart = commentEnd
  while (commentStart >= 0 && !lines[commentStart].includes('/**')) {
    commentStart--
  }
  
  if (commentStart < 0) {
    return undefined
  }
  
  return lines
    .slice(commentStart, commentEnd + 1)
    .map(l => l.trim().replace(/^\/\*\*|\*\/$/g, '').replace(/^\*\s?/, '').trim())
    .filter(Boolean)
    .join('\n')
}
