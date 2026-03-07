"use client"

import { useEffect, useRef, useState, useCallback, Suspense, lazy } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Link2, Check, BarChart3, Package } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RepoInputBar } from "@/components/features/compare/repo-input-bar"
import { LoadedReposList } from "@/components/features/compare/loaded-repos-list"
import { useComparison } from "@/providers/comparison-provider"
import { MAX_COMPARISON_REPOS } from "@/types/comparison"

const ComparisonTable = lazy(() =>
  import("@/components/features/compare/comparison-table").then((m) => ({
    default: m.ComparisonTable,
  }))
)

const DependencyOverlap = lazy(() =>
  import("@/components/features/compare/dependency-overlap").then((m) => ({
    default: m.DependencyOverlap,
  }))
)

export default function ComparePage() {
  const searchParams = useSearchParams()
  const { addRepo, repos, getRepoList } = useComparison()
  const [isCopied, setIsCopied] = useState(false)

  // Hydrate repos from URL search params on first mount
  const hasHydrated = useRef(false)
  useEffect(() => {
    if (hasHydrated.current) return
    hasHydrated.current = true

    const repoParams = searchParams.getAll("repo")
    if (repoParams.length === 0) return

    const toLoad = repoParams.slice(0, MAX_COMPARISON_REPOS)
    for (const url of toLoad) {
      addRepo(url)
    }
  }, [repos, searchParams, addRepo])

  // Sync URL bar when repos change (without full navigation)
  useEffect(() => {
    const repoList = getRepoList()
    const ids = repoList.map((r) => r.id)

    const params = new URLSearchParams()
    for (const id of ids) {
      params.append("repo", id)
    }

    const search = params.toString()
    const newUrl = search
      ? `${window.location.pathname}?${search}`
      : window.location.pathname

    window.history.replaceState(null, "", newUrl)
  }, [repos, getRepoList])

  const copyShareableUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      // Fallback: select-copy pattern
    }
  }, [])

  const repoList = getRepoList()
  const hasReadyRepos = repoList.some((r) => r.status === "ready")

  return (
    <div className="flex h-screen w-full flex-col bg-primary-background font-sans text-text-primary">
      <Header />
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            {repoList.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={copyShareableUrl}
                className="gap-1.5"
              >
                {isCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {isCopied ? "Copied!" : "Copy Link"}
              </Button>
            )}
          </div>

          <div>
            <h1 className="text-xl font-semibold">Compare Repositories</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Add up to {MAX_COMPARISON_REPOS} GitHub repositories and compare
              them side by side.
            </p>
          </div>

          {/* Repo input */}
          <RepoInputBar />

          {/* Loaded repos chips */}
          <LoadedReposList />

          {/* Metrics section */}
          {hasReadyRepos && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-text-secondary" />
                <h2 className="text-base font-semibold">Metrics</h2>
              </div>
              <Suspense
                fallback={
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-2 w-full" />
                        <Skeleton className="h-2 w-3/4" />
                      </div>
                    ))}
                  </div>
                }
              >
                <ComparisonTable />
              </Suspense>
            </section>
          )}

          {/* Dependencies section */}
          {hasReadyRepos && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-text-secondary" />
                <h2 className="text-base font-semibold">Dependencies</h2>
              </div>
              <Suspense
                fallback={
                  <Skeleton className="h-48 w-full rounded-lg" />
                }
              >
                <DependencyOverlap />
              </Suspense>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
