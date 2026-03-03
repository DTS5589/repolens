import type { GitHubRepo, FileNode } from "@/types/repository"

export interface RepoMetrics {
  totalFiles: number
  totalLines: number
  primaryLanguage: string | null
  languageBreakdown: Record<string, number>
  stars: number
  forks: number
}

export type ComparisonRepoStatus = "loading" | "indexing" | "ready" | "error"

export interface ComparisonRepo {
  /** Unique key: `owner/name` */
  id: string
  repo: GitHubRepo
  files: FileNode[]
  metrics: RepoMetrics
  status: ComparisonRepoStatus
  error?: string
}

export const MAX_COMPARISON_REPOS = 5
