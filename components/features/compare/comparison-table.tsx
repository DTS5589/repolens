"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useComparison } from "@/providers/comparison-provider"
import type { ComparisonRepo } from "@/types/comparison"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Format large numbers compactly: 1200 -> "1.2K" */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Build sorted language summary: "TypeScript (54%), JavaScript (32%)" */
function languageSummary(breakdown: Record<string, number>): string {
  const entries = Object.entries(breakdown).filter(([l]) => l !== "other")
  if (entries.length === 0) return "—"

  const total = entries.reduce((s, [, c]) => s + c, 0)
  entries.sort((a, b) => b[1] - a[1])

  return entries
    .slice(0, 3)
    .map(([lang, count]) => {
      const pct = Math.round((count / total) * 100)
      return `${lang} (${pct}%)`
    })
    .join(", ")
}

interface MetricRow {
  label: string
  getValue: (repo: ComparisonRepo) => string
  getNumeric?: (repo: ComparisonRepo) => number
}

/** Check if values have high variance (max > 3× min). */
function hasHighVariance(values: number[]): boolean {
  const filtered = values.filter((v) => v > 0)
  if (filtered.length < 2) return false
  const min = Math.min(...filtered)
  const max = Math.max(...filtered)
  return max > min * 3
}

/** Return true if this value is the highest among peers. */
function isHighest(value: number, all: number[]): boolean {
  return value > 0 && value === Math.max(...all)
}

const METRIC_ROWS: MetricRow[] = [
  {
    label: "Stars",
    getValue: (r) => formatCount(r.metrics.stars),
    getNumeric: (r) => r.metrics.stars,
  },
  {
    label: "Forks",
    getValue: (r) => formatCount(r.metrics.forks),
    getNumeric: (r) => r.metrics.forks,
  },
  {
    label: "Files",
    getValue: (r) => formatCount(r.metrics.totalFiles),
    getNumeric: (r) => r.metrics.totalFiles,
  },
  {
    label: "Lines (est.)",
    getValue: (r) => formatCount(r.metrics.totalLines),
    getNumeric: (r) => r.metrics.totalLines,
  },
  {
    label: "Primary Language",
    getValue: (r) => r.metrics.primaryLanguage ?? "—",
  },
  {
    label: "Languages",
    getValue: (r) => languageSummary(r.metrics.languageBreakdown),
  },
]

export function ComparisonTable() {
  const { getRepoList } = useComparison()
  const repos = getRepoList()

  const readyRepos = repos.filter((r) => r.status === "ready")

  if (repos.length === 0) return null

  if (readyRepos.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-foreground/10 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[140px]">Metric</TableHead>
            {readyRepos.map((r) => (
              <TableHead key={r.id} className="min-w-[120px] text-center">
                {r.id}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {METRIC_ROWS.map((row) => {
            const numericValues = row.getNumeric
              ? readyRepos.map((r) => row.getNumeric!(r))
              : []
            const showHighlight =
              row.getNumeric && hasHighVariance(numericValues)

            return (
              <TableRow key={row.label}>
                <TableCell className="font-medium text-text-secondary">
                  {row.label}
                </TableCell>
                {readyRepos.map((r, i) => {
                  const highlight =
                    showHighlight && isHighest(numericValues[i], numericValues)

                  return (
                    <TableCell
                      key={r.id}
                      className={cn(
                        "text-center",
                        highlight && "font-semibold text-text-primary"
                      )}
                    >
                      {row.getValue(r)}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
