"use client"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { MermaidToolbar } from './mermaid-toolbar'

interface MermaidFullscreenDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  svgContent: string
  isDarkPreview: boolean
  onToggleTheme: () => void
  onCopyImage: () => Promise<void>
  onCopySource: () => Promise<void>
}

export function MermaidFullscreenDialog({
  isOpen,
  onOpenChange,
  svgContent,
  isDarkPreview,
  onToggleTheme,
  onCopyImage,
  onCopySource,
}: MermaidFullscreenDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] max-h-[95vh] w-fit overflow-auto p-8"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Diagram fullscreen view</DialogTitle>
        <div className="group relative">
          <MermaidToolbar
            onFullscreen={() => onOpenChange(false)}
            onToggleTheme={onToggleTheme}
            onCopyImage={onCopyImage}
            onCopySource={onCopySource}
            isDarkPreview={isDarkPreview}
          />
          <div
            className="flex items-center justify-center min-w-[40vw]"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
