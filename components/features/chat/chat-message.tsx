import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UIMessage } from 'ai'

interface ChatMessageProps {
  message: UIMessage
  className?: string
}

// Helper to extract text from UIMessage parts
function getMessageText(message: UIMessage): string {
  if (!message.parts || !Array.isArray(message.parts)) return ''
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

export function ChatMessage({ message, className }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const text = getMessageText(message)

  if (!text) return null

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start', className)}>
      {isAssistant && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10">
          <Bot className="h-4 w-4 text-text-primary" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2',
          isUser 
            ? 'bg-foreground/10 text-text-primary' 
            : 'bg-transparent text-text-primary'
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      </div>
      {isUser && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10">
          <User className="h-4 w-4 text-text-primary" />
        </div>
      )}
    </div>
  )
}
