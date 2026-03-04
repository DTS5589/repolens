"use client"

import {
  ChevronRight,
  FileText,
  Search,
  FolderOpen,
  Code2,
  BarChart3,
  GitBranch,
  Shield,
  Shapes,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MarkdownRenderer } from "@/components/ui/markdown-renderer"
import { memo, useState } from "react"
import type { UIMessage } from "ai"
import { isToolUIPart, getToolName } from "ai"

// ---------------------------------------------------------------------------
// Tool call indicator
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, typeof FileText> = {
  readFile: FileText,
  searchFiles: Search,
  listDirectory: FolderOpen,
  findSymbol: Code2,
  getFileStats: BarChart3,
  analyzeImports: GitBranch,
  scanIssues: Shield,
  generateDiagram: Shapes,
  getProjectOverview: Info,
}

function buildToolLabel(
  toolName: string,
  args: Record<string, unknown>,
): string {
  switch (toolName) {
    case "readFile":
      return `Reading ${args.path ?? "file"}`
    case "searchFiles":
      return `Searching for "${args.query ?? "…"}"`
    case "listDirectory":
      return `Listing ${args.path ?? "(root)"}`
    case "findSymbol":
      return `Finding symbol ${args.name ?? "…"}`
    case "getFileStats":
      return `Analyzing ${args.path ?? "file"}`
    case "analyzeImports":
      return `Checking imports of ${args.path ?? "file"}`
    case "scanIssues":
      return `Scanning ${args.path ?? "files"}`
    case "generateDiagram":
      return `Generating ${args.type ?? "diagram"}`
    case "getProjectOverview":
      return "Getting project overview"
    default:
      return toolName
  }
}

function ToolCallIndicator({
  toolName,
  args,
  result,
}: {
  toolName: string
  args: Record<string, unknown>
  result?: unknown
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = TOOL_ICONS[toolName] || Code2
  const label = buildToolLabel(toolName, args)
  const hasResult = result !== undefined && result !== null

  return (
    <div className="my-0.5">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors w-full text-left"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            isExpanded && "rotate-90",
          )}
        />
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      {isExpanded && hasResult && (
        <pre className="mt-1 ml-6 max-h-48 overflow-auto rounded bg-surface-elevated p-2 text-[11px] font-mono text-text-secondary border border-foreground/[0.06]">
          {typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat message
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: UIMessage
  className?: string
}

export const ChatMessage = memo(function ChatMessage({ message, className }: ChatMessageProps) {
  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"

  // Check if there's any renderable content
  const parts = message.parts ?? []
  const hasContent = parts.some(
    (p) =>
      (p.type === "text" && p.text.trim().length > 0) ||
      isToolUIPart(p),
  )

  if (!hasContent) return null

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "justify-end" : "justify-start",
        className,
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2",
          isUser
            ? "bg-foreground/10 text-text-primary"
            : "bg-transparent text-text-primary",
        )}
      >
        {parts.map((part, index) => {
          if (part.type === "text" && part.text.trim()) {
            return isUser ? (
              <p
                key={index}
                className="whitespace-pre-wrap text-sm leading-relaxed"
              >
                {part.text}
              </p>
            ) : (
              <MarkdownRenderer key={index} content={part.text} />
            )
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part)
            const args = (part.input ?? {}) as Record<string, unknown>
            const result =
              part.state === "output-available" ? part.output : undefined

            return (
              <ToolCallIndicator
                key={index}
                toolName={toolName}
                args={args}
                result={result}
              />
            )
          }

          return null
        })}
      </div>
    </div>
  )
})
