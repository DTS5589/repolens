"use client"

import { useState, useMemo, useCallback, forwardRef } from 'react'
import type { TreemapNode } from '@/lib/diagrams/diagram-data'
import { layoutTreemap } from './treemap-layout'
import { getLangColor } from './diagram-constants'

interface TreemapChartProps {
  data: TreemapNode[]
  width: number
  height: number
  onNodeClick?: (path: string) => void
}

export const TreemapChart = forwardRef<SVGSVGElement, TreemapChartProps>(
  function TreemapChart({ data, width, height, onNodeClick }, ref) {
    const rects = useMemo(() => layoutTreemap(data, 0, 0, width, height), [data, width, height])
    const visibleRects = useMemo(() => rects.filter(r => r.w >= 2 && r.h >= 2), [rects])
    const [hovered, setHovered] = useState<string | null>(null)
    const [focusedIndex, setFocusedIndex] = useState<number>(-1)

    const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault()
          const next = Math.min(index + 1, visibleRects.length - 1)
          setFocusedIndex(next)
          const el = (e.currentTarget.parentElement as SVGGElement | null)
            ?.children[next] as SVGGElement | undefined
          el?.focus()
          break
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault()
          const prev = Math.max(index - 1, 0)
          setFocusedIndex(prev)
          const el = (e.currentTarget.parentElement as SVGGElement | null)
            ?.children[prev] as SVGGElement | undefined
          el?.focus()
          break
        }
        case 'Enter':
        case ' ': {
          e.preventDefault()
          const rect = visibleRects[index]
          if (rect) onNodeClick?.(rect.node.path)
          break
        }
      }
    }, [visibleRects, onNodeClick])

    return (
      <svg
        ref={ref}
        width={width}
        height={height}
        className="select-none"
        role="img"
        aria-label="Codebase file size treemap"
      >
        <g role="list">
          {visibleRects.map(({ node, x, y, w, h }, index) => {
            const color = getLangColor(node.language)
            const isHovered = hovered === node.path
            const isFocused = focusedIndex === index
            const canFitName = w > 40 && h > 16
            const canFitLines = w > 40 && h > 30
            const maxChars = Math.max(3, Math.floor((w - 8) / 6.5))
            const displayName = node.name.length > maxChars ? node.name.slice(0, maxChars - 1) + '\u2026' : node.name
            return (
              <g
                key={node.path}
                role="listitem"
                className="cursor-pointer"
                tabIndex={0}
                aria-label={`${node.name}, ${node.lines.toLocaleString()} lines${node.language ? `, ${node.language}` : ''}`}
                onClick={() => onNodeClick?.(node.path)}
                onMouseEnter={() => setHovered(node.path)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => { if (focusedIndex === index) setFocusedIndex(-1) }}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                <rect
                  x={x + 0.5} y={y + 0.5}
                  width={Math.max(0, w - 1)} height={Math.max(0, h - 1)}
                  fill={color}
                  opacity={isHovered || isFocused ? 1 : 0.8}
                  rx={2}
                  stroke={isHovered || isFocused ? '#fff' : 'rgba(0,0,0,0.4)'}
                  strokeWidth={isHovered || isFocused ? 1.5 : 0.5}
                />
                {/* Focus ring */}
                {isFocused && (
                  <rect
                    x={x + 1.5} y={y + 1.5}
                    width={Math.max(0, w - 3)} height={Math.max(0, h - 3)}
                    fill="none"
                    stroke="hsl(var(--ring))"
                    strokeWidth={2}
                    rx={1}
                    className="pointer-events-none"
                  />
                )}
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
        </g>
      </svg>
    )
  }
)
