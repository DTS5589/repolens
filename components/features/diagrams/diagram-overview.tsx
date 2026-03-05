"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Files, Code2, Search, AlertTriangle, RefreshCw, Target,
} from 'lucide-react'
import { ICON_MAP, LANGUAGE_LABELS } from './diagram-constants'
import type { FullAnalysis } from '@/lib/code/import-parser'
import type { DiagramType, AvailableDiagram, ProjectSummary } from '@/lib/diagrams/types'

// ---------------------------------------------------------------------------
// Card content per diagram type
// ---------------------------------------------------------------------------

const DIAGRAM_QUESTIONS: Record<string, { question: string; getMetric: (summary: ProjectSummary, analysis: FullAnalysis) => string }> = {
  topology: {
    question: 'How is the code structured?',
    getMetric: (s) => `${s.clusterCount} cluster${s.clusterCount !== 1 ? 's' : ''}, ${s.topHubs.length} hub${s.topHubs.length !== 1 ? 's' : ''}`,
  },
  classes: {
    question: "What's the class hierarchy?",
    getMetric: (_s, a) => {
      const count = Array.from(a.files.values()).reduce((sum, f) => sum + f.types.length + f.classes.length, 0)
      return `${count} type${count !== 1 ? 's' : ''}`
    },
  },
  entrypoints: {
    question: 'What are the API endpoints?',
    getMetric: (s) => `${s.entryPoints.length} route${s.entryPoints.length !== 1 ? 's' : ''}`,
  },
  modules: {
    question: 'How do components connect?',
    getMetric: (_s, a) => {
      const count = Array.from(a.files.values()).reduce((sum, f) => sum + f.jsxComponents.length, 0)
      return count > 0 ? `${count} component${count !== 1 ? 's' : ''}` : `${a.topology.hubs.length} module${a.topology.hubs.length !== 1 ? 's' : ''}`
    },
  },
  treemap: {
    question: 'Where is the code mass?',
    getMetric: (s) => `${s.totalFiles} file${s.totalFiles !== 1 ? 's' : ''}`,
  },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiagramOverviewProps {
  analysis: FullAnalysis
  availableDiagrams: AvailableDiagram[]
  onSelectDiagram: (type: DiagramType) => void
  onFocusFile: (filePath: string) => void
  summaryData: ProjectSummary
}

// ---------------------------------------------------------------------------
// DiagramOverview
// ---------------------------------------------------------------------------

export function DiagramOverview({
  analysis,
  availableDiagrams,
  onSelectDiagram,
  onFocusFile,
  summaryData,
}: DiagramOverviewProps) {
  const [focusQuery, setFocusQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const focusInputRef = useRef<HTMLInputElement>(null)

  const focusSuggestions = useMemo(() => {
    if (!focusQuery) return []
    const q = focusQuery.toLowerCase()
    return Array.from(analysis.files.keys())
      .filter(p => p.toLowerCase().includes(q))
      .slice(0, 8)
  }, [focusQuery, analysis])

  const handleFocusSelect = useCallback((path: string) => {
    setFocusQuery('')
    setShowSuggestions(false)
    onFocusFile(path)
  }, [onFocusFile])

  // Close suggestions on outside click
  const suggestionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayLang = LANGUAGE_LABELS[summaryData.primaryLanguage.toLowerCase()] || summaryData.primaryLanguage
  const hasHealth = summaryData.healthIssues.length > 0 || summaryData.circularDeps.length > 0 || summaryData.orphanFiles.length > 0

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground" role="banner" aria-label="Repository stats">
        <span className="flex items-center gap-1.5">
          <Files className="h-3.5 w-3.5" />
          <span className="font-mono text-foreground font-medium">{summaryData.totalFiles.toLocaleString()}</span> files
        </span>
        <span className="flex items-center gap-1.5">
          <Code2 className="h-3.5 w-3.5" />
          <span className="font-mono text-foreground font-medium">{summaryData.totalLines.toLocaleString()}</span> lines
        </span>
        <Badge variant="secondary" className="text-[11px] gap-1">
          {displayLang}
        </Badge>
        {summaryData.frameworkDetected && (
          <Badge variant="secondary" className="text-[11px] gap-1">
            {summaryData.frameworkDetected}
          </Badge>
        )}
      </div>

      {/* Diagram cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {availableDiagrams.filter(d => d.available).map((d) => {
          const meta = DIAGRAM_QUESTIONS[d.id]
          if (!meta) return null
          const Icon = ICON_MAP[d.id]
          if (!Icon) return null
          const metric = meta.getMetric(summaryData, analysis)
          return (
            <Card
              key={d.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${d.label} diagram`}
              className="hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => onSelectDiagram(d.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDiagram(d.id) } }}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-1.5 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <h4 className="text-sm font-medium text-foreground">{d.label}</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{meta.question}</p>
                <p className="text-xs font-medium text-foreground/70 tabular-nums">{metric}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Focus Mode card */}
      <Card className="border-dashed" role="search" aria-label="Focus mode file search">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-amber-500/10 p-1.5">
              <Target className="h-4 w-4 text-amber-500" />
            </div>
            <h4 className="text-sm font-medium text-foreground">Focus Mode</h4>
          </div>
          <p className="text-xs text-muted-foreground">What depends on a specific file?</p>
          <div className="relative" ref={suggestionsRef}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={focusInputRef}
              value={focusQuery}
              onChange={(e) => { setFocusQuery(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search for a file..."
              className="pl-8 h-8 text-xs"
              aria-label="Search for a file to analyze"
            />
            {/* Suggestions dropdown */}
            {showSuggestions && focusQuery && focusSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-foreground/10 rounded-md shadow-lg z-50 overflow-hidden max-h-48 overflow-y-auto">
                {focusSuggestions.map(p => (
                  <button
                    key={p}
                    onClick={() => handleFocusSelect(p)}
                    className="w-full text-left text-xs px-3 py-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground truncate"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Health bar (conditional) */}
      {hasHealth && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2" role="alert" aria-label="Health issues">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          {summaryData.circularDeps.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-1">
              <RefreshCw className="h-2.5 w-2.5" />
              {summaryData.circularDeps.length} circular dep{summaryData.circularDeps.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {summaryData.orphanFiles.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-1">
              <Files className="h-2.5 w-2.5" />
              {summaryData.orphanFiles.length} orphan file{summaryData.orphanFiles.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {summaryData.healthIssues.map((issue, i) => (
            <Badge key={i} variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 dark:text-amber-400">
              {issue}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
