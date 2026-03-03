"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/layout/header"
import { RepoInputBar } from "@/components/features/compare/repo-input-bar"
import { LoadedReposList } from "@/components/features/compare/loaded-repos-list"
import { ComparisonTable } from "@/components/features/compare/comparison-table"
import { useComparison } from "@/providers/comparison-provider"
import { MAX_COMPARISON_REPOS } from "@/types/comparison"

export default function ComparePage() {
  const searchParams = useSearchParams()
  const { addRepo, repos } = useComparison()

  // Hydrate repos from URL search params on first mount
  useEffect(() => {
    if (repos.size > 0) return // already loaded

    const repoParams = searchParams.getAll("repo")
    if (repoParams.length === 0) return

    const toLoad = repoParams.slice(0, MAX_COMPARISON_REPOS)
    for (const url of toLoad) {
      addRepo(url)
    }
    // Run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-screen w-full flex-col bg-primary-background font-sans text-text-primary">
      <Header />
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
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

          {/* Comparison table */}
          <ComparisonTable />
        </div>
      </main>
    </div>
  )
}
