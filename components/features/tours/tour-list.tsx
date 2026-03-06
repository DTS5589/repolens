"use client"

import { useState } from "react"
import { Play, Trash2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Tour } from "@/types/tours"

interface TourListProps {
  tours: Tour[]
  onStart: (tour: Tour) => void
  onDelete: (id: string) => void
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function TourList({ tours, onStart, onDelete }: TourListProps) {
  const sorted = [...tours].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-3 p-4">
        {sorted.map((tour) => (
          <TourCard
            key={tour.id}
            tour={tour}
            onStart={() => onStart(tour)}
            onDelete={() => onDelete(tour.id)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

interface TourCardProps {
  tour: Tour
  onStart: () => void
  onDelete: () => void
}

function TourCard({ tour, onStart, onDelete }: TourCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm leading-tight truncate">
              {tour.name}
            </h3>
            {tour.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {tour.description}
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {tour.stops.length} {tour.stops.length === 1 ? "stop" : "stops"} · Updated{" "}
              {formatRelativeTime(tour.updatedAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1.5 text-xs"
          onClick={onStart}
          disabled={tour.stops.length === 0}
        >
          <Play className="h-3 w-3" />
          Start
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete tour?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{tour.name}&rdquo; and all its stops.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
