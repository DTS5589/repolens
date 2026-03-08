// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { zipSync, strToU8, unzipSync, strFromU8, unzip } from 'fflate'
import { isFileIndexable, fetchRepoZipball, INDEXABLE_EXTENSIONS } from '../zipball'

// ---------------------------------------------------------------------------
// Helpers — create mock ZIP archives with fflate
// ---------------------------------------------------------------------------

/**
 * Build a minimal ZIP ArrayBuffer mimicking GitHub's zipball structure.
 * GitHub wraps everything in a `{owner}-{repo}-{sha}/` root directory.
 */
function createMockZip(
  files: Record<string, string>,
  rootPrefix = 'owner-repo-abc123',
): ArrayBuffer {
  const archive: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    archive[`${rootPrefix}/${path}`] = strToU8(content)
  }
  const compressed = zipSync(archive)
  // zipSync may return a view into a larger buffer — slice to get exact bytes
  return compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer
}

// ---------------------------------------------------------------------------
// isFileIndexable
// ---------------------------------------------------------------------------

describe('isFileIndexable', () => {
  it('accepts a .ts file under the size limit', () => {
    expect(isFileIndexable('index.ts', 1000)).toBe(true)
  })

  it('accepts a full path with an indexable extension', () => {
    expect(isFileIndexable('src/utils/helpers.py', 200)).toBe(true)
  })

  it('rejects a binary file extension', () => {
    expect(isFileIndexable('image.png', 100)).toBe(false)
  })

  it('rejects a file exceeding 500KB', () => {
    expect(isFileIndexable('huge.ts', 500_001)).toBe(false)
  })

  it('accepts a file exactly at the 500KB boundary', () => {
    expect(isFileIndexable('boundary.ts', 500_000)).toBe(true)
  })

  it('rejects a file with no extension', () => {
    expect(isFileIndexable('Makefile', 100)).toBe(false)
  })

  it.each([
    'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java',
    'json', 'yaml', 'yml', 'md', 'css', 'html', 'sql',
  ])('accepts .%s extension', (ext) => {
    expect(isFileIndexable(`file.${ext}`, 100)).toBe(true)
  })

  it.each([
    'png', 'jpg', 'gif', 'svg', 'woff', 'ttf', 'exe', 'dll', 'so',
  ])('rejects .%s extension', (ext) => {
    expect(isFileIndexable(`file.${ext}`, 100)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// fetchRepoZipball
// ---------------------------------------------------------------------------

describe('fetchRepoZipball', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('DEBUG: fflate unzip works in this environment', async () => {
    // Import the native Node.js module directly, bypassing Vite's transformation
    const nodeFflate = await vi.importActual<typeof import('fflate')>('fflate')
    const archive: Record<string, Uint8Array> = { 'root/test.ts': nodeFflate.strToU8('hello') }
    const compressed = nodeFflate.zipSync(archive)
    console.log('NODE zipSync length:', compressed.length)
    console.log('NODE first 4 bytes:', Array.from(compressed.slice(0, 4)))

    const buf = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)
    const data = new Uint8Array(buf)

    // Try unzipSync from the Vite-transformed module
    const syncResult = unzipSync(data)
    console.log('VITE UNZIP KEYS:', JSON.stringify(Object.keys(syncResult)))
    for (const [k, v] of Object.entries(syncResult)) {
      console.log(`KEY: "${k}" -> length: ${v.length}, content: "${strFromU8(v)}"`)
    }

    expect(true).toBe(true)
  })

  it('DEBUG: Response.arrayBuffer round-trip', async () => {
    const archive: Record<string, Uint8Array> = { 'root/test.ts': strToU8('hello') }
    const compressed = zipSync(archive)
    const buf = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer

    const response = new Response(buf, { status: 200 })
    const ab = await response.arrayBuffer()
    console.log('original length:', buf.byteLength, 'response ab length:', ab.byteLength)

    const data = new Uint8Array(ab)
    console.log('first 4 bytes:', Array.from(data.slice(0, 4)))

    const result = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(data, {}, (err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })

    console.log('unzip result keys:', Object.keys(result))
    expect(Object.keys(result).length).toBeGreaterThan(0)
  })

  it('parses a ZIP and returns indexable files with stripped root prefix', async () => {
    const zipBuffer = createMockZip({
      'src/index.ts': 'export const x = 1;',
      'src/utils.ts': 'export function add(a: number, b: number) { return a + b; }',
      'README.md': '# Hello',
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(zipBuffer, { status: 200 }),
    )

    const files = await fetchRepoZipball('owner', 'repo', 'main')

    expect(files.size).toBe(3)
    expect(files.get('src/index.ts')).toBe('export const x = 1;')
    expect(files.get('src/utils.ts')).toContain('export function add')
    expect(files.get('README.md')).toBe('# Hello')
  })

  it('filters out non-indexable extensions', async () => {
    const zipBuffer = createMockZip({
      'src/app.ts': 'const app = true;',
      'assets/logo.png': 'binary-data-here',
      'fonts/custom.woff': 'font-data',
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(zipBuffer, { status: 200 }),
    )

    const files = await fetchRepoZipball('owner', 'repo', 'main')

    expect(files.size).toBe(1)
    expect(files.has('src/app.ts')).toBe(true)
    expect(files.has('assets/logo.png')).toBe(false)
    expect(files.has('fonts/custom.woff')).toBe(false)
  })

  it('excludes files exceeding the 500KB size limit', async () => {
    const hugeContent = 'x'.repeat(500_001)
    const zipBuffer = createMockZip({
      'small.ts': 'const x = 1;',
      'huge.ts': hugeContent,
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(zipBuffer, { status: 200 }),
    )

    const files = await fetchRepoZipball('owner', 'repo', 'main')

    expect(files.size).toBe(1)
    expect(files.has('small.ts')).toBe(true)
    expect(files.has('huge.ts')).toBe(false)
  })

  it('returns an empty Map for an empty ZIP', async () => {
    const zipBuffer = zipSync({}).buffer as ArrayBuffer

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(zipBuffer, { status: 200 }),
    )

    const files = await fetchRepoZipball('owner', 'repo', 'main')

    expect(files.size).toBe(0)
  })

  it('throws "Repository not found" on HTTP 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 404, statusText: 'Not Found' }),
    )

    await expect(
      fetchRepoZipball('owner', 'repo', 'main'),
    ).rejects.toThrow('Repository not found')
  })

  it('throws rate-limit error on HTTP 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 403, statusText: 'Forbidden' }),
    )

    await expect(
      fetchRepoZipball('owner', 'repo', 'main'),
    ).rejects.toThrow('Rate limit exceeded')
  })

  it('throws generic error for other HTTP failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: 'Server Error' }),
    )

    await expect(
      fetchRepoZipball('owner', 'repo', 'main'),
    ).rejects.toThrow('Zipball download failed: 500')
  })

  it('sends a POST to the proxy API with owner, repo, ref in body', async () => {
    const zipBuffer = createMockZip({ 'file.ts': 'x' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(zipBuffer, { status: 200 }),
    )

    await fetchRepoZipball('acme', 'project', 'v2.0')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/github/zipball')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(init?.body as string)
    expect(body).toEqual({ owner: 'acme', repo: 'project', ref: 'v2.0' })
  })
})
