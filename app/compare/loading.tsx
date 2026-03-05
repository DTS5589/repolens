import { Skeleton } from "@/components/ui/skeleton"

export default function CompareLoading() {
  return (
    <div className="flex h-screen w-full flex-col bg-primary-background font-sans text-text-primary">
      {/* Header placeholder */}
      <div className="flex h-14 items-center border-b border-foreground/10 px-4">
        <Skeleton className="h-6 w-32" />
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Back link */}
          <Skeleton className="h-4 w-16" />

          {/* Title */}
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>

          {/* Repo input bar skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>

          {/* Metrics section skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-5 w-20" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-3/4" />
              </div>
            ))}
          </div>

          {/* Dependencies section skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </div>
      </main>
    </div>
  )
}
