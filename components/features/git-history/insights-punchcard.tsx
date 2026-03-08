"use client"

import { Fragment, useMemo } from 'react'
import { computePunchcardData } from '@/lib/git-history'
import type { AuthorHoursEstimate } from '@/lib/git-history'

interface InsightsPunchcardProps {
  estimates: AuthorHoursEstimate[]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function InsightsPunchcard({ estimates }: InsightsPunchcardProps) {
  const allSessions = useMemo(
    () => estimates.flatMap((e) => e.sessions),
    [estimates],
  )

  const { grid, maxHours } = useMemo(() => {
    const data = computePunchcardData(allSessions)
    const map = new Map<string, number>()
    let max = 0

    for (const point of data) {
      const key = `${point.dayOfWeek}-${point.hour}`
      map.set(key, (map.get(key) ?? 0) + point.hours)
      const total = map.get(key)!
      if (total > max) max = total
    }

    return { grid: map, maxHours: max }
  }, [allSessions])

  if (maxHours === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border bg-card py-12 text-sm text-muted-foreground">
        No data to show
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Activity Punchcard</h3>
      <div className="overflow-x-auto">
        <div
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: `48px repeat(24, minmax(0, 1fr))`,
            gridTemplateRows: `20px repeat(7, minmax(0, 1fr))`,
          }}
        >
          {/* Header row — hour labels */}
          <div /> {/* top-left corner */}
          {HOURS.map((h) => (
            <div
              key={`h-${h}`}
              className="flex items-center justify-center text-[10px] text-muted-foreground"
            >
              {h % 3 === 0 ? `${h}` : ''}
            </div>
          ))}

          {/* Day rows */}
          {DAY_LABELS.map((day, dayIdx) => (
            <Fragment key={`row-${dayIdx}`}>
              <div
                className="flex items-center text-xs text-muted-foreground pr-2 justify-end"
              >
                {day}
              </div>
              {HOURS.map((hour) => {
                const hours = grid.get(`${dayIdx}-${hour}`) ?? 0
                const intensity = maxHours > 0 ? hours / maxHours : 0

                return (
                  <div
                    key={`${dayIdx}-${hour}`}
                    className="flex items-center justify-center aspect-square"
                    title={`${day} ${hour}:00 — ~${hours.toFixed(1)}h`}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width: `${Math.max(4, intensity * 24)}px`,
                        height: `${Math.max(4, intensity * 24)}px`,
                        backgroundColor:
                          hours > 0
                            ? `hsl(var(--chart-1) / ${0.2 + intensity * 0.8})`
                            : 'hsl(var(--muted) / 0.3)',
                      }}
                    />
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
