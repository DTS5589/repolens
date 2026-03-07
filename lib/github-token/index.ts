const STORAGE_KEY = 'repolens:github-token'

/** Load the GitHub PAT from localStorage. Returns null if nothing stored. */
export function loadGitHubToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Persist a GitHub PAT to localStorage. */
export function saveGitHubToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

/** Remove the GitHub PAT from localStorage. */
export function removeGitHubToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}
