import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyToClipboard } from './clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    // Reset clipboard mock between tests
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    })

    // jsdom does not define document.execCommand — define it so vi.spyOn works
    if (!document.execCommand) {
      document.execCommand = vi.fn().mockReturnValue(false)
    }
  })

  it('calls navigator.clipboard.writeText with the provided text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    await copyToClipboard('hello world')

    expect(writeText).toHaveBeenCalledWith('hello world')
  })

  it('returns true when clipboard API succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const result = await copyToClipboard('text')
    expect(result).toBe(true)
  })

  it('falls back to legacy copy when clipboard API is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined })

    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true)

    const result = await copyToClipboard('fallback text')

    expect(execCommandSpy).toHaveBeenCalledWith('copy')
    expect(result).toBe(true)
  })

  it('falls back to legacy copy when clipboard API throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true)

    const result = await copyToClipboard('fallback text')

    expect(execCommandSpy).toHaveBeenCalledWith('copy')
    expect(result).toBe(true)
  })

  it('returns false when both clipboard API and legacy fallback fail', async () => {
    Object.assign(navigator, { clipboard: undefined })

    vi.spyOn(document, 'execCommand').mockReturnValue(false)

    const result = await copyToClipboard('text')
    expect(result).toBe(false)
  })
})
