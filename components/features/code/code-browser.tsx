"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { 
  Search, X, File, Folder, FolderOpen, ChevronRight, ChevronDown,
  Copy, Check, Loader2, FileText, Code2, 
  CaseSensitive, Regex, WholeWord, Replace, Filter, Download,
  Undo2, ReplaceAll, HelpCircle, AlertTriangle, FolderDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useRepository } from "@/providers"
import type { FileNode } from "@/types/repository"
import { 
  type SearchResult,
  searchIndex,
  flattenFiles,
  buildSearchRegex,
  indexFile,
  batchIndexFiles,
} from "@/lib/code/code-index"
import { fetchFileContent } from "@/lib/github/fetcher"

interface OpenTab {
  path: string
  name: string
  language?: string
  content: string | null
  originalContent: string | null
  isLoading: boolean
  error: string | null
  isModified: boolean
}

type SidebarMode = 'explorer' | 'search'

interface CodeBrowserProps {
  navigateToFile?: string | null
  onNavigateComplete?: () => void
}

export function CodeBrowser({ navigateToFile, onNavigateComplete }: CodeBrowserProps) {
  const { repo, files, codeIndex, updateCodeIndex, indexingProgress: sharedIndexingProgress, modifiedContents, setModifiedContents, getFileContent } = useRepository()
  
  // Sidebar state
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('explorer')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  
  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  
  // Search state  – persisted at this component level; lifted to provider in Task 3
  const { searchState, setSearchState } = useRepository()
  const searchQuery = searchState.searchQuery
  const setSearchQuery = useCallback((v: string) => setSearchState(prev => ({ ...prev, searchQuery: v })), [setSearchState])
  const debouncedSearchQuery = searchState.debouncedSearchQuery
  const setDebouncedSearchQuery = useCallback((v: string) => setSearchState(prev => ({ ...prev, debouncedSearchQuery: v })), [setSearchState])
  const replaceQuery = searchState.replaceQuery
  const setReplaceQuery = useCallback((v: string) => setSearchState(prev => ({ ...prev, replaceQuery: v })), [setSearchState])
  const showReplace = searchState.showReplace
  const setShowReplace = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setSearchState(prev => ({ ...prev, showReplace: typeof v === 'function' ? v(prev.showReplace) : v }))
  }, [setSearchState])
  const fileFilter = searchState.fileFilter
  const setFileFilter = useCallback((v: string) => setSearchState(prev => ({ ...prev, fileFilter: v })), [setSearchState])
  const searchOptions = searchState.searchOptions
  const setSearchOptions = useCallback((v: typeof searchState.searchOptions | ((p: typeof searchState.searchOptions) => typeof searchState.searchOptions)) => {
    setSearchState(prev => ({ ...prev, searchOptions: typeof v === 'function' ? v(prev.searchOptions) : v }))
  }, [setSearchState])

  const [highlightedLine, setHighlightedLine] = useState<{ path: string; line: number } | null>(null)
  const [expandAllMatches, setExpandAllMatches] = useState(false)
  
  // Confirmation state for "Replace All in All Files"
  const [confirmReplaceAll, setConfirmReplaceAll] = useState(false)
  
  // Progressive rendering for search results
  const [visibleResultCount, setVisibleResultCount] = useState(50)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  
  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  
  // Use shared indexing progress from provider
  const indexingProgress = sharedIndexingProgress
  const isIndexingComplete = sharedIndexingProgress.isComplete
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
      // Reset visible count when query changes
      setVisibleResultCount(50)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, setDebouncedSearchQuery])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + F to open search
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setSidebarMode('search')
        setTimeout(() => searchInputRef.current?.focus(), 100)
      }
      // Escape to close search or clear
      if (e.key === 'Escape' && sidebarMode === 'search') {
        if (searchQuery) {
          setSearchQuery('')
          setDebouncedSearchQuery('')
        } else {
          setSidebarMode('explorer')
        }
      }
      // Cmd/Ctrl + H to toggle replace
      if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
        e.preventDefault()
        if (sidebarMode !== 'search') {
          setSidebarMode('search')
        }
        setShowReplace((prev: boolean) => !prev)
        setTimeout(() => searchInputRef.current?.focus(), 100)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarMode, searchQuery, setSearchQuery, setDebouncedSearchQuery, setShowReplace])

  // Active tab content
  const activeTab = useMemo(() => 
    openTabs.find(t => t.path === activeTabPath) || null
  , [openTabs, activeTabPath])
  
  // Open a file in a new tab or switch to existing tab
  const openFile = useCallback(async (file: FileNode) => {
    // Use functional updater to check for duplicates atomically (avoids stale-closure race)
    let alreadyOpen = false
    setOpenTabs(prev => {
      const existing = prev.find(t => t.path === file.path)
      if (existing) {
        alreadyOpen = true
        return prev // no change
      }
      return [...prev, {
        path: file.path,
        name: file.name,
        language: file.language,
        content: null,
        originalContent: null,
        isLoading: true,
        error: null,
        isModified: false,
      }]
    })
    setActiveTabPath(file.path)
    if (alreadyOpen) return
    
    // Load content – check modifiedContents, then index, then fetch
    if (repo) {
      try {
        const modified = modifiedContents.get(file.path)
        const indexed = codeIndex.files.get(file.path)
        const originalContent = indexed?.content ?? null

        if (modified !== undefined) {
          // File was already replaced – show modified version
          setOpenTabs(prev => prev.map(t =>
            t.path === file.path
              ? { ...t, content: modified, originalContent: originalContent ?? modified, isLoading: false, isModified: modified !== originalContent }
              : t
          ))
        } else if (indexed) {
          setOpenTabs(prev => prev.map(t => 
            t.path === file.path ? { ...t, content: indexed.content, originalContent: indexed.content, isLoading: false } : t
          ))
        } else {
          const content = await fetchFileContent(repo.owner, repo.name, repo.defaultBranch, file.path)
          setOpenTabs(prev => prev.map(t => 
            t.path === file.path ? { ...t, content, originalContent: content, isLoading: false } : t
          ))
        }
      } catch (e) {
        setOpenTabs(prev => prev.map(t => 
          t.path === file.path ? { ...t, error: 'Failed to load file', isLoading: false } : t
        ))
      }
    }
  }, [repo, codeIndex, modifiedContents])

  // Navigate to file when prop is set (from diagram click-to-navigate)
  const lastNavigatedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!navigateToFile || navigateToFile === lastNavigatedRef.current) return
    lastNavigatedRef.current = navigateToFile

    const allFiles = flattenFiles(files)
    const exactFile = allFiles.find(f => f.path === navigateToFile)
    if (exactFile) {
      openFile(exactFile)
      onNavigateComplete?.()
      return
    }
    const childFile = allFiles.find(f => f.path.startsWith(navigateToFile + '/'))
    if (childFile) {
      openFile(childFile)
      onNavigateComplete?.()
    }
  }, [navigateToFile, files, openFile, onNavigateComplete])
  
  // Close a tab
  const closeTab = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    
    setOpenTabs(prev => {
      const newTabs = prev.filter(t => t.path !== path)
      
      // If closing active tab, switch to another
      if (activeTabPath === path && newTabs.length > 0) {
        const closedIndex = prev.findIndex(t => t.path === path)
        const newActive = newTabs[Math.min(closedIndex, newTabs.length - 1)]
        setActiveTabPath(newActive?.path || null)
      } else if (newTabs.length === 0) {
        setActiveTabPath(null)
      }
      
      return newTabs
    })
  }, [activeTabPath])
  
  // Toggle folder expansion
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])
  
  // Compute search results directly with useMemo - no extra re-renders
  const searchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim() || !isIndexingComplete) {
      return []
    }
    
    let results = searchIndex(codeIndex, debouncedSearchQuery, searchOptions)
    
    // Apply file filter
    if (fileFilter.trim()) {
      const filters = fileFilter.split(',').map(f => f.trim().toLowerCase()).filter(Boolean)
      results = results.filter(result => {
        const filePath = result.file.toLowerCase()
        return filters.some(filter => {
          // Support glob-like patterns: *.tsx, src/*, etc.
          if (filter.startsWith('*.')) {
            return filePath.endsWith(filter.slice(1))
          }
          if (filter.endsWith('/*')) {
            return filePath.startsWith(filter.slice(0, -1))
          }
          return filePath.includes(filter)
        })
      })
    }
    
    return results
  }, [debouncedSearchQuery, codeIndex, searchOptions, isIndexingComplete, fileFilter])
  
  // Go to search result
  const goToSearchResult = useCallback(async (filePath: string, line: number) => {
    const file = flattenFiles(files).find(f => f.path === filePath)
    if (file) {
      await openFile(file)
      // Set highlighted line after a small delay to ensure content is rendered
      setTimeout(() => {
        setHighlightedLine({ path: filePath, line })
      }, 100)
    }
  }, [files, openFile])

  // ---------------------------------------------------------------------------
  // Helper: apply replacement to content from the index, write to
  // modifiedContents, re-index, and sync any open tab.  All synchronous.
  // ---------------------------------------------------------------------------
  const applyReplace = useCallback((filePath: string, newContent: string) => {
    const indexed = codeIndex.files.get(filePath)
    const originalContent = indexed?.content ?? null

    // 1. Write to modifiedContents (source of truth for modifications)
    setModifiedContents(prev => {
      const next = new Map(prev)
      next.set(filePath, newContent)
      return next
    })

    // 2. Re-index so search results update immediately
    const lang = indexed?.language
    updateCodeIndex(indexFile(codeIndex, filePath, newContent, lang))

    // 3. Sync open tab if it exists
    setOpenTabs(prev => prev.map(tab => {
      if (tab.path !== filePath) return tab
      return { ...tab, content: newContent, isModified: newContent !== (originalContent ?? tab.originalContent) }
    }))
  }, [codeIndex, updateCodeIndex, setModifiedContents])

  // Replace single match on a specific line
  const replaceInFile = useCallback((filePath: string, matchLine: number) => {
    const searchPattern = buildSearchRegex(debouncedSearchQuery, searchOptions)
    if (!searchPattern) return

    const content = getFileContent(filePath)
    if (!content) return

    const lines = content.split('\n')
    const lineIndex = matchLine - 1
    if (lineIndex >= 0 && lineIndex < lines.length) {
      searchPattern.lastIndex = 0
      lines[lineIndex] = lines[lineIndex].replace(searchPattern, replaceQuery)
    }
    applyReplace(filePath, lines.join('\n'))
  }, [debouncedSearchQuery, searchOptions, replaceQuery, getFileContent, applyReplace])

  // Replace all matches in one file
  const replaceAllInFile = useCallback((filePath: string) => {
    const searchPattern = buildSearchRegex(debouncedSearchQuery, searchOptions)
    if (!searchPattern) return

    const content = getFileContent(filePath)
    if (!content) return

    searchPattern.lastIndex = 0
    applyReplace(filePath, content.replace(searchPattern, replaceQuery))
  }, [debouncedSearchQuery, searchOptions, replaceQuery, getFileContent, applyReplace])

  // Replace all matches across ALL files – synchronous, no tabs opened
  const replaceAllInAllFiles = useCallback(() => {
    setConfirmReplaceAll(false)
    const searchPattern = buildSearchRegex(debouncedSearchQuery, searchOptions)
    if (!searchPattern) return

    // Collect all updates for batch re-index
    const updates: Array<{ path: string; content: string; language?: string }> = []
    const newModified = new Map(modifiedContents)

    for (const result of searchResults) {
      const content = getFileContent(result.file)
      if (!content) continue

      searchPattern.lastIndex = 0
      const newContent = content.replace(searchPattern, replaceQuery)
      if (newContent !== content) {
        newModified.set(result.file, newContent)
        const lang = codeIndex.files.get(result.file)?.language
        updates.push({ path: result.file, content: newContent, language: lang })
      }
    }

    // 1. Batch-write modifiedContents
    setModifiedContents(newModified)

    // 2. Batch re-index (one pass)
    if (updates.length > 0) {
      updateCodeIndex(batchIndexFiles(codeIndex, updates))
    }

    // 3. Sync any currently-open tabs that were affected
    const affectedPaths = new Set(updates.map(u => u.path))
    setOpenTabs(prev => prev.map(tab => {
      if (!affectedPaths.has(tab.path)) return tab
      const newContent = newModified.get(tab.path) ?? tab.content
      return { ...tab, content: newContent, isModified: newContent !== tab.originalContent }
    }))
  }, [searchResults, debouncedSearchQuery, searchOptions, replaceQuery, getFileContent, modifiedContents, codeIndex, updateCodeIndex, setModifiedContents])

  // Revert a file to its original content
  const revertFile = useCallback((filePath: string) => {
    const indexed = codeIndex.files.get(filePath)

    // 1. Remove from modifiedContents
    setModifiedContents(prev => {
      const next = new Map(prev)
      next.delete(filePath)
      return next
    })

    // 2. Re-index with original content if available
    if (indexed) {
      updateCodeIndex(indexFile(codeIndex, filePath, indexed.content, indexed.language))
    }

    // 3. Sync open tab
    setOpenTabs(prev => prev.map(tab => {
      if (tab.path !== filePath) return tab
      const original = indexed?.content ?? tab.originalContent
      return { ...tab, content: original, isModified: false }
    }))
  }, [codeIndex, updateCodeIndex, setModifiedContents])

  // Modified files: derived from modifiedContents (not just open tabs)
  const modifiedTabs = useMemo(() => {
    const tabs: OpenTab[] = []
    for (const [path, content] of modifiedContents) {
      const existingTab = openTabs.find(t => t.path === path)
      if (existingTab) {
        tabs.push({ ...existingTab, content, isModified: true })
      } else {
        // File was modified via bulk replace but isn't open as a tab
        const name = path.split('/').pop() || path
        const lang = codeIndex.files.get(path)?.language
        const original = codeIndex.files.get(path)?.content ?? null
        tabs.push({ path, name, language: lang, content, originalContent: original, isLoading: false, error: null, isModified: true })
      }
    }
    return tabs
  }, [modifiedContents, openTabs, codeIndex])
  
  // Download a single modified file
  const downloadFile = useCallback((tab: OpenTab) => {
    if (!tab.content) return
    const blob = new Blob([tab.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = tab.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])
  
  // Download all modified files as a zip
  const downloadAllModified = useCallback(async () => {
    if (modifiedTabs.length === 0) return
    
    // Dynamic import JSZip
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    
    for (const tab of modifiedTabs) {
      if (tab.content) {
        zip.file(tab.path, tab.content)
      }
    }
    
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${repo?.name || 'modified'}-changes.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [modifiedTabs, repo])
  
  // Download a single file from the explorer (fetches from GitHub if not indexed)
  const downloadExplorerFile = useCallback(async (node: FileNode) => {
    let content = getFileContent(node.path)
    if (content === null && repo) {
      try {
        content = await fetchFileContent(repo.owner, repo.name, repo.defaultBranch, node.path)
      } catch {
        return
      }
    }
    if (!content) return
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = node.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [getFileContent, repo])

  // Download a folder from the explorer as a zip (fetches from GitHub if not indexed)
  const downloadExplorerFolder = useCallback(async (node: FileNode) => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    // Recursively collect all file nodes under this folder
    const fileNodes: FileNode[] = []
    const collectNodes = (n: FileNode) => {
      if (n.type === 'file') fileNodes.push(n)
      else if (n.children) for (const child of n.children) collectNodes(child)
    }
    collectNodes(node)

    // Fetch all file contents in parallel (indexed content or GitHub fallback)
    const results = await Promise.allSettled(
      fileNodes.map(async (f) => {
        let content = getFileContent(f.path)
        if (content === null && repo) {
          content = await fetchFileContent(repo.owner, repo.name, repo.defaultBranch, f.path)
        }
        return { path: f.path, content }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.content !== null) {
        const relativePath = result.value.path.startsWith(node.path + '/')
          ? result.value.path.slice(node.path.length + 1)
          : result.value.path.split('/').pop() || result.value.path
        zip.file(relativePath, result.value.content!)
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${node.name}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [getFileContent, repo])

  // Download full project (all files, with modifications baked in)
  const downloadFullProject = useCallback(async () => {
    if (files.length === 0) return

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    // Collect ALL file nodes from the tree (not just indexed ones)
    const allFiles = flattenFiles(files)

    // Fetch all contents in parallel
    const results = await Promise.allSettled(
      allFiles.map(async (f) => {
        let content = getFileContent(f.path)
        if (content === null && repo) {
          content = await fetchFileContent(repo.owner, repo.name, repo.defaultBranch, f.path)
        }
        return { path: f.path, content }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.content !== null) {
        zip.file(result.value.path, result.value.content!)
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${repo?.name || 'project'}-full.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [files, getFileContent, repo])

  // Calculate indexing percentage
  const indexingPercent = indexingProgress.total > 0 
    ? Math.round((indexingProgress.current / indexingProgress.total) * 100) 
    : 0

  // Progressive rendering: load more results when scrolling near bottom
  useEffect(() => {
    const container = resultsContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      if (scrollHeight - scrollTop - clientHeight < 200) {
        setVisibleResultCount(prev => Math.min(prev + 50, searchResults.length))
      }
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [searchResults.length])

  // Total match count for header
  const totalMatchCount = useMemo(() =>
    searchResults.reduce((sum, r) => sum + r.matches.length, 0),
    [searchResults]
  )

  // Render loading in editor area
  const renderEditorContent = () => {
    // Show loading while indexing
    if (!isIndexingComplete && indexingProgress.total > 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-6 w-full max-w-xs">
            {/* Circular Progress */}
            <div className="relative">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="6"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="url(#progressGradient)"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - indexingPercent / 100)}`}
                  className="transition-all duration-300 ease-out"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-semibold text-text-primary">{indexingPercent}%</span>
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-text-primary">Indexing Repository</p>
              <p className="text-xs text-text-muted">
                {indexingProgress.current} of {indexingProgress.total} files
              </p>
            </div>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )
    }

    if (activeTab) {
      if (activeTab.isLoading) {
        return (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
          </div>
        )
      }
      if (activeTab.error) {
        return (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-status-error">{activeTab.error}</p>
          </div>
        )
      }
      if (activeTab.content) {
        return (
          <CodeEditor 
            ref={editorRef}
            content={activeTab.content} 
            language={activeTab.language}
            highlightedLine={highlightedLine?.path === activeTab.path ? highlightedLine.line : undefined}
            searchQuery={sidebarMode === 'search' ? debouncedSearchQuery : ''}
            searchOptions={searchOptions}
            onHighlightComplete={() => setHighlightedLine(null)}
          />
        )
      }
    }
    
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Select a file to view</p>
      </div>
    )
  }

  if (!repo) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0a]">
        <div className="text-center text-text-secondary">
          <Code2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Connect a repository to browse code</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex h-full bg-[#0a0a0a]">
      {/* Activity Bar */}
      <div className="w-12 shrink-0 bg-[#0a0a0a] border-r border-white/[0.06] flex flex-col items-center py-2 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10",
            sidebarMode === 'explorer' 
              ? "text-text-primary bg-white/10" 
              : "text-text-muted hover:text-text-primary"
          )}
          onClick={() => setSidebarMode('explorer')}
          title="Explorer"
        >
          <FileText className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10",
            sidebarMode === 'search' 
              ? "text-text-primary bg-white/10" 
              : "text-text-muted hover:text-text-primary"
          )}
          onClick={() => setSidebarMode('search')}
          title="Search"
        >
          <Search className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Sidebar */}
      <div className="w-60 shrink-0 bg-[#0a0a0a] border-r border-white/[0.06] flex flex-col">
        {sidebarMode === 'explorer' ? (
          <>
            {/* Explorer Header */}
            <div className="h-9 flex items-center justify-between px-4 text-xs font-medium text-text-muted uppercase tracking-wide">
              <span>Explorer</span>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={downloadFullProject}
                      disabled={files.length === 0}
                      className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <FolderDown className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Download full project as ZIP</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* File Tree */}
            <div className="flex-1 overflow-auto">
              <div className="px-2 py-1">
                <FileTreeNode 
                  nodes={files} 
                  expandedFolders={expandedFolders}
                  onToggleFolder={toggleFolder}
                  onFileSelect={openFile}
                  onDownloadFile={downloadExplorerFile}
                  onDownloadFolder={downloadExplorerFolder}
                  activeFilePath={activeTabPath}
                  depth={0}
                />
              </div>
            </div>
            
            {/* Modified Files Section */}
            {modifiedTabs.length > 0 && (
              <div className="border-t border-white/[0.06] p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-text-muted uppercase">
                    Modified ({modifiedTabs.length})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1 text-text-muted hover:text-text-primary"
                    onClick={downloadAllModified}
                    title="Download all modified files as ZIP"
                  >
                    <Download className="h-3 w-3" />
                    Download All
                  </Button>
                </div>
                <div className="space-y-0.5">
                  {modifiedTabs.map((tab) => (
                    <div
                      key={tab.path}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 group"
                    >
                      <File className="h-3.5 w-3.5 text-text-muted shrink-0" />
                      <span className="text-xs text-text-secondary truncate flex-1">{tab.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={() => revertFile(tab.path)}
                        title="Revert to original"
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={() => downloadFile(tab)}
                        title="Download file"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Search Header */}
            <div className="h-9 flex items-center px-4 text-xs font-medium text-text-muted uppercase tracking-wide">
              Search
            </div>
            
            {/* Search Input */}
            <div className="px-2 pb-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search (Ctrl+Shift+F)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-8 pr-2 text-sm bg-[#3c3c3c] border-transparent focus:border-[#007fd4]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      const firstResult = searchResults[0]
                      if (firstResult.matches.length > 0) {
                        goToSearchResult(firstResult.file, firstResult.matches[0].line)
                      }
                    }
                  }}
                />
              </div>
              
              {/* Replace Input */}
              {showReplace && (
                <div className="relative">
                  <Replace className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                  <Input
                    type="text"
                    placeholder="Replace"
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    className="h-7 pl-8 pr-2 text-sm bg-[#3c3c3c] border-transparent focus:border-[#007fd4]"
                  />
                  {/* Regex capture group hint */}
                  {searchOptions.regex && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="absolute right-2 top-1/2 -translate-y-1/2">
                            <HelpCircle className="h-3 w-3 text-text-muted hover:text-text-primary" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[220px] bg-[#252526] border-white/10 text-xs text-text-secondary">
                          <p className="font-medium text-text-primary mb-1">Regex Replace</p>
                          <p>{'Use $1, $2, etc. for capture group backreferences.'}</p>
                          <p className="mt-1 text-text-muted">{'Example: (.+) -> $1_suffix'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}
              
              {/* Search Options */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-6 w-6",
                    searchOptions.caseSensitive ? "bg-white/20 text-text-primary" : "text-text-muted"
                  )}
                  onClick={() => setSearchOptions(p => ({ ...p, caseSensitive: !p.caseSensitive }))}
                  title="Match Case"
                >
                  <CaseSensitive className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-6 w-6",
                    searchOptions.wholeWord ? "bg-white/20 text-text-primary" : "text-text-muted"
                  )}
                  onClick={() => setSearchOptions(p => ({ ...p, wholeWord: !p.wholeWord }))}
                  title="Match Whole Word"
                >
                  <WholeWord className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-6 w-6",
                    searchOptions.regex ? "bg-white/20 text-text-primary" : "text-text-muted"
                  )}
                  onClick={() => setSearchOptions(p => ({ ...p, regex: !p.regex }))}
                  title="Use Regular Expression"
                >
                  <Regex className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-6 w-6",
                    showReplace ? "bg-white/20 text-text-primary" : "text-text-muted"
                  )}
                  onClick={() => setShowReplace(!showReplace)}
                  title="Toggle Replace (Ctrl+H)"
                >
                  <Replace className="h-3.5 w-3.5" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6",
                        fileFilter ? "bg-white/20 text-text-primary" : "text-text-muted"
                      )}
                      title="Filter Files"
                    >
                      <Filter className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 bg-[#252526] border-white/10" align="start">
                    <div className="space-y-2">
                      <p className="text-xs text-text-muted">Files to include</p>
                      <Input
                        type="text"
                        placeholder="*.tsx, src/*"
                        value={fileFilter}
                        onChange={(e) => setFileFilter(e.target.value)}
                        className="h-7 text-xs bg-[#3c3c3c] border-transparent focus:border-[#007fd4]"
                      />
                      <p className="text-[10px] text-text-muted">
                        Comma separated. Examples: *.tsx, src/*, components
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            {/* Search Results */}
            <div className="flex-1 overflow-auto" ref={resultsContainerRef}>
              {!isIndexingComplete ? (
                <div className="px-4 py-8 text-center">
                  {/* Mini progress ring */}
                  <div className="relative w-12 h-12 mx-auto mb-3">
                    <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.1)" strokeWidth="3" fill="none" />
                      <circle
                        cx="24" cy="24" r="20"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 20}`}
                        strokeDashoffset={`${2 * Math.PI * 20 * (1 - indexingPercent / 100)}`}
                        className="transition-all duration-300"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-text-primary">
                      {indexingPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">Indexing...</p>
                </div>
              ) : searchQuery && searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  No results found
                </div>
              ) : searchResults.length > 0 ? (
                <div className="px-2">
                  {/* Results header */}
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-xs text-text-muted">
                      {totalMatchCount} results in {searchResults.length} files
                    </span>
                    <div className="flex items-center gap-1">
                      {/* Replace All in All Files button */}
                      {showReplace && (
                        confirmReplaceAll ? (
                          <div className="flex items-center gap-1 bg-[#3c3c3c] rounded px-1.5 py-0.5">
                            <AlertTriangle className="h-3 w-3 text-amber-400" />
                            <span className="text-[10px] text-text-secondary">Replace all?</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 px-1 text-[10px] text-status-success hover:bg-white/10"
                              onClick={replaceAllInAllFiles}
                            >
                              Yes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 px-1 text-[10px] text-text-muted hover:bg-white/10"
                              onClick={() => setConfirmReplaceAll(false)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-text-muted hover:text-text-primary gap-1"
                            onClick={() => setConfirmReplaceAll(true)}
                            title="Replace All in All Files"
                          >
                            <ReplaceAll className="h-3 w-3" />
                            Replace All
                          </Button>
                        )
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-text-muted hover:text-text-primary"
                        onClick={() => setExpandAllMatches(prev => !prev)}
                      >
                        {expandAllMatches ? 'Collapse' : 'Expand All'}
                      </Button>
                    </div>
                  </div>
                  {/* Progressive rendering: only show first N results */}
                  {searchResults.slice(0, visibleResultCount).map((result) => (
                    <SearchResultItem 
                      key={result.file}
                      result={result}
                      query={debouncedSearchQuery}
                      replaceQuery={replaceQuery}
                      searchOptions={searchOptions}
                      showReplace={showReplace}
                      expandAllMatches={expandAllMatches}
                      onGoTo={goToSearchResult}
                      onReplace={replaceInFile}
                      onReplaceAll={replaceAllInFile}
                    />
                  ))}
                  {visibleResultCount < searchResults.length && (
                    <div className="px-2 py-2 text-center">
                      <button
                        className="text-xs text-text-muted hover:text-text-secondary"
                        onClick={() => setVisibleResultCount(prev => Math.min(prev + 50, searchResults.length))}
                      >
                        Showing {visibleResultCount} of {searchResults.length} files - click to load more
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
      
      {/* Editor Area */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#0a0a0a]">
        {/* Tab Bar */}
        {openTabs.length > 0 && (
          <div className="h-9 flex items-end bg-[#111111] border-b border-white/[0.06] overflow-x-auto">
            {openTabs.map((tab) => (
              <div
                key={tab.path}
                className={cn(
                  "h-full flex items-center gap-2 px-3 border-r border-white/[0.06] cursor-pointer group",
                  tab.path === activeTabPath 
                    ? "bg-[#0a0a0a] text-text-primary" 
                    : "bg-[#181818] text-text-secondary hover:bg-[#1a1a1a]"
                )}
                onClick={() => setActiveTabPath(tab.path)}
              >
                <File className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="text-sm truncate max-w-[120px]">{tab.name}</span>
                {/* Revert button on modified tabs */}
                {tab.isModified && (
                  <button
                    className="h-4 w-4 flex items-center justify-center rounded hover:bg-white/10 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      revertFile(tab.path)
                    }}
                    title="Revert changes"
                  >
                    <Undo2 className="h-3 w-3 text-amber-400" />
                  </button>
                )}
                <button
                  className="h-4 w-4 flex items-center justify-center rounded hover:bg-white/10 opacity-0 group-hover:opacity-100"
                  onClick={(e) => closeTab(tab.path, e)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Breadcrumb */}
        {activeTab && (
          <div className="h-6 flex items-center px-4 bg-[#0a0a0a] border-b border-white/[0.06]">
            <div className="flex items-center gap-1 text-xs text-text-muted">
              {activeTab.path.split('/').map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <button className={cn(
                    "hover:text-text-primary hover:underline",
                    i === arr.length - 1 ? "text-text-primary" : ""
                  )}>
                    {i === 0 ? <Folder className="h-3 w-3 inline mr-1" /> : null}
                    {i === arr.length - 1 ? <File className="h-3 w-3 inline mr-1" /> : null}
                    {part}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Editor Content */}
        <div className="flex-1 overflow-auto">
          {renderEditorContent()}
        </div>
      </div>
    </div>
  )
}

// File Tree Node Component
function FileTreeNode({ 
  nodes, 
  expandedFolders, 
  onToggleFolder, 
  onFileSelect,
  onDownloadFile,
  onDownloadFolder,
  activeFilePath,
  depth 
}: {
  nodes: FileNode[]
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onFileSelect: (file: FileNode) => void
  onDownloadFile: (file: FileNode) => void
  onDownloadFolder: (folder: FileNode) => void
  activeFilePath: string | null
  depth: number
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expandedFolders.has(node.path)
        const isActive = node.path === activeFilePath
        
        return (
          <div key={node.path}>
            <div
              className={cn(
                "flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer group/tree-item",
                isActive ? "bg-[#264f78]" : "hover:bg-white/5"
              )}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              onClick={() => node.type === 'directory' ? onToggleFolder(node.path) : onFileSelect(node)}
            >
              {node.type === 'directory' ? (
                <>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="h-4 w-4 text-text-muted shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 text-text-muted shrink-0" />
                  )}
                </>
              ) : (
                <>
                  <span className="w-4" />
                  <File className="h-4 w-4 shrink-0 text-text-muted" />
                </>
              )}
              <span className="text-sm text-text-primary truncate flex-1">{node.name}</span>
              <button
                className="p-0.5 rounded opacity-0 group-hover/tree-item:opacity-100 text-text-muted hover:text-text-primary hover:bg-white/10 transition-opacity shrink-0"
                title={node.type === 'directory' ? `Download ${node.name} as ZIP` : `Download ${node.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  node.type === 'directory' ? onDownloadFolder(node) : onDownloadFile(node)
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
            
            {node.type === 'directory' && isExpanded && node.children && (
              <FileTreeNode
                nodes={node.children}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onFileSelect={onFileSelect}
                onDownloadFile={onDownloadFile}
                onDownloadFolder={onDownloadFolder}
                activeFilePath={activeFilePath}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
    </>
  )
}



// Code Editor Component
interface CodeEditorProps {
  content: string
  language?: string
  highlightedLine?: number
  searchQuery?: string
  searchOptions?: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }
  onHighlightComplete?: () => void
}

const CodeEditor = React.forwardRef<HTMLDivElement, CodeEditorProps>(
  ({ content, language, highlightedLine, searchQuery, searchOptions, onHighlightComplete }, ref) => {
    const [copied, setCopied] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const highlightedRowRef = useRef<HTMLTableRowElement>(null)
    const lines = content.split('\n')
    
    // Build match-count-per-line map for gutter indicators
    const lineMatchCounts = useMemo(() => {
      const map = new Map<number, number>()
      if (!searchQuery) return map
      const pattern = buildSearchRegex(searchQuery, searchOptions || { caseSensitive: false, regex: false, wholeWord: false })
      if (!pattern) return map
      lines.forEach((line, idx) => {
        pattern.lastIndex = 0
        let count = 0
        while (pattern.exec(line) !== null) {
          count++
          if (pattern.lastIndex === 0) break // zero-length match guard
        }
        if (count > 0) map.set(idx + 1, count)
      })
      return map
    }, [searchQuery, searchOptions, lines])
    
    // Scroll to highlighted line
    useEffect(() => {
      if (highlightedLine) {
        // Use requestAnimationFrame to ensure DOM is ready
        const scrollToLine = () => {
          if (highlightedRowRef.current) {
            highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
        
        // Try immediately, then retry after a short delay if ref isn't ready
        requestAnimationFrame(() => {
          scrollToLine()
          // Retry in case content wasn't fully rendered
          setTimeout(scrollToLine, 50)
        })
        
        // Clear highlight after animation
        const timer = setTimeout(() => {
          onHighlightComplete?.()
        }, 2000)
        
        return () => clearTimeout(timer)
      }
    }, [highlightedLine, onHighlightComplete])
    
    const handleCopy = async () => {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    
    // Highlight matches in a line - uses shared buildSearchRegex
    const highlightMatches = (line: string, _lineNumber: number) => {
      if (!searchQuery) return line || ' '
      
      const searchPattern = buildSearchRegex(
        searchQuery,
        searchOptions || { caseSensitive: false, regex: false, wholeWord: false },
        true, // capture group for .split()
      )
      if (!searchPattern) return line || ' '
      
      const parts = line.split(searchPattern)
      
      if (parts.length === 1) return line || ' '
      
      return parts.map((part, i) => {
        searchPattern.lastIndex = 0 // Fix: always reset before .test()
        if (searchPattern.test(part)) {
          return <span key={i} className="bg-[#613214] text-[#f8c555]">{part}</span>
        }
        return <span key={i}>{part}</span>
      })
    }
    
    return (
      <div ref={ref} className="relative h-full">
        {/* Copy Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-4 h-7 w-7 z-10 bg-[#1a1a1a] hover:bg-[#252525]"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-status-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        
        <div ref={containerRef} className="h-full text-sm font-mono overflow-auto">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => {
                const lineNum = i + 1
                const isHighlighted = lineNum === highlightedLine
                const matchCount = lineMatchCounts.get(lineNum)
                
                return (
                  <tr 
                    key={i} 
                    ref={isHighlighted ? highlightedRowRef : undefined}
                    className={cn(
                      "h-5 leading-5",
                      isHighlighted && "bg-[#264f78] animate-pulse"
                    )}
                  >
                    {/* Line Number + Gutter match indicator */}
                    <td className={cn(
                      "sticky left-0 text-text-muted text-right px-3 select-none border-r border-white/[0.06] align-top w-[1%]",
                      isHighlighted ? "bg-[#264f78]" : "bg-[#0a0a0a]"
                    )}>
                      <span className="relative inline-flex items-center">
                        {matchCount && (
                          <span
                            className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400/80"
                            title={`${matchCount} match${matchCount > 1 ? 'es' : ''} on this line`}
                          />
                        )}
                        {lineNum}
                      </span>
                    </td>
                    {/* Code */}
                    <td className="text-text-primary pl-4 whitespace-pre align-top">
                      {highlightMatches(line, lineNum)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
)
CodeEditor.displayName = "CodeEditor"

// Search Result Item Component
function SearchResultItem({ 
  result, 
  query,
  replaceQuery,
  searchOptions,
  showReplace,
  expandAllMatches,
  onGoTo,
  onReplace,
  onReplaceAll
}: { 
  result: SearchResult
  query: string
  replaceQuery: string
  searchOptions: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }
  showReplace: boolean
  expandAllMatches: boolean
  onGoTo: (file: string, line: number) => void
  onReplace: (file: string, line: number) => void
  onReplaceAll: (file: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [showAllMatches, setShowAllMatches] = useState(false)
  const filename = result.file.split('/').pop()
  const directory = result.file.split('/').slice(0, -1).join('/')
  
  // Show all matches if expandAllMatches is true or local showAllMatches is true
  const displayAllMatches = expandAllMatches || showAllMatches
  const matchesToShow = displayAllMatches ? result.matches : result.matches.slice(0, 10)
  const remainingMatches = result.matches.length - 10
  
  return (
    <div className="mb-1">
      <div 
        className="flex items-center gap-1 py-1 px-2 rounded hover:bg-white/5 cursor-pointer group"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
        )}
        <File className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="text-sm text-text-primary truncate">{filename}</span>
        <span className="text-xs text-text-muted truncate ml-1">{directory}</span>
        {showReplace && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-auto opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onReplaceAll(result.file)
            }}
            title="Replace All in File"
          >
            <Replace className="h-3 w-3" />
          </Button>
        )}
        <span className={cn(
          "text-xs text-text-muted bg-white/10 px-1.5 rounded",
          showReplace ? "" : "ml-auto"
        )}>
          {result.matches.length}
        </span>
      </div>
      
      {expanded && (
        <div className="ml-6">
          {matchesToShow.map((match, i) => (
            <div
              key={`${match.line}-${i}`}
              className="flex flex-col py-0.5 px-2 rounded hover:bg-white/5 cursor-pointer text-xs group"
              onClick={() => onGoTo(result.file, match.line)}
            >
              <div className="flex items-start gap-2">
                <span className="text-text-muted w-8 text-right shrink-0">{match.line}</span>
                <span className="text-text-secondary truncate flex-1">
                  <HighlightedText text={match.content.trim()} query={query} searchOptions={searchOptions} />
                </span>
                {showReplace && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onReplace(result.file, match.line)
                    }}
                    title="Replace"
                  >
                    <Replace className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>
              {/* Replace preview (diff) */}
              {showReplace && (
                <ReplacePreview
                  text={match.content.trim()}
                  query={query}
                  replaceQuery={replaceQuery}
                  searchOptions={searchOptions}
                />
              )}
            </div>
          ))}
          {!displayAllMatches && remainingMatches > 0 && (
            <button
              className="text-xs text-text-muted hover:text-text-secondary px-2 py-1 hover:bg-white/5 rounded w-full text-left"
              onClick={(e) => {
                e.stopPropagation()
                setShowAllMatches(true)
              }}
            >
              +{remainingMatches} more matches (click to expand)
            </button>
          )}
          {displayAllMatches && remainingMatches > 0 && !expandAllMatches && (
            <button
              className="text-xs text-text-muted hover:text-text-secondary px-2 py-1 hover:bg-white/5 rounded w-full text-left"
              onClick={(e) => {
                e.stopPropagation()
                setShowAllMatches(false)
              }}
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Replace Preview Component - shows old (strikethrough/red) vs new (green)
function ReplacePreview({
  text,
  query,
  replaceQuery,
  searchOptions,
}: {
  text: string
  query: string
  replaceQuery: string
  searchOptions: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }
}) {
  const pattern = buildSearchRegex(query, searchOptions)
  if (!pattern) return null

  pattern.lastIndex = 0
  const replaced = text.replace(pattern, replaceQuery)
  if (replaced === text) return null

  return (
    <div className="ml-10 mt-0.5 mb-0.5 flex flex-col gap-px text-[11px] font-mono leading-4">
      <span className="text-red-400/80 line-through truncate">{text}</span>
      <span className="text-emerald-400/80 truncate">{replaced}</span>
    </div>
  )
}

// Highlighted Text Component - uses shared buildSearchRegex
function HighlightedText({ 
  text, 
  query,
  searchOptions 
}: { 
  text: string
  query: string
  searchOptions: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }
}) {
  if (!query) return <>{text}</>
  
  const searchPattern = buildSearchRegex(query, searchOptions, true)
  if (!searchPattern) return <>{text}</>
  
  const parts = text.split(searchPattern)
  
  return (
    <>
      {parts.map((part, i) => {
        // Reset lastIndex for test
        searchPattern.lastIndex = 0
        return searchPattern.test(part) ? (
          <span key={i} className="bg-[#613214] text-[#f8c555]">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}
