"use client"

import { useState, useMemo, useRef, useCallback, useEffect, useTransition, lazy, Suspense } from 'react'
import type { MermaidDiagramHandle } from './mermaid-diagram'
import { MermaidDiagramSkeleton } from '@/components/features/loading/tab-skeleton'
import {
  generateDiagram,
  getAvailableDiagrams,
  type DiagramType,
  type AnyDiagramResult,
  type TreemapDiagramResult,
  type SummaryDiagramResult,
  type AvailableDiagram,
} from '@/lib/diagrams/diagram-data'
import type { CodeIndex } from '@/lib/code/code-index'
import { useRepository } from '@/providers'
import { Network, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/types/repository'
import { TreemapChart } from './treemap-chart'
import { SummaryDashboard } from './summary-dashboard'
import { StatsBar } from './stats-bar'
import { DiagramFloatingControls } from './diagram-floating-controls'
import { DiagramToolbar } from './diagram-toolbar'
import { exportSvg, exportPng } from './diagram-export'

// Lazy-load MermaidDiagram — it pulls in ~2.7 MB of Mermaid.js
const MermaidDiagram = lazy(() =>
  import('./mermaid-diagram').then(m => ({ default: m.MermaidDiagram }))
)

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiagramViewerProps {
  files: FileNode[]
  codeIndex: CodeIndex
  className?: string
  onNavigateToFile?: (path: string) => void
}

// ---------------------------------------------------------------------------
// Main DiagramViewer
// ---------------------------------------------------------------------------

export function DiagramViewer({ files, codeIndex, className, onNavigateToFile }: DiagramViewerProps) {
  const [selectedType, setSelectedType] = useState<DiagramType>('topology')
  const { codebaseAnalysis: analysis } = useRepository()
  const mermaidRef = useRef<MermaidDiagramHandle>(null)
  const treemapRef = useRef<SVGSVGElement>(null)
  const [isPending, startTransition] = useTransition()

  // Focus mode
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusQuery, setFocusQuery] = useState('')
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const [focusHops, setFocusHops] = useState<1 | 2>(1)

  // Pan + zoom
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 500 })

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Dynamic available tabs
  const availableDiagrams = useMemo<AvailableDiagram[]>(() => {
    if (!analysis) return [{ id: 'topology' as DiagramType, label: 'Architecture', available: true }]
    return getAvailableDiagrams(analysis)
  }, [analysis])

  // Focus mode file search
  const focusSuggestions = useMemo(() => {
    if (!focusQuery || !analysis) return []
    const q = focusQuery.toLowerCase()
    return Array.from(analysis.files.keys())
      .filter(p => p.toLowerCase().includes(q))
      .slice(0, 8)
  }, [focusQuery, analysis])

  // Generate diagram
  const activeDiagramType = focusTarget ? 'focus' as DiagramType : selectedType
  const diagram = useMemo((): AnyDiagramResult | null => {
    if (!files || files.length === 0 || codeIndex.totalFiles === 0) return null
    if (!analysis && activeDiagramType !== 'treemap') return null
    try {
      return generateDiagram(activeDiagramType, codeIndex, files, analysis || undefined, focusTarget || undefined, focusHops)
    } catch (err) {
      console.error(`Diagram generation failed for type "${activeDiagramType}":`, err)
      return null
    }
  }, [files, codeIndex, activeDiagramType, analysis, focusTarget, focusHops])

  // Reset pan/zoom on change
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [selectedType, focusTarget])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.2, Math.min(4, z + (e.deltaY > 0 ? -0.08 : 0.08))))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 2) return // right-click only for panning
    e.preventDefault()
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }, [pan])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault() // suppress context menu on diagram area
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    setPan({ x: panStart.current.panX + e.clientX - panStart.current.x, y: panStart.current.panY + e.clientY - panStart.current.y })
  }, [])

  const handleMouseUp = useCallback(() => { isPanning.current = false }, [])
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

  const handleExportSvg = useCallback(() => {
    const svgEl = activeDiagramType === 'treemap'
      ? treemapRef.current
      : mermaidRef.current?.getSvgElement()
    if (svgEl) exportSvg(svgEl, activeDiagramType)
  }, [activeDiagramType])

  const handleExportPng = useCallback(() => {
    const svgEl = activeDiagramType === 'treemap'
      ? treemapRef.current
      : mermaidRef.current?.getSvgElement()
    if (svgEl) exportPng(svgEl, activeDiagramType)
  }, [activeDiagramType])

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!diagram || diagram.type === 'treemap' || diagram.type === 'summary') return
    const pathMap = (diagram as { nodePathMap: Map<string, string> }).nodePathMap
    const filePath = pathMap.get(nodeId)
    if (filePath && onNavigateToFile) onNavigateToFile(filePath)
  }, [diagram, onNavigateToFile])

  const handleTreemapClick = useCallback((path: string) => { onNavigateToFile?.(path) }, [onNavigateToFile])

  const handleFocusSelect = useCallback((path: string) => {
    startTransition(() => { setFocusTarget(path) })
    setFocusQuery(path.split('/').pop() || path)
  }, [startTransition])

  const clearFocus = useCallback(() => {
    setFocusTarget(null)
    setFocusQuery('')
    setFocusOpen(false)
  }, [])

  if (!files || files.length === 0) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="flex flex-col items-center gap-4 text-text-muted animate-in fade-in duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/[0.04] border border-foreground/[0.06]">
            <Network className="h-6 w-6 text-text-secondary" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium text-text-secondary">No repository connected</p>
            <p className="text-xs text-center max-w-[260px]">Connect a GitHub repository to generate architecture, dependency, and topology diagrams</p>
          </div>
        </div>
      </div>
    )
  }

  const isTreemap = activeDiagramType === 'treemap'
  const isSummary = activeDiagramType === 'summary'
  const isMermaid = !isTreemap && !isSummary && diagram && diagram.type !== 'treemap' && diagram.type !== 'summary'
  const canExport = !!isMermaid || isTreemap

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Toolbar: diagram tabs + export */}
      <DiagramToolbar
        availableDiagrams={availableDiagrams}
        selectedType={selectedType}
        onSelectType={(type) => { startTransition(() => { setSelectedType(type) }); setFocusTarget(null); setFocusQuery('') }}
        focusTarget={focusTarget}
        onClearFocus={clearFocus}
        canExport={canExport}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
      />

      {/* Title bar */}
      {diagram && (
        <div className="px-4 py-1.5 border-b border-foreground/[0.06] bg-background">
          <h3 className="text-xs font-medium text-text-secondary">{diagram.title}</h3>
        </div>
      )}

      {/* Content */}
      {!analysis && codeIndex.totalFiles > 0 && !diagram ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
            <p className="text-sm text-text-muted">Analyzing codebase...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          {/* Pannable / zoomable diagram area */}
          {/* Pending overlay for transitions */}
          {isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px] transition-opacity">
              <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />
            </div>
          )}
          {isSummary && diagram?.type === 'summary' ? (
            <div ref={containerRef} className={cn('w-full h-full overflow-auto', isPending && 'opacity-60 transition-opacity')}>
              <SummaryDashboard data={(diagram as SummaryDiagramResult).data} className="h-full" />
            </div>
          ) : (
            <div
              ref={containerRef}
              className={cn('w-full h-full overflow-hidden', isPending && 'opacity-60 transition-opacity')}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onContextMenu={handleContextMenu}
            >
              <div className="w-full h-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}>
                {diagram ? (
                  isTreemap && diagram.type === 'treemap' ? (
                    <TreemapChart ref={treemapRef} data={(diagram as TreemapDiagramResult).data} width={containerSize.width} height={containerSize.height} onNodeClick={handleTreemapClick} />
                  ) : diagram.type !== 'treemap' && diagram.type !== 'summary' ? (
                    <Suspense fallback={<MermaidDiagramSkeleton />}>
                      <MermaidDiagram ref={mermaidRef} chart={diagram.chart} className="min-h-[400px] p-4" onNodeClick={handleNodeClick} />
                    </Suspense>
                  ) : null
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
                      <Network className="h-8 w-8 text-text-muted" />
                      <p className="text-sm text-text-muted">No diagram data available for this view</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Floating controls -- bottom-right corner */}
          <DiagramFloatingControls
            analysis={analysis}
            focusOpen={focusOpen}
            setFocusOpen={setFocusOpen}
            focusQuery={focusQuery}
            setFocusQuery={setFocusQuery}
            focusTarget={focusTarget}
            setFocusTarget={setFocusTarget}
            focusHops={focusHops}
            setFocusHops={setFocusHops}
            focusSuggestions={focusSuggestions}
            onFocusSelect={handleFocusSelect}
            onClearFocus={clearFocus}
            zoom={zoom}
            setZoom={setZoom}
            onResetView={resetView}
          />
        </div>
      )}

      {/* Stats bar */}
      {diagram && diagram.stats && (
        <StatsBar
          stats={diagram.stats}
          topology={analysis ? {
            clusters: analysis.topology.clusters.length,
            maxDepth: analysis.topology.maxDepth,
            orphans: analysis.topology.orphans.length,
            connectors: analysis.topology.connectors.length,
          } : undefined}
        />
      )}
    </div>
  )
}
