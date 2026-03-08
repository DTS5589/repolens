import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  wrapLanguageModel: vi.fn(({ model }) => model),
}))

import { createLoggingMiddleware } from '../middleware'

describe('createLoggingMiddleware', () => {
  it('returns a middleware with specificationVersion v3', () => {
    const middleware = createLoggingMiddleware()
    expect(middleware.specificationVersion).toBe('v3')
  })

  it('has transformParams that logs message count', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const middleware = createLoggingMiddleware()

    const params = { prompt: [{ role: 'user' }, { role: 'assistant' }] }
    const result = await middleware.transformParams!({
      params: params as never,
      type: 'generate' as const,
      model: {} as never,
    })

    expect(consoleSpy).toHaveBeenCalledWith('[AI] Model call: 2 messages')
    expect(result).toBe(params)
    consoleSpy.mockRestore()
  })

  it('transformParams never logs message content', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const middleware = createLoggingMiddleware()

    const sensitiveContent = 'my-secret-api-key-12345'
    const params = {
      prompt: [
        { role: 'user', content: [{ type: 'text', text: sensitiveContent }] },
      ],
    }

    await middleware.transformParams!({
      params: params as never,
      type: 'generate' as const,
      model: {} as never,
    })

    // Ensure the sensitive content was never logged
    for (const call of consoleSpy.mock.calls) {
      const logStr = call.join(' ')
      expect(logStr).not.toContain(sensitiveContent)
    }
    consoleSpy.mockRestore()
  })

  it('wrapGenerate logs elapsed time and usage', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const middleware = createLoggingMiddleware()

    const mockUsage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
    const mockResult = { usage: mockUsage }
    const doGenerate = vi.fn().mockResolvedValue(mockResult)

    const result = await middleware.wrapGenerate!({
      doGenerate,
      doStream: vi.fn() as never,
      params: {} as never,
      model: {} as never,
    })

    expect(doGenerate).toHaveBeenCalled()
    expect(result).toBe(mockResult)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[AI\] Generate: \d+ms, usage:/),
      mockUsage,
    )
    consoleSpy.mockRestore()
  })

  it('wrapStream logs stream start time', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const middleware = createLoggingMiddleware()

    const mockStreamResult = { stream: 'mock' }
    const doStream = vi.fn().mockResolvedValue(mockStreamResult)

    const result = await middleware.wrapStream!({
      doStream,
      doGenerate: vi.fn() as never,
      params: {} as never,
      model: {} as never,
    })

    expect(doStream).toHaveBeenCalled()
    expect(result).toBe(mockStreamResult)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[AI\] Stream started: \d+ms/),
    )
    consoleSpy.mockRestore()
  })
})
