"use client"

import { useEffect } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CompareError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[CompareErrorBoundary]", error)
  }, [error])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-primary-background font-sans text-text-primary">
      <div className="flex flex-col items-center gap-2">
        <span className="text-4xl font-bold text-status-error">Error</span>
        <h1 className="text-xl font-semibold">Comparison failed</h1>
        <p className="max-w-md text-center text-sm text-text-secondary">
          Something went wrong while comparing repositories. This could be due
          to a network issue or an invalid repository URL.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="outline" size="lg">
          Try again
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  )
}
