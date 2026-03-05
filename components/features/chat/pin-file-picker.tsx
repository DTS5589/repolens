"use client"

import { useState, useMemo, useCallback } from "react"
import { Pin, File, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { PINNED_CONTEXT_CONFIG } from "@/config/constants"
import type { PinnedFile } from "@/types/types"
import type { CodeIndex } from "@/lib/code/code-index"

interface PinFilePickerProps {
  codeIndex: CodeIndex
  pinnedFiles: Map<string, PinnedFile>
  onPin: (path: string, type: "file" | "directory") => void
  onUnpin: (path: string) => void
  className?: string
}

/** Format line count as a compact badge label. */
function formatLines(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

export function PinFilePicker({
  codeIndex,
  pinnedFiles,
  onPin,
  onUnpin,
  className,
}: PinFilePickerProps) {
  const [open, setOpen] = useState(false)

  const filePaths = useMemo(() => {
    return Array.from(codeIndex.files.keys()).sort()
  }, [codeIndex.files])

  const isAtLimit = pinnedFiles.size >= PINNED_CONTEXT_CONFIG.MAX_PINNED_FILES

  const handleSelect = useCallback(
    (path: string) => {
      if (pinnedFiles.has(path)) {
        onUnpin(path)
      } else if (!isAtLimit) {
        onPin(path, "file")
      }
    },
    [pinnedFiles, onPin, onUnpin, isAtLimit],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex items-center gap-1.5 text-xs text-text-secondary hover:bg-foreground/5",
            pinnedFiles.size > 0 && "text-accent-primary",
            className,
          )}
          aria-label="Pin files to chat context"
          aria-haspopup="dialog"
        >
          <Pin className="h-3.5 w-3.5 shrink-0" />
          {pinnedFiles.size > 0 && (
            <span className="text-[10px]">{pinnedFiles.size}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        side="top"
        role="dialog"
        aria-label="Pin file picker"
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search files to pin..." />
          <CommandList>
            <CommandEmpty>No files found.</CommandEmpty>
            <CommandGroup>
              {filePaths.map((path) => {
                const isPinned = pinnedFiles.has(path)
                const file = codeIndex.files.get(path)
                const lineCount = file?.lineCount ?? 0
                const isDisabled = !isPinned && isAtLimit

                return (
                  <CommandItem
                    key={path}
                    value={path}
                    onSelect={() => handleSelect(path)}
                    disabled={isDisabled}
                    className={cn(
                      "flex items-center gap-2",
                      isPinned && "bg-accent-primary/5",
                    )}
                    aria-disabled={isDisabled}
                  >
                    {isPinned ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-accent-primary" />
                    ) : (
                      <File className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    )}
                    <span className="flex-1 truncate text-xs">{path}</span>
                    <span className="shrink-0 text-[10px] text-text-muted">
                      {formatLines(lineCount)}L
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>

          {/* Footer with pin count */}
          <div
            className="flex items-center justify-between border-t px-3 py-2"
            aria-live="polite"
          >
            <span className="text-[11px] text-text-muted">
              {pinnedFiles.size}/{PINNED_CONTEXT_CONFIG.MAX_PINNED_FILES} files pinned
            </span>
            {isAtLimit && (
              <span className="text-[10px] text-status-warning">
                Limit reached
              </span>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
