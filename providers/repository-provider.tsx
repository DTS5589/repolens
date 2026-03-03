"use client"

import { createContext, useContext, useState, useCallback, useRef, type ReactNode, type Dispatch, type SetStateAction } from "react"
import type { GitHubRepo, FileNode, ParsedFile, RepositoryContext } from "@/types/repository"
import { parseGitHubUrl } from "@/lib/github/parser"
import { fetchRepoMetadata, fetchRepoTree, buildFileTree, fetchFileContent, detectLanguage } from "@/lib/github/fetcher"
import type { CodeIndex } from "@/lib/code/code-index"
import { createEmptyIndex, indexFile, flattenFiles, buildAIContext } from "@/lib/code/code-index"

interface IndexingProgress {
  current: number
  total: number
  isComplete: boolean
}

export interface SearchState {
  searchQuery: string
  debouncedSearchQuery: string
  replaceQuery: string
  showReplace: boolean
  fileFilter: string
  searchOptions: {
    caseSensitive: boolean
    regex: boolean
    wholeWord: boolean
  }
}

const defaultSearchState: SearchState = {
  searchQuery: '',
  debouncedSearchQuery: '',
  replaceQuery: '',
  showReplace: false,
  fileFilter: '',
  searchOptions: {
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  },
}

interface RepositoryContextType extends RepositoryContext {
  connectRepository: (url: string) => Promise<boolean>
  disconnectRepository: () => void
  loadFileContent: (path: string) => Promise<string | null>
  getFileByPath: (path: string) => FileNode | null
  codeIndex: CodeIndex
  updateCodeIndex: (index: CodeIndex) => void
  getAIContext: (query: string) => string
  indexingProgress: IndexingProgress
  searchState: SearchState
  setSearchState: Dispatch<SetStateAction<SearchState>>
  /** Map of file path -> modified content (replacements etc.) */
  modifiedContents: Map<string, string>
  setModifiedContents: Dispatch<SetStateAction<Map<string, string>>>
  /** Read file content: modifiedContents first, then codeIndex, then null */
  getFileContent: (path: string) => string | null
}

const RepositoryContextDefault: RepositoryContext = {
  repo: null,
  files: [],
  parsedFiles: new Map(),
  isLoading: false,
  error: null,
}

const RepositoryContext = createContext<RepositoryContextType | null>(null)

// Concurrency control for parallel fetching
const CONCURRENCY_LIMIT = 10

async function fetchWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number
): Promise<void> {
  const queue = [...items]
  const executing: Promise<void>[] = []
  
  while (queue.length > 0 || executing.length > 0) {
    while (executing.length < limit && queue.length > 0) {
      const item = queue.shift()!
      const promise = fn(item).then(() => {
        executing.splice(executing.indexOf(promise), 1)
      })
      executing.push(promise)
    }
    
    if (executing.length > 0) {
      await Promise.race(executing)
    }
  }
}

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<GitHubRepo | null>(null)
  const [files, setFiles] = useState<FileNode[]>([])
  const [parsedFiles, setParsedFiles] = useState<Map<string, ParsedFile>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeIndex, setCodeIndex] = useState<CodeIndex>(createEmptyIndex())
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress>({
    current: 0,
    total: 0,
    isComplete: false,
  })
  const indexingAbortRef = useRef<AbortController | null>(null)
  const [searchState, setSearchState] = useState<SearchState>(defaultSearchState)
  const [modifiedContents, setModifiedContents] = useState<Map<string, string>>(new Map())

  // Helper: get file content from modifiedContents first, then codeIndex
  const getFileContent = useCallback((path: string): string | null => {
    if (modifiedContents.has(path)) return modifiedContents.get(path)!
    const indexed = codeIndex.files.get(path)
    return indexed ? indexed.content : null
  }, [modifiedContents, codeIndex])

  // Start indexing files in background
  const startIndexing = useCallback(async (
    repoData: GitHubRepo,
    fileTree: FileNode[],
    signal: AbortSignal
  ) => {
    // Get all indexable files
    const indexableExtensions = new Set([
      'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
      'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
      'cs', 'cpp', 'c', 'h', 'hpp', 'php',
      'vue', 'svelte', 'html', 'css', 'scss', 'sass',
      'json', 'yaml', 'yml', 'md', 'mdx', 'sql', 'graphql',
      'sh', 'bash', 'zsh', 'dockerfile'
    ])
    
    const indexableFiles = flattenFiles(fileTree).filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      const size = f.size || 0
      return ext && indexableExtensions.has(ext) && size < 500000 // Skip files > 500KB
    })
    
    setIndexingProgress({ current: 0, total: indexableFiles.length, isComplete: false })
    
    if (indexableFiles.length === 0) {
      setIndexingProgress({ current: 0, total: 0, isComplete: true })
      return
    }
    
    let currentIndex = createEmptyIndex()
    let processed = 0
    
    // Process files in parallel with concurrency limit
    await fetchWithConcurrency(
      indexableFiles,
      async (file) => {
        if (signal.aborted) return
        
        try {
          const content = await fetchFileContent(
            repoData.owner,
            repoData.name,
            repoData.defaultBranch,
            file.path
          )
          
          if (signal.aborted) return
          
          currentIndex = indexFile(currentIndex, file.path, content, file.language)
          processed++
          
          // Update progress every 5 files to reduce re-renders
          if (processed % 5 === 0 || processed === indexableFiles.length) {
            setIndexingProgress(prev => ({ ...prev, current: processed }))
          }
        } catch (err) {
          // Skip failed files silently
          processed++
        }
      },
      CONCURRENCY_LIMIT
    )
    
    if (!signal.aborted) {
      setCodeIndex(currentIndex)
      setIndexingProgress({ current: processed, total: indexableFiles.length, isComplete: true })
    }
  }, [])

  const connectRepository = useCallback(async (url: string): Promise<boolean> => {
    // Abort any existing indexing
    if (indexingAbortRef.current) {
      indexingAbortRef.current.abort()
    }
    
    setIsLoading(true)
    setError(null)
    setCodeIndex(createEmptyIndex())
    setIndexingProgress({ current: 0, total: 0, isComplete: false })

    try {
      // Parse the URL
      const parsed = parseGitHubUrl(url)
      if (!parsed) {
        throw new Error('Invalid GitHub URL. Please enter a valid repository URL.')
      }

      const { owner, repo: repoName } = parsed

      // Fetch repository metadata
      const repoData = await fetchRepoMetadata(owner, repoName)
      setRepo(repoData)

      // Fetch file tree
      const tree = await fetchRepoTree(owner, repoName, repoData.defaultBranch)
      const fileTree = buildFileTree(tree)
      setFiles(fileTree)

      setIsLoading(false)
      
      // Start indexing immediately in background
      const abortController = new AbortController()
      indexingAbortRef.current = abortController
      startIndexing(repoData, fileTree, abortController.signal)
      
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect repository'
      setError(message)
      setIsLoading(false)
      return false
    }
  }, [startIndexing])

  const disconnectRepository = useCallback(() => {
    // Abort any ongoing indexing
    if (indexingAbortRef.current) {
      indexingAbortRef.current.abort()
      indexingAbortRef.current = null
    }
    
    setRepo(null)
    setFiles([])
    setParsedFiles(new Map())
    setCodeIndex(createEmptyIndex())
    setIndexingProgress({ current: 0, total: 0, isComplete: false })
    setError(null)
    setSearchState(defaultSearchState)
    setModifiedContents(new Map())
  }, [])
  
  const updateCodeIndex = useCallback((index: CodeIndex) => {
    setCodeIndex(index)
  }, [])
  
  const getAIContext = useCallback((query: string): string => {
    return buildAIContext(codeIndex, query)
  }, [codeIndex])

  const loadFileContent = useCallback(async (path: string): Promise<string | null> => {
    if (!repo) return null

    try {
      const content = await fetchFileContent(repo.owner, repo.name, repo.defaultBranch, path)
      return content
    } catch (err) {
      console.error('Failed to load file content:', err)
      return null
    }
  }, [repo])

  const getFileByPath = useCallback((path: string): FileNode | null => {
    function findNode(nodes: FileNode[], targetPath: string): FileNode | null {
      for (const node of nodes) {
        if (node.path === targetPath) return node
        if (node.children) {
          const found = findNode(node.children, targetPath)
          if (found) return found
        }
      }
      return null
    }
    return findNode(files, path)
  }, [files])

  return (
    <RepositoryContext.Provider
      value={{
        repo,
        files,
        parsedFiles,
        isLoading,
        error,
        connectRepository,
        disconnectRepository,
        loadFileContent,
        getFileByPath,
        codeIndex,
        updateCodeIndex,
        getAIContext,
        indexingProgress,
        searchState,
        setSearchState,
        modifiedContents,
        setModifiedContents,
        getFileContent,
      }}
    >
      {children}
    </RepositoryContext.Provider>
  )
}

export function useRepository() {
  const context = useContext(RepositoryContext)
  if (!context) {
    throw new Error('useRepository must be used within a RepositoryProvider')
  }
  return context
}
