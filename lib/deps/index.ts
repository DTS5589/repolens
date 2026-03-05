export type { HealthGrade, DownloadPoint, NpmPackageMeta, DependencyHealth, DepsApiRequest, DepsApiResponse } from './types'
export { parseSemver, compareVersions, isOutdated } from './version-checker'
export { calculateHealthScore, computeDependencyHealth, scoreToGrade, calculateDownloadScore, calculateMaintenanceScore, calculateSecurityScore, calculateOutdatedScore } from './health-scorer'
export { fetchDependencyMeta } from './npm-client'
