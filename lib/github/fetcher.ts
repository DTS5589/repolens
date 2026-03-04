// GitHub API Fetcher

import type { GitHubRepo, RepoTree, FileNode } from '@/types/repository'
import { buildRepoApiUrl, buildTreeApiUrl, buildRawContentUrl } from './parser'

const GITHUB_API_BASE = 'https://api.github.com'

interface FetchOptions {
  token?: string
}

/**
 * Fetch repository metadata
 */
export async function fetchRepoMetadata(
  owner: string, 
  repo: string,
  options: FetchOptions = {}
): Promise<GitHubRepo> {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  }
  
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }
  
  const response = await fetch(buildRepoApiUrl(owner, repo), { headers })
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Repository not found. Make sure the repository exists and is public.')
    }
    if (response.status === 403) {
      throw new Error('Rate limit exceeded. Please try again later or add a GitHub token.')
    }
    throw new Error(`Failed to fetch repository: ${response.statusText}`)
  }
  
  const data = await response.json()
  
  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
    forks: data.forks_count,
    language: data.language,
    topics: data.topics || [],
    isPrivate: data.private,
    url: data.html_url,
    size: data.size,
    openIssuesCount: data.open_issues_count ?? 0,
    pushedAt: data.pushed_at ?? '',
    license: data.license?.spdx_id ?? null,
  }
}

/**
 * Fetch repository file tree
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  sha: string = 'HEAD',
  options: FetchOptions = {}
): Promise<RepoTree> {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  }
  
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }
  
  const response = await fetch(buildTreeApiUrl(owner, repo, sha), { headers })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch repository tree: ${response.statusText}`)
  }
  
  return response.json()
}

/**
 * Fetch file content
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  options: FetchOptions = {}
): Promise<string> {
  const headers: HeadersInit = {}
  
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }
  
  const url = buildRawContentUrl(owner, repo, branch, path)
  const response = await fetch(url, { headers })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`)
  }
  
  return response.text()
}

/**
 * Build a hierarchical file tree from flat tree data
 */
export function buildFileTree(tree: RepoTree): FileNode[] {
  const root: FileNode[] = []
  const nodeMap = new Map<string, FileNode>()
  
  // Sort items so directories come before files at the same level
  const sortedTree = [...tree.tree].sort((a, b) => {
    const aDepth = a.path.split('/').length
    const bDepth = b.path.split('/').length
    if (aDepth !== bDepth) return aDepth - bDepth
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  
  for (const item of sortedTree) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.slice(0, -1).join('/')
    
    const node: FileNode = {
      name,
      path: item.path,
      type: item.type === 'tree' ? 'directory' : 'file',
      size: item.size,
      language: item.type === 'blob' ? detectLanguage(name) : undefined,
    }
    
    if (item.type === 'tree') {
      node.children = []
    }
    
    nodeMap.set(item.path, node)
    
    if (parentPath === '') {
      root.push(node)
    } else {
      const parent = nodeMap.get(parentPath)
      if (parent && parent.children) {
        parent.children.push(node)
      }
    }
  }
  
  return root
}

/**
 * Detect programming language from file extension
 */
export function detectLanguage(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'cs': 'csharp',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'c',
    'hpp': 'cpp',
    'php': 'php',
    'vue': 'vue',
    'svelte': 'svelte',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'mdx': 'mdx',
    'sql': 'sql',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'dockerfile': 'dockerfile',
    'graphql': 'graphql',
    'gql': 'graphql',
  }
  
  return ext ? languageMap[ext] : undefined
}

/**
 * Build a string representation of the file tree for AI context
 */
export function buildFileTreeString(files: FileNode[], indent: string = ''): string {
  let result = ''
  
  for (const file of files) {
    result += `${indent}${file.type === 'directory' ? '/' : ''}${file.name}\n`
    if (file.type === 'directory' && file.children) {
      result += buildFileTreeString(file.children, indent + '  ')
    }
  }
  
  return result
}

/**
 * Filter files by language/extension
 */
export function filterCodeFiles(files: FileNode[]): FileNode[] {
  const codeExtensions = new Set([
    'ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 
    'swift', 'cs', 'cpp', 'c', 'h', 'hpp', 'php', 'vue', 'svelte'
  ])
  
  const result: FileNode[] = []
  
  function traverse(nodes: FileNode[]) {
    for (const node of nodes) {
      if (node.type === 'directory' && node.children) {
        const filteredDir: FileNode = {
          ...node,
          children: []
        }
        traverse(node.children)
        if (filteredDir.children && filteredDir.children.length > 0) {
          result.push(filteredDir)
        }
      } else if (node.type === 'file') {
        const ext = node.name.split('.').pop()?.toLowerCase()
        if (ext && codeExtensions.has(ext)) {
          result.push(node)
        }
      }
    }
  }
  
  traverse(files)
  return result
}
