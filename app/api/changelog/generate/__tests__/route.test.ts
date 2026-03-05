import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — set up before importing the route
// ---------------------------------------------------------------------------

const mockStreamText = vi.fn()
const mockConvertToModelMessages = vi.fn()
const mockCreateAIModel = vi.fn()
const mockGetModelContextWindow = vi.fn()
const mockCreateContextCompactor = vi.fn()

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  convertToModelMessages: (...args: unknown[]) => mockConvertToModelMessages(...args),
  stepCountIs: (count: number) => `stopAt:${count}`,
  consumeStream: vi.fn(),
}))

vi.mock('@/lib/ai/providers', () => ({
  createAIModel: (...args: unknown[]) => mockCreateAIModel(...args),
  getModelContextWindow: (...args: unknown[]) => mockGetModelContextWindow(...args),
}))

vi.mock('@/lib/ai/context-compactor', () => ({
  createContextCompactor: (...args: unknown[]) => mockCreateContextCompactor(...args),
}))

vi.mock('@/lib/ai/tool-definitions', () => ({
  codeTools: { readFile: {}, searchFiles: {} },
}))

vi.mock('@/lib/api/error', () => ({
  apiError: (code: string, message: string, status: number, details?: string) => {
    return Response.json(
      { error: { code, message, ...(details !== undefined && { details }) } },
      { status },
    )
  },
}))

import { POST } from '@/app/api/changelog/generate/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    messages: [{ role: 'user', content: 'Generate changelog' }],
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'sk-test-key',
    changelogType: 'conventional',
    repoContext: {
      name: 'owner/repo',
      description: 'A test repo',
      structure: 'src/\n  index.ts',
    },
    fromRef: 'v1.0.0',
    toRef: 'v2.0.0',
    commitData: 'abc123 feat: add feature\ndef456 fix: fix bug',
    ...overrides,
  }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/changelog/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/changelog/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAIModel.mockReturnValue({ id: 'mock-model' })
    mockGetModelContextWindow.mockReturnValue(128_000)
    mockConvertToModelMessages.mockResolvedValue([{ role: 'user', content: 'Generate changelog' }])
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('stream-data', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    })
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/changelog/generate', {
      method: 'POST',
      body: 'not json!!!',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_JSON')
  })

  it('returns 422 for empty body', async () => {
    const req = makeRequest({})

    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 422 for missing apiKey', async () => {
    const req = makeRequest(validBody({ apiKey: '' }))

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 for missing messages', async () => {
    const req = makeRequest(validBody({ messages: [] }))

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 for invalid provider', async () => {
    const req = makeRequest(validBody({ provider: 'mistral' }))

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 for invalid changelogType', async () => {
    const req = makeRequest(validBody({ changelogType: 'invalid-type' }))

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 for missing fromRef', async () => {
    const req = makeRequest(validBody({ fromRef: '' }))

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 for missing toRef', async () => {
    const req = makeRequest(validBody({ toRef: '' }))

    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('succeeds with valid request and returns streaming response', async () => {
    const req = makeRequest(validBody())

    const res = await POST(req)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('stream-data')
  })

  it('calls createAIModel with correct provider, model, and apiKey', async () => {
    const req = makeRequest(validBody({
      provider: 'anthropic',
      model: 'claude-3-opus',
      apiKey: 'sk-ant-key',
    }))

    await POST(req)

    expect(mockCreateAIModel).toHaveBeenCalledWith('anthropic', 'claude-3-opus', 'sk-ant-key')
  })

  it('system prompt includes repo context', async () => {
    const req = makeRequest(validBody({
      repoContext: {
        name: 'my-org/my-repo',
        description: 'My awesome project',
        structure: 'src/\n  main.ts',
      },
    }))

    await POST(req)

    expect(mockStreamText).toHaveBeenCalledOnce()
    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('my-org/my-repo')
    expect(callArgs.system).toContain('My awesome project')
  })

  it('system prompt includes commit data', async () => {
    const commitData = 'abc123 feat: add feature\ndef456 fix: fix bug'
    const req = makeRequest(validBody({ commitData }))

    await POST(req)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain(commitData)
  })

  it('system prompt includes fromRef and toRef', async () => {
    const req = makeRequest(validBody({ fromRef: 'v3.0.0', toRef: 'v4.0.0' }))

    await POST(req)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('v3.0.0')
    expect(callArgs.system).toContain('v4.0.0')
  })

  it('uses conventional system prompt for conventional type', async () => {
    const req = makeRequest(validBody({ changelogType: 'conventional' }))

    await POST(req)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('Conventional Commits')
  })

  it('uses release-notes system prompt for release-notes type', async () => {
    const req = makeRequest(validBody({ changelogType: 'release-notes' }))

    await POST(req)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('user-facing release notes')
  })

  it('uses keep-a-changelog system prompt for keep-a-changelog type', async () => {
    const req = makeRequest(validBody({ changelogType: 'keep-a-changelog' }))

    await POST(req)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('Keep a Changelog')
  })

  it('uses custom system prompt for custom type', async () => {
    const req = makeRequest(validBody({ changelogType: 'custom' }))

    await POST(req)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('custom instructions')
  })

  it('accepts optional maxSteps param', async () => {
    const req = makeRequest(validBody({ maxSteps: 60 }))

    const res = await POST(req)
    expect(res.status).toBe(200)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('60')
  })

  it('accepts optional compactionEnabled param', async () => {
    const req = makeRequest(validBody({ compactionEnabled: true }))

    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('accepts optional structuralIndex param', async () => {
    const req = makeRequest(validBody({ structuralIndex: '{"files": []}' }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.system).toContain('{"files": []}')
  })

  it('returns 500 when streamText throws', async () => {
    mockStreamText.mockImplementation(() => { throw new Error('AI unavailable') })

    const req = makeRequest(validBody())

    const res = await POST(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).toBe('AI unavailable')
  })

  it('passes abortSignal from request to streamText', async () => {
    const controller = new AbortController()
    const req = new Request('http://localhost/api/changelog/generate', {
      method: 'POST',
      body: JSON.stringify(validBody()),
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })

    await POST(req)

    const callArgs = mockStreamText.mock.calls[0][0]
    expect(callArgs.abortSignal).toBeDefined()
  })

  it.each(['openai', 'google', 'anthropic', 'openrouter'])(
    'accepts valid provider: %s',
    async (provider) => {
      const req = makeRequest(validBody({ provider }))
      const res = await POST(req)
      expect(res.status).toBe(200)
    },
  )

  it.each(['conventional', 'release-notes', 'keep-a-changelog', 'custom'])(
    'accepts valid changelog type: %s',
    async (changelogType) => {
      const req = makeRequest(validBody({ changelogType }))
      const res = await POST(req)
      expect(res.status).toBe(200)
    },
  )
})
