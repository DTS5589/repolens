// GitHub Repository Types

export interface GitHubRepo {
  owner: string
  name: string
  fullName: string
  description: string | null
  defaultBranch: string
  stars: number
  forks: number
  language: string | null
  topics: string[]
  isPrivate: boolean
  url: string
  /** Repository size in KB as returned by the GitHub API. */
  size?: number
}

export interface RepoFile {
  path: string
  name: string
  type: 'file' | 'dir'
  size?: number
  sha?: string
  url?: string
  content?: string
}

export interface RepoTree {
  sha: string
  tree: RepoTreeItem[]
  truncated: boolean
}

export interface RepoTreeItem {
  path: string
  mode: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
  url?: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  language?: string
  content?: string
}

export interface ParsedFunction {
  name: string
  type: 'function' | 'method' | 'arrow' | 'class'
  params: string[]
  returnType?: string
  startLine: number
  endLine: number
  docstring?: string
  isExported: boolean
  isAsync: boolean
}

export interface ParsedImport {
  source: string
  specifiers: string[]
  isDefault: boolean
  isNamespace: boolean
}

export interface ParsedExport {
  name: string
  type: 'function' | 'class' | 'variable' | 'type' | 'interface'
  isDefault: boolean
}

export interface ParsedFile {
  path: string
  language: string
  imports: ParsedImport[]
  exports: ParsedExport[]
  functions: ParsedFunction[]
  classes: ParsedClass[]
  dependencies: string[]
}

export interface ParsedClass {
  name: string
  methods: ParsedFunction[]
  properties: string[]
  extends?: string
  implements?: string[]
  startLine: number
  endLine: number
  docstring?: string
  isExported: boolean
}

export interface RepositoryContext {
  repo: GitHubRepo | null
  files: FileNode[]
  parsedFiles: Map<string, ParsedFile>
  isLoading: boolean
  error: string | null
}

export interface DependencyNode {
  file: string
  imports: string[]
  importedBy: string[]
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  entryPoints: string[]
}
