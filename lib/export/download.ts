/**
 * Client-side file download utility using Blob + URL.createObjectURL.
 */

interface DownloadOptions {
  /** File content as string */
  content: string
  /** Downloaded file name (e.g. "report.json") */
  filename: string
  /** MIME type (e.g. "application/json") */
  mimeType: string
}

/**
 * Trigger a browser file download from in-memory content.
 * Creates a temporary Blob URL and clicks a hidden anchor element.
 */
export function downloadFile({ content, filename, mimeType }: DownloadOptions): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = sanitizeFilename(filename)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  URL.revokeObjectURL(url)
}

/**
 * Sanitize a filename by replacing characters that are invalid on common
 * file systems with hyphens.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
}
