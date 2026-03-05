export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface DownloadPoint {
  day: string
  downloads: number
}

export interface NpmPackageMeta {
  name: string
  version: string
  description: string
  license?: string
  maintainers: number
  repository?: string
  lastPublish: string
  weeklyDownloads: number
  downloadTrend: DownloadPoint[]
  deprecated: boolean
  homepage?: string
}

export interface DependencyHealth {
  packageName: string
  currentVersion: string
  latestVersion: string
  npmMeta: NpmPackageMeta | null
  isOutdated: boolean
  outdatedType: 'major' | 'minor' | 'patch' | null
  cveCount: number
  score: number
  grade: HealthGrade
  error?: string
}

export interface DepsApiRequest {
  packages: string[]
}

export interface DepsApiResponse {
  results: Record<string, NpmPackageMeta>
  errors: string[]
}
