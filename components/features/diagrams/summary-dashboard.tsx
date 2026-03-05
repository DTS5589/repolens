"use client"

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Files, Code2, Layers, AlertTriangle, RefreshCw, Package,
  GitFork, Network, FolderTree, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import type { ProjectSummary } from '@/lib/diagrams/types'
import { LANGUAGE_COLORS, LANGUAGE_LABELS } from './diagram-constants'

interface SummaryDashboardProps {
  data: ProjectSummary
  className?: string
}

export function SummaryDashboard({ data, className }: SummaryDashboardProps) {
  const topLanguages = useMemo(() => data.languages.slice(0, 8), [data.languages])
  const topFolders = useMemo(() => data.folderBreakdown.slice(0, 8), [data.folderBreakdown])
  const topExternals = useMemo(() => data.externalDeps.slice(0, 10), [data.externalDeps])

  return (
    <div className={cn('overflow-y-auto p-4 space-y-4', className)}>
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Files} label="Files" value={data.totalFiles.toLocaleString()} />
        <StatCard icon={Code2} label="Lines of Code" value={data.totalLines.toLocaleString()} />
        <StatCard icon={Layers} label="Clusters" value={data.clusterCount} />
        <StatCard icon={GitFork} label="Max Depth" value={data.maxDepth} />
      </div>

      {/* Framework + primary language */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1.5 text-xs">
          <Code2 className="h-3 w-3" />
          {data.primaryLanguage}
        </Badge>
        {data.frameworkDetected && (
          <Badge variant="secondary" className="gap-1.5 text-xs">
            <Network className="h-3 w-3" />
            {data.frameworkDetected}
          </Badge>
        )}
        {data.entryPoints.length > 0 && (
          <Badge variant="outline" className="gap-1.5 text-xs">
            {data.entryPoints.length} entry point{data.entryPoints.length !== 1 ? 's' : ''}
          </Badge>
        )}
        {data.connectors.length > 0 && (
          <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
            {data.connectors.length} connector{data.connectors.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Language breakdown */}
      {topLanguages.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground">Language Breakdown</h4>
            {/* Stacked bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label="Language distribution bar">
              {topLanguages.map((lang) => (
                <div
                  key={lang.lang}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${lang.pct}%`,
                    backgroundColor: LANGUAGE_COLORS[lang.lang.toLowerCase()] || '#475569',
                    minWidth: lang.pct > 0 ? 2 : 0,
                  }}
                  title={`${LANGUAGE_LABELS[lang.lang.toLowerCase()] || lang.lang}: ${lang.pct.toFixed(1)}%`}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {topLanguages.map((lang) => (
                <div key={lang.lang} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: LANGUAGE_COLORS[lang.lang.toLowerCase()] || '#475569' }}
                  />
                  <span className="text-muted-foreground">
                    {LANGUAGE_LABELS[lang.lang.toLowerCase()] || lang.lang}
                  </span>
                  <span className="text-foreground font-medium tabular-nums">{lang.pct.toFixed(1)}%</span>
                  <span className="text-muted-foreground/60 tabular-nums">({lang.files})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Folder breakdown */}
      {topFolders.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FolderTree className="h-3.5 w-3.5" /> Folder Breakdown
            </h4>
            <div className="space-y-1.5">
              {topFolders.map((folder) => (
                <div key={folder.folder} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground truncate min-w-0 flex-1">{folder.folder || '/'}</span>
                  <span className="text-foreground font-medium tabular-nums shrink-0">{folder.files} files</span>
                  <div className="w-20 h-1.5 rounded-full bg-foreground/[0.06] shrink-0">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(100, folder.pct)}%` }} />
                  </div>
                  <span className="text-muted-foreground/60 tabular-nums w-10 text-right shrink-0">{folder.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hubs + Consumers side by side */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.topHubs.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ArrowDownRight className="h-3.5 w-3.5" /> Most Imported (Hubs)
              </h4>
              <ul className="space-y-1">
                {data.topHubs.slice(0, 5).map((hub) => (
                  <li key={hub.path} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate min-w-0 mr-2">{hub.path.split('/').pop()}</span>
                    <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">{hub.importerCount} importers</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {data.topConsumers.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5" /> Most Dependencies (Consumers)
              </h4>
              <ul className="space-y-1">
                {data.topConsumers.slice(0, 5).map((consumer) => (
                  <li key={consumer.path} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate min-w-0 mr-2">{consumer.path.split('/').pop()}</span>
                    <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">{consumer.depCount} deps</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* External dependencies */}
      {topExternals.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> External Dependencies
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {topExternals.map((dep) => (
                <Badge key={dep.pkg} variant="outline" className="text-[10px] gap-1 tabular-nums">
                  {dep.pkg}
                  <span className="text-muted-foreground/60">({dep.usedByCount})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health issues + circular deps */}
      {(data.healthIssues.length > 0 || data.circularDeps.length > 0 || data.orphanFiles.length > 0) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Health Issues
            </h4>

            {data.circularDeps.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <RefreshCw className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-foreground font-medium">{data.circularDeps.length}</span>
                <span className="text-muted-foreground">circular dependenc{data.circularDeps.length !== 1 ? 'ies' : 'y'}</span>
              </div>
            )}

            {data.orphanFiles.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <Files className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                <span className="text-foreground font-medium">{data.orphanFiles.length}</span>
                <span className="text-muted-foreground">orphan file{data.orphanFiles.length !== 1 ? 's' : ''} (no imports/exports)</span>
              </div>
            )}

            {data.healthIssues.length > 0 && (
              <ul className="space-y-1">
                {data.healthIssues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{issue}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value }: { icon: typeof Files; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
