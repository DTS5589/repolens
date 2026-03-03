import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildShareableUrl, parseShareableUrl } from './shareable-url'

// ---------------------------------------------------------------------------
// jsdom provides a window/location object; we control it via URL assignment.
// ---------------------------------------------------------------------------

describe('buildShareableUrl', () => {
  it('encodes the repo URL as a search param', () => {
    const url = buildShareableUrl({
      repoUrl: 'https://github.com/owner/repo',
    })

    const parsed = new URL(url)
    expect(parsed.searchParams.get('repo')).toBe('https://github.com/owner/repo')
  })

  it('includes a view param when view is not "repo"', () => {
    const url = buildShareableUrl({
      repoUrl: 'https://github.com/owner/repo',
      view: 'diagram',
    })

    const parsed = new URL(url)
    expect(parsed.searchParams.get('view')).toBe('diagram')
  })

  it('omits the view param when view is "repo" (default tab)', () => {
    const url = buildShareableUrl({
      repoUrl: 'https://github.com/owner/repo',
      view: 'repo',
    })

    const parsed = new URL(url)
    expect(parsed.searchParams.has('view')).toBe(false)
  })

  it('omits the view param when view is undefined', () => {
    const url = buildShareableUrl({
      repoUrl: 'https://github.com/owner/repo',
    })

    const parsed = new URL(url)
    expect(parsed.searchParams.has('view')).toBe(false)
  })

  it('URL-encodes special characters in repo URL', () => {
    const url = buildShareableUrl({
      repoUrl: 'https://github.com/owner/my-repo',
      view: 'code',
    })

    // The repo param value should be properly encoded in the full URL string
    expect(url).toContain('repo=')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('repo')).toBe('https://github.com/owner/my-repo')
  })
})

describe('parseShareableUrl', () => {
  it('extracts repo URL from search params', () => {
    const result = parseShareableUrl('?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo')

    expect(result).not.toBeNull()
    expect(result!.repoUrl).toBe('https://github.com/owner/repo')
  })

  it('extracts the view param when present', () => {
    const result = parseShareableUrl('?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo&view=issues')

    expect(result).not.toBeNull()
    expect(result!.view).toBe('issues')
  })

  it('returns undefined view when view param is absent', () => {
    const result = parseShareableUrl('?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo')

    expect(result).not.toBeNull()
    expect(result!.view).toBeUndefined()
  })

  it('returns null when no repo param is present', () => {
    const result = parseShareableUrl('?view=diagram')
    expect(result).toBeNull()
  })

  it('returns null for empty search string', () => {
    const result = parseShareableUrl('')
    expect(result).toBeNull()
  })

  it('round-trips with buildShareableUrl', () => {
    const original = {
      repoUrl: 'https://github.com/acme/project',
      view: 'docs' as const,
    }

    const url = buildShareableUrl(original)
    const search = new URL(url).search
    const parsed = parseShareableUrl(search)

    expect(parsed).not.toBeNull()
    expect(parsed!.repoUrl).toBe(original.repoUrl)
    expect(parsed!.view).toBe(original.view)
  })
})
