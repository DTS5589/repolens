"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FeatureErrorBoundaryProps {
  children: ReactNode
  featureName: string
  fallback?: ReactNode
}

interface FeatureErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Isolates rendering errors to a single feature panel.
 * Wrap each lazy-loaded tab so a crash in one tab doesn't take down
 * the entire application — the global `app/error.tsx` remains the
 * final catch-all for anything above this boundary.
 */
export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  constructor(props: FeatureErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[FeatureErrorBoundary] ${this.props.featureName}`,
      error,
      info,
    )
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback
    }

    const message = this.state.error?.message ?? "An unexpected error occurred."
    const truncatedMessage =
      message.length > 200 ? `${message.slice(0, 200)}…` : message

    return (
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            {this.props.featureName} failed to load
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {truncatedMessage}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={this.handleRetry}
          className="gap-2"
        >
          <RefreshCw className="size-4" />
          Try Again
        </Button>
      </div>
    )
  }
}
