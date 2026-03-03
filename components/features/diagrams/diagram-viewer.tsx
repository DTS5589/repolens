"use client"

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MermaidDiagram, type MermaidDiagramHandle } from './mermaid-diagram'
import {
  generateDiagram,
  getAvailableDiagrams,
  type DiagramType,
  type AnyDiagramResult,
  type TreemapDiagramResult,
  type TreemapNode,
  type DiagramStats,
  type AvailableDiagram,
} from '@/lib/diagrams/diagram-data'
import type { FullAnalysis } from '@/lib/code/import-parser'
import type { CodeIndex } from '@/lib/code/code-index'
import { useRepository } from '@/providers'
import {
  Download, Network, GitBranch, Boxes, ZoomIn, ZoomOut, RotateCcw,
  Route, Component, SquareStack, Package, AlertTriangle, ArrowRight,
  Loader2, Search, X, Target,
  Layers, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/types/repository'

// ---------------------------------------------------------------------------
// Language colors for treemap
// ---------------------------------------------------------------------------

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6', tsx: '#3178c6',
  javascript: '#f7df1e', jsx: '#f7df1e',
  css: '#264de4', scss: '#cf649a', html: '#e34c26',
  json: '#292929', markdown: '#083fa1',
  python: '#3776ab', rust: '#dea584', go: '#00add8',
  yaml: '#cb171e', toml: '#9c4121', sql: '#e38c00',
  graphql: '#e535ab', prisma: '#2d3748',
  csharp: '#68217a', java: '#b07219', kotlin: '#A97BFF',
  ruby: '#CC342D', php: '#4F5D95', swift: '#FA7343', dart: '#00B4AB',
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript',
  python: 'Python', go: 'Go', rust: 'Rust', php: 'PHP',
  ruby: 'Ruby', java: 'Java', kotlin: 'Kotlin',
  csharp: 'C#', swift: 'Swift', dart: 'Dart',
  css: 'CSS', html: 'HTML', json: 'JSON', yaml: 'YAML',
  unknown: 'Other',
}

function getLangColor(lang?: string): string {
  if (!lang) return '#475569'
  return LANGUAGE_COLORS[lang.toLowerCase()] || '#475569'
}

// ---------------------------------------------------------------------------
// Icon map for diagram types
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, typeof Network> = {
  topology: Boxes,
  imports: GitBranch,
  classes: SquareStack,
  entrypoints: Route,
  modules: Component,
  treemap: Layers,
  externals: Package,
}

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
// Treemap Chart
// ---------------------------------------------------------------------------

type TreemapRect = { node: TreemapNode; x: number; y: number; w: number; h: number }

/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk 2000).
 *
 * Key insight: the algorithm works with **values** (line counts), not
 * pre-computed pixel areas.  At each step it scales values into the
 * *current* remaining rectangle so the entire container is always filled.
 */
function layoutTreemap(
  nodes: TreemapNode[], x: number, y: number, w: number, h: number,
): TreemapRect[] {
  // Flatten to leaf files
  const leaves: TreemapNode[] = []
  const flatten = (ns: TreemapNode[]) => {
    for (const n of ns) {
      if (n.children && n.children.length > 0) flatten(n.children)
      else if (n.lines > 0) leaves.push(n)
    }
  }
  flatten(nodes)
  leaves.sort((a, b) => b.lines - a.lines)
  if (leaves.length === 0) return []

  const values = leaves.map(n => n.lines)
  return squarify(leaves, values, x, y, w, h)
}

function squarify(
  nodes: TreemapNode[], values: number[], x: number, y: number, w: number, h: number,
): TreemapRect[] {
  if (nodes.length === 0 || w < 1 || h < 1) return []
  if (nodes.length === 1) return [{ node: nodes[0], x, y, w, h }]

  const totalVal = values.reduce((a, b) => a + b, 0)
  if (totalVal <= 0) return []

  const rects: TreemapRect[] = []
  let cx = x, cy = y, cw = w, ch = h
  let remaining = totalVal
  let i = 0

  while (i < nodes.length) {
    const shortSide = Math.min(cw, ch)
    if (shortSide < 1) break

    // Build a row greedily: keep adding nodes while worst-aspect improves
    const row: number[] = [] // indices into nodes/values
    let rowValSum = 0

    // Scale factor: how many px^2 per unit of value in current rect
    const scale = (cw * ch) / remaining

    row.push(i)
    rowValSum = values[i]

    while (i + row.length < nodes.length) {
      const ni = i + row.length
      const testSum = rowValSum + values[ni]
      if (worstRatio(row.map(r => values[r] * scale), rowValSum * scale, shortSide) >=
          worstRatio([...row.map(r => values[r] * scale), values[ni] * scale], testSum * scale, shortSide)) {
        row.push(ni)
        rowValSum = testSum
      } else {
        break
      }
    }

    // Lay out this row
    const rowArea = rowValSum * scale
    const thickness = rowArea / shortSide
    // When landscape (cw >= ch), shortSide=ch, nodes span the height → vertical column
    // When portrait  (ch > cw),  shortSide=cw, nodes span the width  → horizontal row
    const isHoriz = ch > cw

    let offset = 0
    for (const ri of row) {
      const nodeArea = values[ri] * scale
      const nodeLen = nodeArea / thickness
      if (isHoriz) {
        rects.push({ node: nodes[ri], x: cx + offset, y: cy, w: nodeLen, h: thickness })
      } else {
        rects.push({ node: nodes[ri], x: cx, y: cy + offset, w: thickness, h: nodeLen })
      }
      offset += nodeLen
    }

    // Shrink remaining rectangle
    if (isHoriz) {
      cy += thickness
      ch -= thickness
    } else {
      cx += thickness
      cw -= thickness
    }
    remaining -= rowValSum
    i += row.length
  }

  return rects
}

/** Worst (max) aspect ratio among rectangles in a row. Lower = better. */
function worstRatio(areas: number[], totalArea: number, shortSide: number): number {
  if (areas.length === 0 || totalArea <= 0 || shortSide <= 0) return Infinity
  const thickness = totalArea / shortSide
  let worst = 0
  for (const a of areas) {
    const len = a / thickness
    if (len <= 0) continue
    const r = Math.max(thickness / len, len / thickness)
    if (r > worst) worst = r
  }
  return worst
}

function TreemapChart({ data, width, height, onNodeClick }: { data: TreemapNode[]; width: number; height: number; onNodeClick?: (path: string) => void }) {
  const rects = useMemo(() => layoutTreemap(data, 0, 0, width, height), [data, width, height])
  const [hovered, setHovered] = useState<string | null>(null)
  return (
    <svg width={width} height={height} className="select-none">
      {rects.map(({ node, x, y, w, h }) => {
        if (w < 2 || h < 2) return null
        const color = getLangColor(node.language)
        const isHovered = hovered === node.path
        // Show filename if rect is wide enough, show lines if tall enough
        const canFitName = w > 40 && h > 16
        const canFitLines = w > 40 && h > 30
        const maxChars = Math.max(3, Math.floor((w - 8) / 6.5))
        const displayName = node.name.length > maxChars ? node.name.slice(0, maxChars - 1) + '\u2026' : node.name
        return (
          <g key={node.path} className="cursor-pointer" onClick={() => onNodeClick?.(node.path)} onMouseEnter={() => setHovered(node.path)} onMouseLeave={() => setHovered(null)}>
            <rect
              x={x + 0.5} y={y + 0.5}
              width={Math.max(0, w - 1)} height={Math.max(0, h - 1)}
              fill={color}
              opacity={isHovered ? 1 : 0.8}
              rx={2}
              stroke={isHovered ? '#fff' : 'rgba(0,0,0,0.4)'}
              strokeWidth={isHovered ? 1.5 : 0.5}
            />
            {canFitName && (
              <text x={x + 4} y={y + 13} fill="#fff" fontSize={10} fontWeight={500} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }} className="pointer-events-none">
                {displayName}
              </text>
            )}
            {canFitLines && (
              <text x={x + 4} y={y + 25} fill="rgba(255,255,255,0.65)" fontSize={9} className="pointer-events-none">
                {node.lines.toLocaleString()} lines
              </text>
            )}
            <title>{`${node.path}\n${node.lines.toLocaleString()} lines${node.language ? `\n${node.language}` : ''}`}</title>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Stats Bar (enhanced)
// ---------------------------------------------------------------------------

function StatsBar({ stats, topology }: { stats: DiagramStats; topology?: { clusters: number; maxDepth: number; orphans: number; connectors: number } }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t border-foreground/[0.06] text-xs text-text-muted bg-card">
      <span><span className="text-text-secondary font-medium">{stats.totalNodes}</span> nodes</span>
      {stats.totalEdges > 0 && <span><span className="text-text-secondary font-medium">{stats.totalEdges}</span> edges</span>}
      {stats.avgDepsPerFile !== undefined && <span><span className="text-text-secondary font-medium">{stats.avgDepsPerFile}</span> avg deps/file</span>}
      {stats.circularDeps && stats.circularDeps.length > 0 && (
        <span className="flex items-center gap-1 text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          <span className="font-medium">{stats.circularDeps.length}</span> circular
        </span>
      )}
      {topology && (
        <>
          <span className="border-l border-foreground/[0.06] pl-4"><span className="text-text-secondary font-medium">{topology.clusters}</span> clusters</span>
          <span>depth <span className="text-text-secondary font-medium">{topology.maxDepth}</span></span>
          {topology.orphans > 0 && <span className="text-gray-500">{topology.orphans} orphans</span>}
          {topology.connectors > 0 && <span className="text-purple-400">{topology.connectors} connectors</span>}
        </>
      )}
      {stats.mostImported && (
        <span className="flex items-center gap-1 ml-auto">
          <ArrowRight className="h-3 w-3" />
          Most imported: <span className="text-text-secondary font-medium">{stats.mostImported.path.split('/').pop()}</span> ({stats.mostImported.count})
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DiagramViewer
// ---------------------------------------------------------------------------

export function DiagramViewer({ files, codeIndex, className, onNavigateToFile }: DiagramViewerProps) {
  const [selectedType, setSelectedType] = useState<DiagramType>('topology')
  const { codebaseAnalysis: analysis } = useRepository()
  const mermaidRef = useRef<MermaidDiagramHandle>(null)

  // Focus mode
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusQuery, setFocusQuery] = useState('')
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const [focusHops, setFocusHops] = useState<1 | 2>(1)
  const focusInputRef = useRef<HTMLInputElement>(null)

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
    const svgEl = mermaidRef.current?.getSvgElement()
    if (!svgEl) return
    const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${selectedType}-diagram.svg`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }, [selectedType])

  const handleExportPng = useCallback(() => {
    const svgEl = mermaidRef.current?.getSvgElement()
    if (!svgEl) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      canvas.width = img.width * 2; canvas.height = img.height * 2
      ctx.scale(2, 2); ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${selectedType}-diagram.png`
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      })
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svgEl))))
  }, [selectedType])

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!diagram || diagram.type === 'treemap' || diagram.type === 'summary') return
    const pathMap = (diagram as { nodePathMap: Map<string, string> }).nodePathMap
    const filePath = pathMap.get(nodeId)
    if (filePath && onNavigateToFile) onNavigateToFile(filePath)
  }, [diagram, onNavigateToFile])

  const handleTreemapClick = useCallback((path: string) => { onNavigateToFile?.(path) }, [onNavigateToFile])

  const handleFocusSelect = useCallback((path: string) => {
    setFocusTarget(path)
    setFocusQuery(path.split('/').pop() || path)
  }, [])

  const clearFocus = useCallback(() => {
    setFocusTarget(null)
    setFocusQuery('')
    setFocusOpen(false)
  }, [])

  // Auto-focus the input when focus search opens
  useEffect(() => {
    if (focusOpen) setTimeout(() => focusInputRef.current?.focus(), 50)
  }, [focusOpen])

  if (!files || files.length === 0) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center text-text-secondary">
          <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Connect a repository to generate diagrams</p>
        </div>
      </div>
    )
  }

  const isTreemap = activeDiagramType === 'treemap'
  const isMermaid = !isTreemap && diagram && diagram.type !== 'treemap' && diagram.type !== 'summary'

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Toolbar: diagram tabs + focus search */}
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-3 py-1.5 bg-card">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {availableDiagrams.filter(d => d.available).map((d) => {
            const Icon = ICON_MAP[d.id] || Network
            const isActive = selectedType === d.id && !focusTarget
            return (
              <Button
                key={d.id}
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedType(d.id); setFocusTarget(null); setFocusQuery('') }}
                className={cn(
                  'gap-1.5 h-7 text-xs shrink-0',
                  isActive ? 'bg-foreground/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {d.label}
              </Button>
            )
          })}

          {/* Focus mode indicator */}
          {focusTarget && (
            <div className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              <Target className="h-3 w-3 text-amber-400" />
              <span className="text-xs text-amber-400 font-medium">Focus: {focusTarget.split('/').pop()}</span>
              <button onClick={clearFocus} className="ml-1 hover:text-amber-300">
                <X className="h-3 w-3 text-amber-500" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {/* Export dropdown */}
          {isMermaid && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-text-secondary hover:text-text-primary">
                  <Download className="h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem onClick={handleExportSvg} className="text-xs gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Export as SVG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPng} className="text-xs gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Export as PNG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

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
          <div
            ref={containerRef}
            className="w-full h-full overflow-hidden"
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
                  <TreemapChart data={(diagram as TreemapDiagramResult).data} width={containerSize.width} height={containerSize.height} onNodeClick={handleTreemapClick} />
                ) : diagram.type !== 'treemap' && diagram.type !== 'summary' ? (
                  <MermaidDiagram ref={mermaidRef} chart={diagram.chart} className="min-h-[400px] p-4" onNodeClick={handleNodeClick} />
                ) : null
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-text-muted">No diagram data available</p>
                </div>
              )}
            </div>
          </div>

          {/* Floating controls -- bottom-right corner */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {/* Focus on file search */}
            {analysis && (
              <div className="relative">
                <div className="flex items-center gap-0.5 rounded-lg border border-foreground/10 bg-card/90 backdrop-blur-sm shadow-lg">
                  {!focusOpen && !focusTarget ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-text-secondary hover:text-text-primary"
                      onClick={() => setFocusOpen(true)}
                      title="Focus on file"
                    >
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <div className="flex items-center px-1">
                      <Search className="h-3.5 w-3.5 text-text-muted shrink-0 ml-1" />
                      <Input
                        ref={focusInputRef}
                        value={focusQuery}
                        onChange={(e) => { setFocusQuery(e.target.value); if (!e.target.value) setFocusTarget(null) }}
                        onBlur={() => { if (!focusQuery && !focusTarget) setTimeout(() => setFocusOpen(false), 150) }}
                        placeholder="Focus on file..."
                        className="h-7 w-36 border-0 bg-transparent text-xs focus-visible:ring-0 px-1.5"
                      />
                      {focusTarget && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => setFocusHops(1)}
                            className={cn('text-[10px] px-1.5 py-0.5 rounded', focusHops === 1 ? 'bg-amber-500/20 text-amber-400' : 'text-text-muted hover:text-text-secondary')}
                          >
                            1-hop
                          </button>
                          <button
                            onClick={() => setFocusHops(2)}
                            className={cn('text-[10px] px-1.5 py-0.5 rounded', focusHops === 2 ? 'bg-amber-500/20 text-amber-400' : 'text-text-muted hover:text-text-secondary')}
                          >
                            2-hop
                          </button>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-text-muted hover:text-text-secondary"
                        onClick={() => { setFocusOpen(false); setFocusQuery(''); setFocusTarget(null) }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                {/* Suggestions dropdown -- opens upward */}
                {focusOpen && focusQuery && !focusTarget && focusSuggestions.length > 0 && (
                  <div className="absolute bottom-full right-0 mb-1 w-64 bg-popover border border-foreground/10 rounded-md shadow-lg z-50 overflow-hidden">
                    {focusSuggestions.map(p => (
                      <button
                        key={p}
                        onClick={() => handleFocusSelect(p)}
                        className="w-full text-left text-xs px-3 py-1.5 text-text-secondary hover:bg-foreground/5 hover:text-text-primary truncate"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Zoom controls */}
            <div className="flex items-center gap-0.5 rounded-lg border border-foreground/10 bg-card/90 backdrop-blur-sm shadow-lg">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-text-primary" onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <button onClick={resetView} className="text-xs text-text-muted hover:text-text-primary w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-text-primary" onClick={() => setZoom(z => Math.min(4, z + 0.15))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-4 bg-foreground/10" />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-text-secondary hover:text-text-primary" onClick={resetView} title="Reset view">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
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
