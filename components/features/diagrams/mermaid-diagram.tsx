"use client"

import { useEffect, useRef, useState, useCallback, useImperativeHandle, type Ref } from 'react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'
import { AlertTriangle, Code } from 'lucide-react'

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#60a5fa',
    lineColor: '#64748b',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
    background: '#0a0a0a',
    mainBkg: '#1e293b',
    nodeBorder: '#475569',
    clusterBkg: '#1e293b',
    titleColor: '#f8fafc',
    edgeLabelBackground: '#1e293b',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
  },
})

// ---------------------------------------------------------------------------
// Error parsing utility — extracts structured info from mermaid error strings
// ---------------------------------------------------------------------------

export interface MermaidErrorDetail {
  /** Human-readable summary */
  message: string
  /** Line number where the error occurred, if available */
  line?: number
  /** Character/column position, if available */
  character?: number
  /** The raw error string before parsing */
  raw: string
}

/** Parse a mermaid error message into structured detail. */
export function parseMermaidError(error: string): MermaidErrorDetail {
  const detail: MermaidErrorDetail = { message: error, raw: error }

  // Mermaid often includes "Parse error on line N" or "Error: ... at line N"
  const lineMatch = /(?:line\s+|line:?\s*)(\d+)/i.exec(error)
  if (lineMatch) {
    detail.line = parseInt(lineMatch[1], 10)
  }

  // Check for character/column info: "character N" or "col N" or "column N"
  const charMatch = /(?:character|col(?:umn)?)\s*:?\s*(\d+)/i.exec(error)
  if (charMatch) {
    detail.character = parseInt(charMatch[1], 10)
  }

  // Clean up the message: strip redundant "Error:" prefix, trim whitespace
  let cleaned = error
    .replace(/^Error:\s*/i, '')
    .replace(/\n+/g, ' ')
    .trim()

  // Truncate overly long messages
  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 197) + '...'
  }

  detail.message = cleaned
  return detail
}

export interface MermaidDiagramHandle {
  /** Returns the raw SVG element for export, or null if not rendered. */
  getSvgElement: () => SVGSVGElement | null
}

interface MermaidDiagramProps {
  chart: string
  className?: string
  /** Called when a user clicks a node. Receives the node's element id. */
  onNodeClick?: (nodeId: string) => void
  /** Called when the user wants to view the raw mermaid source in an error state. */
  onShowRawCode?: () => void
}

export function MermaidDiagram({ chart, className, onNodeClick, onShowRawCode, ref }: MermaidDiagramProps & { ref?: Ref<MermaidDiagramHandle> }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [error, setError] = useState<string | null>(null)
    const [svgContent, setSvgContent] = useState<string>('')
    const renderIdRef = useRef(0)

    // Expose SVG element to parent via ref
    useImperativeHandle(ref, () => ({
      getSvgElement: () => containerRef.current?.querySelector('svg') ?? null,
    }), [])

    useEffect(() => {
      const renderDiagram = async () => {
        if (!containerRef.current || !chart.trim()) {
          setSvgContent('')
          setError(null)
          return
        }
        renderIdRef.current++
        const currentRender = renderIdRef.current

        try {
          setError(null)
          const id = `mermaid_${currentRender}_${Date.now()}`
          const { svg } = await mermaid.render(id, chart)
          // Guard against stale renders
          if (currentRender !== renderIdRef.current) return
          setSvgContent(svg)
        } catch (err) {
          if (currentRender !== renderIdRef.current) return
          console.error('Mermaid render error:', err)
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      }

      // Debounce: wait 300ms after last chart change before attempting render.
      // This prevents flash of error states during streaming when chart prop
      // updates rapidly with incomplete mermaid syntax.
      const timer = setTimeout(renderDiagram, 300)
      return () => clearTimeout(timer)
    }, [chart])

    // Attach click handlers to Mermaid nodes after render
    const attachClickHandlers = useCallback(() => {
      if (!containerRef.current || !onNodeClick) return

      const nodes = containerRef.current.querySelectorAll('.node, .nodeLabel')
      nodes.forEach((node) => {
        const el = node as HTMLElement
        el.style.cursor = 'pointer'

        // Find the node id from the closest .node element
        const nodeEl = el.closest('.node') as HTMLElement | null
        if (!nodeEl) return

        const nodeId = nodeEl.id?.replace(/^flowchart-/, '').replace(/-\d+$/, '') || ''
        if (!nodeId) return

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onNodeClick(nodeId)
        })
      })
    }, [onNodeClick])

    // Re-attach click handlers whenever SVG content changes
    useEffect(() => {
      if (svgContent) {
        // Small delay to ensure DOM is updated after dangerouslySetInnerHTML
        const timer = setTimeout(attachClickHandlers, 50)
        return () => clearTimeout(timer)
      }
    }, [svgContent, attachClickHandlers])

    if (error) {
      const parsed = parseMermaidError(error)

      return (
        <div className={cn('flex flex-col items-center justify-center gap-3 p-8', className)}>
          <div className="flex items-center gap-2 text-status-error">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">Failed to render diagram</p>
          </div>
          <p className="text-xs text-text-muted max-w-md break-words text-center">
            {parsed.message}
          </p>
          {(parsed.line != null || parsed.character != null) && (
            <p className="text-xs text-text-muted font-mono">
              {parsed.line != null && `Line ${parsed.line}`}
              {parsed.line != null && parsed.character != null && ', '}
              {parsed.character != null && `Column ${parsed.character}`}
            </p>
          )}
          {onShowRawCode && (
            <button
              onClick={onShowRawCode}
              className="flex items-center gap-1.5 mt-1 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary bg-foreground/5 hover:bg-foreground/10 rounded transition-colors"
              aria-label="Show raw code"
            >
              <Code className="h-3 w-3" />
              Show raw code
            </button>
          )}
        </div>
      )
    }

    return (
      <div
        ref={containerRef}
        className={cn('flex items-center justify-center mermaid-container', className)}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    )
  }
