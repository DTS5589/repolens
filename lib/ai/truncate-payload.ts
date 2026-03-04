/**
 * Cap file contents payload to stay within serverless body size limits.
 * Prioritizes smaller files (more useful for context).
 * Returns a subset of files that fits within the byte budget.
 */

const MAX_PAYLOAD_BYTES = 3_500_000 // 3.5MB — leaves room for messages, context, etc.

export function truncateFileContents(
  files: Record<string, string>,
  maxBytes: number = MAX_PAYLOAD_BYTES,
): { included: Record<string, string>; omittedCount: number } {
  const entries = Object.entries(files).sort((a, b) => a[1].length - b[1].length)

  const included: Record<string, string> = {}
  let totalBytes = 0
  let omittedCount = 0

  for (const [path, content] of entries) {
    const entryBytes = path.length + content.length // rough byte estimate
    if (totalBytes + entryBytes > maxBytes) {
      omittedCount++
      continue
    }
    included[path] = content
    totalBytes += entryBytes
  }

  return { included, omittedCount }
}
