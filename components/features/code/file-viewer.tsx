"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { X, File, Copy, Check, ExternalLink, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileNode } from "@/types/repository"
import { fetchFileContent } from "@/lib/github/fetcher"

interface FileViewerProps {
  file: FileNode | null
  owner: string
  repo: string
  branch: string
  onClose: () => void
  className?: string
}

export function FileViewer({ file, owner, repo, branch, onClose, className }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!file || file.type === 'directory') {
      setContent(null)
      return
    }

    const loadContent = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const fileContent = await fetchFileContent(owner, repo, branch, file.path)
        setContent(fileContent)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file')
      } finally {
        setIsLoading(false)
      }
    }

    loadContent()
  }, [file, owner, repo, branch])

  const handleCopy = async () => {
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!file) return null

  const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <File className="h-4 w-4 text-text-muted shrink-0" />
          <span className="text-sm text-text-primary truncate">{file.path}</span>
          {file.language && (
            <span className="text-xs text-text-muted bg-white/5 px-1.5 py-0.5 rounded">
              {file.language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-text-secondary hover:text-text-primary"
            onClick={handleCopy}
            disabled={!content}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-status-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-text-secondary hover:text-text-primary"
            onClick={() => window.open(githubUrl, '_blank')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-text-secondary hover:text-text-primary"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-status-error">{error}</p>
          </div>
        ) : content ? (
          <div className="flex text-sm font-mono">
            {/* Line numbers */}
            <div className="flex flex-col items-end px-3 py-4 bg-white/[0.02] border-r border-white/[0.06] select-none">
              {content.split('\n').map((_, i) => (
                <span key={i} className="text-text-muted leading-relaxed px-1">
                  {i + 1}
                </span>
              ))}
            </div>
            {/* Code */}
            <pre className="flex-1 p-4 text-text-primary leading-relaxed overflow-x-auto">
              <code>{content}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
