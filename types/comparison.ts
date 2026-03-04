import type { GitHubRepo, FileNode } from "@/types/repository"

export interface RepoMetrics {
  totalFiles: number
  totalLines: number
  primaryLanguage: string | null
  languageBreakdown: Record<string, number>
  stars: number
  forks: number
  openIssues: number
  pushedAt: string | null
  license: string | null
}

export type ComparisonRepoStatus = "loading" | "indexing" | "ready" | "error"

export interface RepoDependencies {
  deps: Record<string, string>
  devDeps: Record<string, string>
  fetchError?: string
}

export interface ComparisonRepo {
  /** Unique key: `owner/name` */
  id: string
  repo: GitHubRepo
  files: FileNode[]
  metrics: RepoMetrics
  status: ComparisonRepoStatus
  error?: string
  dependencies?: RepoDependencies
}

export const MAX_COMPARISON_REPOS = 5
