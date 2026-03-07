import { type KeyboardEvent, type ReactNode, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp, Loader2, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModelSelector } from './model-selector'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading?: boolean
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Slot rendered above the textarea (e.g. pinned context chips). */
  pinnedChips?: ReactNode
  /** Slot rendered next to ModelSelector in the bottom bar (e.g. pin file picker). */
  pinPicker?: ReactNode
  /** Called to abort an in-progress stream. */
  onStop?: () => void
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = 'Ask about the codebase...',
  className,
  disabled = false,
  pinnedChips,
  pinPicker,
  onStop,
}: ChatInputProps) {
  const formRef = useRef<HTMLFormElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit()
  }

  const isDisabled = isLoading || disabled

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={cn('relative rounded-lg border border-interactive-border bg-surface', disabled && 'opacity-60', className)}>
      {pinnedChips}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="resize-none border-0 bg-transparent pr-24 focus-visible:ring-0 focus-visible:ring-offset-0"
        rows={2}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-1">
          <ModelSelector />
          {pinPicker}
        </div>
        <div className="flex items-center gap-1">
          {isLoading && onStop ? (
            <Button
              type="button"
              size="icon"
              className="h-7 w-7 bg-status-error/20 text-status-error hover:bg-status-error/30"
              aria-label="Stop generating"
              onClick={onStop}
            >
              <Square className="h-3 w-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isDisabled || !value.trim()}
              size="icon"
              className="h-7 w-7 bg-interactive-hover text-text-primary hover:bg-interactive-active"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
