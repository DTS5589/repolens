"use client"

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, Users, Calendar, Timer } from 'lucide-react'
import type { AuthorHoursEstimate } from '@/lib/git-history'

interface InsightsPulseCardsProps {
  estimates: AuthorHoursEstimate[]
  className?: string
}

export function InsightsPulseCards({ estimates, className }: InsightsPulseCardsProps) {
  const stats = useMemo(() => {
    const totalHours = estimates.reduce((sum, e) => sum + e.totalHours, 0)
    const contributors = estimates.length
    const maxActiveDays = Math.max(...estimates.map(e => e.activeDays), 0)
    const allSessions = estimates.flatMap(e => e.sessions)
    const avgSessionMinutes =
      allSessions.length > 0
        ? allSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / allSessions.length
        : 0

    return { totalHours, contributors, maxActiveDays, avgSessionMinutes }
  }, [estimates])

  const cards = [
    {
      label: 'Total Hours',
      value: `~${stats.totalHours.toFixed(1)}h`,
      icon: Clock,
      color: 'text-primary bg-primary/10',
    },
    {
      label: 'Contributors',
      value: String(stats.contributors),
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    },
    {
      label: 'Active Days',
      value: String(stats.maxActiveDays),
      icon: Calendar,
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    },
    {
      label: 'Avg Session',
      value: `~${Math.round(stats.avgSessionMinutes)}m`,
      icon: Timer,
      color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10',
    },
  ]

  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={cn('rounded-md p-2', card.color)}>
              <card.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-xl font-bold tabular-nums">{card.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
