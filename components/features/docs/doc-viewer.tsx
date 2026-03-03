"use client"

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  FileText, Code, BookOpen, Rocket, FileCode, MessageSquare,
  Loader2, AlertCircle, Trash2, ChevronDown, Search, X, Plus, Download,
  Square, RefreshCw, Sparkles, ClipboardCopy, Check, Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAPIKeys, useRepository } from '@/providers'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { isToolUIPart, getToolName } from 'ai'
import { buildFileTreeString } from '@/lib/github/fetcher'
import { flattenFiles } from '@/lib/code/code-index'
import { downloadFile } from '@/lib/export'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import type { FileNode } from '@/types/repository'

type DocType = 'architecture' | 'setup' | 'api-reference' | 'file-explanation' | 'custom'

interface DocPreset {
  id: DocType
  label: string
  description: string
  icon: React.ReactNode
  prompt: string
}

const DOC_PRESETS: DocPreset[] = [
  {
    id: 'architecture',
    label: 'Architecture Overview',
    description: 'How the project is structured, modules, data flow, and design decisions',
    icon: <BookOpen className="h-5 w-5" />,
    prompt: 'Generate a comprehensive architecture overview for this codebase. Cover the high-level structure, key modules, data flow, and notable design decisions.',
  },
  {
    id: 'setup',
    label: 'Setup / Getting Started',
    description: 'Installation, configuration, and how to run the project locally',
    icon: <Rocket className="h-5 w-5" />,
    prompt: 'Generate a Getting Started guide for this project. Include prerequisites, installation steps, configuration (env vars, etc.), and how to run it locally.',
  },
  {
    id: 'api-reference',
    label: 'API Reference',
    description: 'Exported functions, classes, types, and interfaces with signatures',
    icon: <Code className="h-5 w-5" />,
    prompt: 'Generate an API reference documenting all significant exported functions, classes, types, and interfaces. Include type signatures, parameter descriptions, and usage examples.',
  },
  {
    id: 'file-explanation',
    label: 'Explain a File',
    description: 'Deep explanation of a specific file -- purpose, logic, and how it fits',
    icon: <FileCode className="h-5 w-5" />,
    prompt: '', // set dynamically based on selected file
  },
  {
    id: 'custom',
    label: 'Custom Prompt',
    description: 'Ask the AI to generate any docs you need',
    icon: <MessageSquare className="h-5 w-5" />,
    prompt: '',
  },
]

interface GeneratedDoc {
  id: string
  type: DocType
  title: string
  messages: UIMessage[]
  createdAt: Date
  targetFile?: string
  customPrompt?: string
}

/** Extracts all assistant text from chat messages. */
function getAssistantText(messages: UIMessage[]): string {
  return messages
    .filter(m => m.role === 'assistant')
    .flatMap(m => m.parts?.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map(p => p.text) || [])
    .join('')
}

function buildDocPrompt(preset: DocPreset, targetFile: string | null, customPrompt: string): string {
  if (preset.id === 'file-explanation' && targetFile) {
    return `Explain this file in detail: \`${targetFile}\`. Cover its purpose, how it fits in the architecture, key functions/classes, and walk through the main logic.`
  }
  if (preset.id === 'custom') return customPrompt
  return preset.prompt
}

interface DocViewerProps {
  className?: string
}

export function DocViewer({ className }: DocViewerProps) {
  const { selectedModel, apiKeys, getValidProviders } = useAPIKeys()
  const { repo, files, codeIndex } = useRepository()

  const hasValidKey = getValidProviders().length > 0 && selectedModel

  // All generated docs
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)

  // New doc generation state
  const [showNewDoc, setShowNewDoc] = useState(true)
  const [selectedPreset, setSelectedPreset] = useState<DocType | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [targetFile, setTargetFile] = useState<string | null>(null)
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [showFileSearch, setShowFileSearch] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isMobile = useIsMobile()

  const activeDoc = generatedDocs.find(d => d.id === activeDocId)
  const contentRef = useRef<HTMLDivElement>(null)

  // Flatten files for file picker
  const allFiles = useMemo(() => files.length > 0 ? flattenFiles(files) : [], [files])
  const FILE_LIMIT = 50
  const filteredFiles = useMemo(() => {
    if (!fileSearchQuery.trim()) return allFiles.slice(0, FILE_LIMIT)
    const q = fileSearchQuery.toLowerCase()
    return allFiles.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)).slice(0, FILE_LIMIT)
  }, [allFiles, fileSearchQuery])

  // Repo context for AI -- includes file tree for orientation
  const repoContext = useMemo(() => {
    if (!repo || files.length === 0) return undefined
    return {
      name: repo.fullName,
      description: repo.description || 'No description',
      structure: buildFileTreeString(files),
    }
  }, [repo, files])

  // Build a map of all indexed file contents for the AI to browse via tools
  const fileContentsMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (codeIndex?.files) {
      for (const [path, file] of codeIndex.files) {
        if (file.content) map[path] = file.content
      }
    }
    return map
  }, [codeIndex])

  // Use refs to capture current generation context -- avoids stale closures in transport
  const genContextRef = useRef<{
    docType: DocType
    targetFile: string | null
    customPrompt: string
  }>({ docType: 'architecture', targetFile: null, customPrompt: '' })
  const isSubmittingRef = useRef(false)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Transport for the active generation -- sends file contents for tool access
  const transport = useMemo(() => {
    if (!selectedModel || !hasValidKey || !repoContext) return undefined
    return new DefaultChatTransport({
      api: '/api/docs/generate',
      prepareSendMessagesRequest: ({ messages }) => {
        const ctx = genContextRef.current
        return {
          body: {
            messages,
            provider: selectedModel.provider,
            model: selectedModel.id,
            apiKey: apiKeys[selectedModel.provider].key,
            docType: ctx.docType,
            repoContext,
            fileContents: fileContentsMap,
            targetFile: ctx.targetFile,
          },
        }
      },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel, hasValidKey, apiKeys, repoContext, fileContentsMap])

  const { messages, sendMessage, status, setMessages, stop, error } = useChat({
    transport: transport ?? undefined,
    id: 'docs-generator',
  })

  const isGenerating = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    return () => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    }
  }, [])

  // When generation completes, save the doc
  const prevStatus = useRef(status)
  useEffect(() => {
    if ((prevStatus.current === 'streaming' || prevStatus.current === 'submitted') && status === 'ready' && messages.length > 0) {
      isSubmittingRef.current = false
      const ctx = genContextRef.current
      const preset = DOC_PRESETS.find(p => p.id === ctx.docType)
      const docId = `doc-${Date.now()}`
      const title = ctx.docType === 'file-explanation' && ctx.targetFile
        ? `${ctx.targetFile.split('/').pop()} Explained`
        : ctx.docType === 'custom'
          ? ctx.customPrompt.slice(0, 50) + (ctx.customPrompt.length > 50 ? '...' : '')
          : preset?.label || 'Documentation'

      const newDoc: GeneratedDoc = {
        id: docId,
        type: ctx.docType,
        title,
        messages: [...messages],
        createdAt: new Date(),
        targetFile: ctx.targetFile || undefined,
        customPrompt: ctx.customPrompt || undefined,
      }

      setGeneratedDocs(prev => [newDoc, ...prev])
      setActiveDocId(docId)
      setShowNewDoc(false)
      setSelectedPreset(null)
      setCustomPrompt('')
      setTargetFile(null)
    }
    prevStatus.current = status
  }, [status, messages])

  // Auto-scroll during streaming — only when user is near the bottom
  useEffect(() => {
    if (isGenerating && contentRef.current) {
      const el = contentRef.current
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [messages, isGenerating])

  const handleGenerate = (preset: DocPreset) => {
    if (!hasValidKey || !repoContext || !transport) return
    if (isGenerating || isSubmittingRef.current) return

    if (preset.id === 'file-explanation' && !targetFile) {
      setSelectedPreset('file-explanation')
      setShowFileSearch(true)
      return
    }

    if (preset.id === 'custom' && !customPrompt.trim()) {
      setSelectedPreset('custom')
      return
    }

    // Snapshot context into ref before sending -- no stale closure issues
    genContextRef.current = {
      docType: preset.id,
      targetFile,
      customPrompt,
    }

    setSelectedPreset(preset.id)
    setMessages([])

    const prompt = buildDocPrompt(preset, targetFile, customPrompt)

    // Let React flush setMessages([]) before sending
    isSubmittingRef.current = true
    sendTimerRef.current = setTimeout(() => {
      sendMessage({ text: prompt })
      isSubmittingRef.current = false
    }, 50)
  }

  const handleFileSelect = (path: string) => {
    setTargetFile(path)
    setShowFileSearch(false)
    setFileSearchQuery('')
  }

  const handleDeleteDoc = (id: string) => {
    setGeneratedDocs(prev => prev.filter(d => d.id !== id))
    if (activeDocId === id) {
      setActiveDocId(null)
      setShowNewDoc(true)
    }
  }

  const handleRegenerate = (doc: GeneratedDoc) => {
    const preset = DOC_PRESETS.find(p => p.id === doc.type)
    if (!preset) return

    // Restore context for regeneration
    setTargetFile(doc.targetFile || null)
    setCustomPrompt(doc.customPrompt || '')
    setSelectedPreset(doc.type)
    setShowNewDoc(true)
    setActiveDocId(null)

    genContextRef.current = {
      docType: doc.type,
      targetFile: doc.targetFile || null,
      customPrompt: doc.customPrompt || '',
    }

    setMessages([])

    const prompt = buildDocPrompt(preset, doc.targetFile || null, doc.customPrompt || '')

    isSubmittingRef.current = true
    sendTimerRef.current = setTimeout(() => {
      sendMessage({ text: prompt })
      isSubmittingRef.current = false
    }, 50)
  }

  // --- Render ---

  // No repo
  if (!repo) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center text-text-secondary">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">Connect a repository to generate documentation</p>
        </div>
      </div>
    )
  }

  // No API key
  if (!hasValidKey) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center max-w-sm">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-secondary mb-1">API key required</p>
          <p className="text-xs text-text-muted">Add an API key in Settings and select a model to generate documentation with AI.</p>
        </div>
      </div>
    )
  }

  const handleDocClick = (docId: string) => {
    if (isGenerating) return
    setActiveDocId(docId)
    setShowNewDoc(false)
    if (isMobile) setSidebarOpen(false)
  }

  const handleNewDocClick = () => {
    setShowNewDoc(true)
    setActiveDocId(null)
    setSelectedPreset(null)
    if (isMobile) setSidebarOpen(false)
  }

  const handleCopyToClipboard = () => {
    if (!activeDoc) return
    const text = getAssistantText(activeDoc.messages)
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        console.warn('Failed to copy to clipboard')
      })
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-3 h-10 border-b border-foreground/[0.06] shrink-0">
        <span className="text-xs font-medium text-text-secondary">Generated Docs</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-text-muted hover:text-text-primary px-1.5"
          onClick={handleNewDocClick}
          disabled={isGenerating}
          title="New document"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[10px]">New</span>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {generatedDocs.length === 0 && (
          <p className="text-[10px] text-text-muted px-3 py-4 text-center">No docs generated yet. Pick a template to get started.</p>
        )}
        {generatedDocs.map(doc => {
          const preset = DOC_PRESETS.find(p => p.id === doc.type)
          return (
            <div
              key={doc.id}
              role="button"
              tabIndex={isGenerating ? -1 : 0}
              aria-disabled={isGenerating || undefined}
              onClick={() => handleDocClick(doc.id)}
              onKeyDown={(e) => { if (isGenerating) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDocClick(doc.id) } }}
              className={cn(
                'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-foreground/5 transition-colors group cursor-pointer',
                activeDocId === doc.id && 'bg-foreground/[0.07]',
                isGenerating && 'pointer-events-none opacity-50'
              )}
            >
              <span className="text-text-muted shrink-0 mt-0.5">{preset?.icon || <FileText className="h-4 w-4" />}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-secondary truncate group-hover:text-text-primary">{doc.title}</p>
                <p className="text-[10px] text-text-muted">{doc.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Delete document"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded shrink-0 text-text-muted hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this generated document.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )
        })}
      </div>
    </>
  )

  return (
    <div className={cn('flex h-full', className)}>
      {/* Sidebar -- desktop */}
      {!isMobile && (
        <div className="w-56 border-r border-foreground/[0.06] flex flex-col shrink-0">
          {sidebarContent}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {showNewDoc || !activeDoc ? (
          // New doc generation view
          <div ref={isGenerating ? contentRef : undefined} className="flex-1 overflow-y-auto flex flex-col">
            {/* Mobile sidebar trigger */}
            {isMobile && (
              <div className="flex items-center gap-2 px-4 h-10 border-b border-foreground/[0.06] shrink-0">
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-primary" aria-label="Open document sidebar">
                      <Menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 p-0 flex flex-col">
                    <SheetHeader className="sr-only">
                      <SheetTitle>Document Sidebar</SheetTitle>
                    </SheetHeader>
                    {sidebarContent}
                  </SheetContent>
                </Sheet>
                <span className="text-xs text-text-secondary font-medium">Docs</span>
              </div>
            )}

            {/* Currently generating */}
            {isGenerating && messages.length > 0 ? (
              <div className="p-6 max-w-3xl">
                <div className="flex items-center justify-between mb-4">
                  <ToolActivity messages={messages} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={stop}
                    className="h-7 text-xs gap-1.5 shrink-0 text-text-secondary hover:text-text-primary"
                  >
                    <Square className="h-3 w-3" />
                    Stop
                  </Button>
                </div>
                <div className="prose prose-invert max-w-none">
                  <MarkdownContent messages={messages} />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0">
                <div className="w-full max-w-xl">
                  <h2 className="text-lg font-semibold text-text-primary mb-1 text-center">Generate Documentation</h2>
                  {selectedModel && (
                    <p className="text-[11px] text-text-muted text-center mb-1 flex items-center justify-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Using {selectedModel.name}
                    </p>
                  )}
                  <p className="text-xs text-text-muted text-center mb-6">
                    AI reads your code and writes real documentation. Pick a template or write a custom prompt.
                  </p>

                  {error && !isGenerating && (
                    <div role="alert" className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                        <span className="text-sm text-destructive">{error.message || 'An unexpected error occurred. Please try again.'}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerate(DOC_PRESETS.find(p => p.id === selectedPreset) || DOC_PRESETS[0])}
                        className="mt-2 h-7 text-xs"
                      >
                        Try Again
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {DOC_PRESETS.map(preset => (
                      <div key={preset.id}>
                        <button
                          onClick={() => {
                            if (preset.id === 'custom') {
                              setSelectedPreset('custom')
                            } else if (preset.id === 'file-explanation') {
                              setSelectedPreset('file-explanation')
                              setShowFileSearch(true)
                            } else {
                              handleGenerate(preset)
                            }
                          }}
                          disabled={isGenerating}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                            'hover:bg-foreground/[0.03] hover:border-foreground/15',
                            selectedPreset === preset.id
                              ? 'border-foreground/20 bg-foreground/[0.04]'
                              : 'border-foreground/[0.06] bg-foreground/[0.01]',
                            isGenerating && 'opacity-50 pointer-events-none'
                          )}
                        >
                          <span className="text-text-muted shrink-0">{preset.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary font-medium">{preset.label}</p>
                            <p className="text-[11px] text-text-muted leading-tight">{preset.description}</p>
                          </div>
                          {preset.id !== 'custom' && preset.id !== 'file-explanation' && (
                            <ChevronDown className="h-4 w-4 text-text-muted shrink-0 -rotate-90" />
                          )}
                        </button>

                        {/* File picker for file-explanation */}
                        {selectedPreset === 'file-explanation' && preset.id === 'file-explanation' && (
                          <div className="mt-2">
                            {targetFile ? (
                              <div className="flex items-center gap-2 mb-2">
                                <FileCode className="h-3.5 w-3.5 text-text-muted" />
                                <span className="text-xs text-text-secondary font-mono flex-1 truncate">{targetFile}</span>
                                <button onClick={() => { setTargetFile(null); setShowFileSearch(true) }} className="text-text-muted hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded" aria-label="Clear selected file">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : null}
                            {showFileSearch && (
                              <div className="rounded-lg border border-foreground/10 bg-card overflow-hidden">
                                <div className="flex items-center gap-2 px-2 border-b border-foreground/[0.06]">
                                  <Search className="h-3.5 w-3.5 text-text-muted shrink-0" />
                                  <Input
                                    autoFocus
                                    value={fileSearchQuery}
                                    onChange={e => setFileSearchQuery(e.target.value)}
                                    placeholder="Search for a file..."
                                    aria-label="Search files"
                                    className="h-8 border-0 bg-transparent text-xs focus-visible:ring-0 px-0"
                                  />
                                </div>
                                <div className="max-h-40 overflow-y-auto py-1">
                                  {filteredFiles.length > 0 && (
                                    <div className="px-3 py-1 flex items-center justify-between">
                                      <span aria-live="polite" className="text-[10px] text-text-muted">
                                        Showing {filteredFiles.length} of {allFiles.length} files
                                      </span>
                                      {filteredFiles.length === FILE_LIMIT && filteredFiles.length < allFiles.length && (
                                        <span className="text-[10px] text-text-muted">Type to search for more files</span>
                                      )}
                                    </div>
                                  )}
                                  {filteredFiles.map(f => (
                                    <button
                                      key={f.path}
                                      onClick={() => handleFileSelect(f.path)}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-foreground/5 text-xs text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
                                    >
                                      <FileCode className="h-3 w-3 text-text-muted shrink-0" />
                                      <span className="truncate">{f.path}</span>
                                    </button>
                                  ))}
                                  {filteredFiles.length === 0 && (
                                    <p className="px-3 py-2 text-[10px] text-text-muted text-center">No files found</p>
                                  )}
                                </div>
                              </div>
                            )}
                            {targetFile && (
                              <Button
                                size="sm"
                                onClick={() => handleGenerate(preset)}
                                disabled={isGenerating}
                                className="mt-2 h-7 text-xs"
                              >
                                Generate
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Custom prompt input */}
                        {selectedPreset === 'custom' && preset.id === 'custom' && (
                          <div className="mt-2 flex flex-col gap-2">
                            <textarea
                              autoFocus
                              value={customPrompt}
                              onChange={e => setCustomPrompt(e.target.value)}
                              placeholder="e.g. 'Explain the auth flow', 'Document the database schema', 'Write a deployment guide'..."
                              aria-label="Custom documentation prompt"
                              className="w-full h-20 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-foreground/20"
                              onKeyDown={e => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && customPrompt.trim()) {
                                  handleGenerate(preset)
                                }
                              }}
                            />
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-text-muted">Ctrl+Enter to generate</span>
                              <Button
                                size="sm"
                                onClick={() => handleGenerate(preset)}
                                disabled={isGenerating || !customPrompt.trim()}
                                className="h-7 text-xs"
                              >
                                Generate
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Viewing a generated doc
          <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-foreground/[0.06]">
                {DOC_PRESETS.find(p => p.id === activeDoc.type)?.icon}
                <h1 className="text-lg font-semibold text-text-primary flex-1">{activeDoc.title}</h1>
                {activeDoc.targetFile && (
                  <code className="text-[10px] text-text-muted bg-foreground/[0.04] px-1.5 py-0.5 rounded">{activeDoc.targetFile}</code>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-text-muted hover:text-text-primary shrink-0"
                  title="Regenerate"
                  aria-label="Regenerate this document"
                  onClick={() => handleRegenerate(activeDoc)}
                  disabled={isGenerating}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-text-muted hover:text-text-primary shrink-0"
                  title="Copy to clipboard"
                  aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
                  onClick={handleCopyToClipboard}
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <ClipboardCopy className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-text-muted hover:text-text-primary shrink-0"
                  title="Export as Markdown"
                  aria-label="Export as Markdown"
                  onClick={() => {
                    const text = getAssistantText(activeDoc.messages)
                    downloadFile({
                      content: text,
                      filename: `${activeDoc.type}-${repo?.name || 'doc'}.md`,
                      mimeType: 'text/markdown',
                    })
                  }}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <div className="prose prose-invert max-w-none">
                <MarkdownContent messages={activeDoc.messages} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Shows which files the AI is reading during tool-calling phase. */
function ToolActivity({ messages }: { messages: UIMessage[] }) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Extract tool invocations from all messages
  const toolCalls: { name: string; path?: string; state: string }[] = []
  const hasText = messages.some(m =>
    m.role === 'assistant' && m.parts?.some(p => p.type === 'text' && p.text.trim().length > 0)
  )

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    for (const part of msg.parts || []) {
      if (isToolUIPart(part)) {
        const input = (part.input as Record<string, unknown> | undefined) ?? {}
        toolCalls.push({
          name: getToolName(part),
          path: (input.path as string) || (input.query as string) || undefined,
          state: part.state,
        })
      }
    }
  }

  if (toolCalls.length === 0 && !hasText) {
    return (
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
        <span className="text-sm text-text-secondary">Starting documentation generation...</span>
      </div>
    )
  }

  const isStillReading = toolCalls.length > 0 && toolCalls.some(t => t.state !== 'output-available' && t.state !== 'output-error')
  const readFiles = toolCalls.filter(t => t.name === 'readFile' && t.path)
  const searches = toolCalls.filter(t => t.name === 'searchFiles')
  const COLLAPSED_LIMIT = 5
  const visibleFiles = isExpanded ? readFiles : readFiles.slice(-COLLAPSED_LIMIT)
  const hasMoreFiles = readFiles.length > COLLAPSED_LIMIT

  return (
    <div className="mb-4">
      {(isStillReading || !hasText) && (
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
          <span className="text-sm text-text-secondary">
            {hasText ? 'Writing documentation...' : isStillReading ? 'Reading codebase...' : 'Analyzing...'}
          </span>
        </div>
      )}
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {readFiles.length > 0 && (
            <span className="text-[10px] text-text-muted px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              Read {readFiles.length} files
            </span>
          )}
          {searches.length > 0 && (
            <span className="text-[10px] text-text-muted px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
              {searches.length} searches
            </span>
          )}
          {visibleFiles.map((t, i) => (
            <span key={i} className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-foreground/[0.03] border border-foreground/[0.06]">
              {t.path?.split('/').slice(-2).join('/') || t.path}
            </span>
          ))}
          {hasMoreFiles && (
            <button
              onClick={() => setIsExpanded(prev => !prev)}
              aria-expanded={isExpanded}
              className="text-[10px] text-text-muted hover:text-text-secondary px-2 py-0.5 rounded bg-foreground/[0.03] border border-foreground/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
            >
              {isExpanded ? 'Show less' : `Show all ${readFiles.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Renders the assistant text from chat messages as formatted markdown. */
function MarkdownContent({ messages }: { messages: UIMessage[] }) {
  const text = getAssistantText(messages)

  if (!text) return null

  return <MarkdownRenderer content={text} />
}
