"use client"

import { useState, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Button } from "@/components/ui/button"
import { ChatMessage } from "./chat-message"
import { ChatInput } from "./chat-input"
import { Bot, AlertCircle, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAPIKeys, useRepository } from "@/providers"
import { buildFileTreeString } from "@/lib/github/fetcher"
import { downloadFile } from "@/lib/export"

export function ChatSidebar({ className }: { className?: string }) {
  const { selectedModel, apiKeys, getValidProviders } = useAPIKeys()
  const { repo, files, codeIndex } = useRepository()
  const [input, setInput] = useState("")

  const validProviders = getValidProviders()
  const hasValidKey = validProviders.length > 0 && selectedModel

  // Build repo context for the AI
  const repoContext = useMemo(() => {
    if (!repo || files.length === 0) return undefined
    return {
      name: repo.fullName,
      description: repo.description || 'No description',
      structure: buildFileTreeString(files),
    }
  }, [repo, files])

  // Build file contents map from indexed files
  const fileContentsMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (codeIndex?.files) {
      for (const [path, file] of codeIndex.files) {
        if (file.content) map[path] = file.content
      }
    }
    return map
  }, [codeIndex])

  // Create transport with file contents for tool-based exploration
  const transport = useMemo(() => {
    if (!selectedModel || !hasValidKey) return undefined
    
    return new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          messages,
          provider: selectedModel.provider,
          model: selectedModel.id,
          apiKey: apiKeys[selectedModel.provider].key,
          repoContext,
          fileContents: fileContentsMap,
        },
      }),
    })
  }, [selectedModel, hasValidKey, apiKeys, repoContext, fileContentsMap])

  const { messages, sendMessage, status, error } = useChat({
    transport: transport ?? undefined,
    id: 'codedoc-chat',
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  const handleSubmit = () => {
    if (!input.trim() || isLoading || !hasValidKey || !transport) return

    const currentInput = input.trim()
    setInput("")
    
    sendMessage({ text: currentInput })
  }

  return (
    <aside className={cn("flex h-full flex-col overflow-hidden rounded-lg bg-card", className)}>
      {/* Header */}
      <div className="flex h-11 items-center justify-between border-b border-foreground/[0.06] px-4">
        <span className="text-sm font-medium text-text-primary">Chat</span>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-muted hover:text-text-primary"
              title="Export chat as Markdown"
              onClick={() => {
                const md = messages.map(m => {
                  const role = m.role === 'user' ? 'User' : 'Assistant'
                  const text = m.parts
                    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                    .map(p => p.text)
                    .join('') || ''
                  return `## ${role}\n\n${text}`
                }).join('\n\n---\n\n')
                const title = repo ? `# Chat — ${repo.name}\n\n` : '# Chat\n\n'
                downloadFile({
                  content: title + md,
                  filename: `chat-${repo?.name || 'export'}.md`,
                  mimeType: 'text/markdown',
                })
              }}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {repo && (
            <span className="text-xs text-text-muted truncate max-w-[150px]" title={repo.fullName}>
              {repo.fullName}
            </span>
          )}
        </div>
      </div>

      {/* API Key Warning */}
      {!hasValidKey && (
        <div className="flex items-center gap-2 px-4 py-2 bg-status-warning/10 border-b border-status-warning/20">
          <AlertCircle className="h-4 w-4 text-status-warning shrink-0" />
          <p className="text-xs text-status-warning">
            Add an API key in Settings to start chatting
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {messages.length === 0 && hasValidKey && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-text-secondary">
              {repo 
                ? `Ask me anything about ${repo.name}`
                : "Connect a repository to get contextual help"
              }
            </p>
            <p className="text-xs text-text-muted mt-1">
              I can explain code, generate docs, and answer questions
            </p>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {error && (
          <div className="flex items-center justify-center gap-2 p-3 bg-status-error/10 rounded-lg mx-auto max-w-sm">
            <AlertCircle className="h-4 w-4 text-status-error shrink-0" />
            <p className="text-xs text-status-error text-center">{error.message}</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          placeholder={hasValidKey ? "Ask about the codebase..." : "Add API key to chat"}
          disabled={!hasValidKey}
        />
      </div>
    </aside>
  )
}
