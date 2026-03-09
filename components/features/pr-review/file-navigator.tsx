"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PRFile } from "@/types/pr-review"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileNavigatorProps {
  files: PRFile[]
  selectedFile: string | null
  onSelectFile: (filename: string) => void
  totalChangedFiles?: number
  isFileTruncated?: boolean
}

// ---------------------------------------------------------------------------
// FileNavigator
// ---------------------------------------------------------------------------

export function FileNavigator({ files, selectedFile, onSelectFile, totalChangedFiles, isFileTruncated }: FileNavigatorProps) {
  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r">
      {/* Header */}
      <div className="shrink-0 border-b px-3 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Changed Files
          <span className="ml-1.5 text-foreground">{files.length}</span>
        </h3>
        {isFileTruncated && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Showing first 100{totalChangedFiles ? ` of ${totalChangedFiles}` : '+'} files</span>
          </div>
        )}
      </div>

      {/* File list */}
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-1">
          {files.map((file) => (
            <FileNavItem
              key={file.filename}
              file={file}
              isSelected={file.filename === selectedFile}
              onClick={() => onSelectFile(file.filename)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FileNavItem
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  added: { label: "A", variant: "default" },
  removed: { label: "D", variant: "destructive" },
  modified: { label: "M", variant: "secondary" },
  renamed: { label: "R", variant: "outline" },
  copied: { label: "C", variant: "outline" },
  changed: { label: "C", variant: "secondary" },
  unchanged: { label: "U", variant: "outline" },
}

function FileNavItem({
  file,
  isSelected,
  onClick,
}: {
  file: PRFile
  isSelected: boolean
  onClick: () => void
}) {
  const config = STATUS_CONFIG[file.status] ?? { label: "?", variant: "outline" as const }
  const filename = file.filename.split("/").pop() ?? file.filename
  const directory = file.filename.includes("/")
    ? file.filename.slice(0, file.filename.lastIndexOf("/"))
    : ""

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
      )}
      onClick={onClick}
      aria-current={isSelected ? "true" : undefined}
    >
      <Badge variant={config.variant} className="text-[10px] px-1.5 py-0 h-5 shrink-0">
        {config.label}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{filename}</div>
        {directory && (
          <div className="text-[10px] text-muted-foreground truncate">{directory}</div>
        )}
      </div>
      <span className="flex items-center gap-0.5 text-[10px] font-mono shrink-0">
        {file.additions > 0 && (
          <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
        )}
        {file.deletions > 0 && (
          <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
        )}
      </span>
    </button>
  )
}
