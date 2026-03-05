/**
 * Simple semver parser and comparator.
 * No external dependencies — handles basic major.minor.patch comparison.
 */

/**
 * Parse a version string into major/minor/patch components.
 * Strips range prefixes (^, ~, >=, etc.) and pre-release suffixes (-beta.1, etc.).
 * Returns null for unparseable versions.
 */
export function parseSemver(
  version: string,
): { major: number; minor: number; patch: number } | null {
  if (!version || typeof version !== 'string') return null

  // Strip range prefixes: ^, ~, >=, <=, >, <, =
  let cleaned = version.trim().replace(/^[~^>=<]+/, '')

  // If it contains a space (complex range like ">=1.0.0 <2.0.0"), take the first part
  if (cleaned.includes(' ')) {
    cleaned = cleaned.split(' ')[0].replace(/^[~^>=<]+/, '')
  }

  // Strip pre-release suffix and build metadata: -beta.1, +build.123
  cleaned = cleaned.replace(/[-+].*$/, '')

  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    // Try partial versions like "1.2" or "1"
    const partial = cleaned.match(/^(\d+)(?:\.(\d+))?$/)
    if (partial) {
      return {
        major: parseInt(partial[1], 10),
        minor: partial[2] !== undefined ? parseInt(partial[2], 10) : 0,
        patch: 0,
      }
    }
    return null
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * Compare installed version against latest version.
 * Returns which component differs, or null if equal/unparseable.
 */
export function compareVersions(
  current: string,
  latest: string,
): 'major' | 'minor' | 'patch' | null {
  const cur = parseSemver(current)
  const lat = parseSemver(latest)

  if (!cur || !lat) return null

  if (cur.major < lat.major) return 'major'
  if (cur.major === lat.major && cur.minor < lat.minor) return 'minor'
  if (cur.major === lat.major && cur.minor === lat.minor && cur.patch < lat.patch) return 'patch'

  return null
}

/**
 * Check if the current version is behind the latest.
 * Returns true if compareVersions returns a non-null result.
 */
export function isOutdated(current: string, latest: string): boolean {
  return compareVersions(current, latest) !== null
}
