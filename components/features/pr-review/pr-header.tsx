"use client"

import Image from "next/image"
import { ArrowLeft, ExternalLink, GitPullRequest, GitMerge, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PRMetadata } from "@/types/pr-review"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PRHeaderProps {
  pr: PRMetadata
  onBack: () => void
}

// ---------------------------------------------------------------------------
// PRHeader
// ---------------------------------------------------------------------------

export function PRHeader({ pr, onBack }: PRHeaderProps) {
  const stateLabel = pr.isDraft ? "Draft" : pr.state
  const stateVariant =
    pr.state === "merged"
      ? "secondary"
      : pr.state === "closed"
        ? "destructive"
        : "default"
  const StateIcon = pr.state === "merged" ? GitMerge : GitPullRequest

  return (
    <div className="shrink-0 border-b px-4 py-3 space-y-2">
      {/* Top row: back button + external link */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1" />
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          Open on GitHub
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Title + number */}
      <div className="flex items-start gap-2">
        <StateIcon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug">
            {pr.title}
            <span className="ml-2 text-muted-foreground font-normal">#{pr.number}</span>
          </h2>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {/* Author */}
        <div className="flex items-center gap-1.5">
          {pr.authorAvatarUrl ? (
            <Image
              src={pr.authorAvatarUrl}
              alt={`${pr.author}'s avatar`}
              width={20}
              height={20}
              className="rounded-full"
              loading="lazy"
            />
          ) : (
            <User className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium">{pr.author}</span>
        </div>

        {/* State badge */}
        <Badge variant={stateVariant} className="capitalize text-xs">
          {stateLabel}
        </Badge>

        {/* Branch info */}
        <span className="text-xs text-muted-foreground font-mono">
          {pr.baseRef} ← {pr.headRef}
        </span>

        {/* Stats */}
        <span className="flex items-center gap-1 text-xs font-mono shrink-0">
          <span className="text-green-600 dark:text-green-400">+{pr.additions}</span>
          <span className="text-red-600 dark:text-red-400">-{pr.deletions}</span>
        </span>

        <span className="text-xs text-muted-foreground">
          {pr.changedFiles} file{pr.changedFiles !== 1 ? "s" : ""} changed
        </span>

        {/* Labels */}
        {pr.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pr.labels.map((label) => (
              <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
