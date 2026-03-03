/**
 * Shareable URL — encode/decode repo and view state in URL search params.
 */

type ViewId = 'repo' | 'issues' | 'docs' | 'diagram' | 'code'

interface ShareableState {
  /** GitHub repository URL (e.g. "https://github.com/owner/repo") */
  repoUrl: string
  /** Active tab ID */
  view?: ViewId
}

/**
 * Build a full shareable URL that encodes the current repo and view state.
 *
 * Example output: `https://app.example.com/?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo&view=diagram`
 */
export function buildShareableUrl(state: ShareableState): string {
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('repo', state.repoUrl)
  if (state.view && state.view !== 'repo') {
    url.searchParams.set('view', state.view)
  }
  return url.toString()
}

/**
 * Parse shareable state from the current URL search params.
 * Returns `null` if no repo param is present.
 */
export function parseShareableUrl(search: string = window.location.search): ShareableState | null {
  const params = new URLSearchParams(search)
  const repoUrl = params.get('repo')
  if (!repoUrl) return null

  const view = params.get('view') as ViewId | null

  return {
    repoUrl,
    view: view ?? undefined,
  }
}

/**
 * Update the browser URL bar without triggering navigation.
 * Uses `replaceState` to avoid cluttering history.
 */
export function updateUrlState(state: ShareableState): void {
  const url = buildShareableUrl(state)
  window.history.replaceState(null, '', url)
}

/**
 * Clear shareable params from the URL.
 */
export function clearUrlState(): void {
  const url = new URL(window.location.origin + window.location.pathname)
  window.history.replaceState(null, '', url.toString())
}
