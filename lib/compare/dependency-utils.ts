interface RepoInput {
  id: string
  deps: Record<string, string>
  devDeps: Record<string, string>
}

export interface SharedDependency {
  name: string
  versions: Record<string, string>
}

export interface DependencyComparison {
  shared: SharedDependency[]
  unique: Record<string, string[]>
}

/**
 * Compare dependencies across repos.
 * Returns shared deps (present in 2+ repos) with their versions,
 * and unique deps per repo.
 */
export function compareDependencies(repos: RepoInput[]): DependencyComparison {
  if (repos.length < 2) {
    return { shared: [], unique: {} }
  }

  // Merge deps + devDeps per repo into one set
  const repoAllDeps = repos.map((repo) => {
    const all: Record<string, string> = { ...repo.deps, ...repo.devDeps }
    return { id: repo.id, all }
  })

  // Count how many repos each package appears in, and collect versions
  const packageRepos = new Map<string, Map<string, string>>()

  for (const { id, all } of repoAllDeps) {
    for (const [pkg, version] of Object.entries(all)) {
      if (!packageRepos.has(pkg)) {
        packageRepos.set(pkg, new Map())
      }
      packageRepos.get(pkg)!.set(id, version)
    }
  }

  const shared: SharedDependency[] = []
  const unique: Record<string, string[]> = {}

  for (const repo of repos) {
    unique[repo.id] = []
  }

  for (const [pkg, repoVersions] of packageRepos) {
    if (repoVersions.size >= 2) {
      shared.push({
        name: pkg,
        versions: Object.fromEntries(repoVersions),
      })
    } else {
      const [repoId] = repoVersions.keys()
      unique[repoId]?.push(pkg)
    }
  }

  // Sort shared by name for stable output
  shared.sort((a, b) => a.name.localeCompare(b.name))
  for (const id of Object.keys(unique)) {
    unique[id].sort()
  }

  return { shared, unique }
}
