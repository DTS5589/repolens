import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ai/providers', () => ({
  getModelContextWindow: vi.fn().mockReturnValue(128_000),
}))

import { buildChatPrompt, type ChatPromptOptions } from '../prompts/chat'

const BASE_OPTS: ChatPromptOptions = {
  stepBudget: 50,
  contextWindow: 128_000,
  toolCount: 12,
  model: 'gpt-4o',
}

const REPO_CONTEXT = {
  name: 'test-repo',
  description: 'A test repository',
  structure: 'src/\n  index.ts\n  utils.ts',
}

describe('buildChatPrompt', () => {
  it('matches snapshot without repoContext', () => {
    const result = buildChatPrompt({ ...BASE_OPTS })
    expect(result).toMatchSnapshot()
  })

  it('matches snapshot with repoContext', () => {
    const result = buildChatPrompt({
      ...BASE_OPTS,
      repoContext: REPO_CONTEXT,
      structuralIndex: '{"files":[]}',
    })
    expect(result).toMatchSnapshot()
  })

  it('matches snapshot with repoContext and pinnedContext', () => {
    const result = buildChatPrompt({
      ...BASE_OPTS,
      repoContext: REPO_CONTEXT,
      structuralIndex: '{"files":[]}',
      pinnedContext: '## File: src/utils.ts\nconsole.log("hello")',
    })
    expect(result).toMatchSnapshot()
  })

  it('includes CodeDoc identity', () => {
    const result = buildChatPrompt({ ...BASE_OPTS })
    expect(result).toContain('CodeDoc')
  })

  it('includes tool count', () => {
    const result = buildChatPrompt({ ...BASE_OPTS, toolCount: 12 })
    expect(result).toContain('12 tools')
  })

  it('includes step budget', () => {
    const result = buildChatPrompt({ ...BASE_OPTS, stepBudget: 30 })
    expect(result).toContain('30 tool-call rounds')
  })

  it('includes mermaid guidelines', () => {
    const result = buildChatPrompt({ ...BASE_OPTS })
    expect(result).toContain('Mermaid Diagram Guidelines')
  })

  it('includes repo name and description when repoContext provided', () => {
    const result = buildChatPrompt({ ...BASE_OPTS, repoContext: REPO_CONTEXT })
    expect(result).toContain('test-repo')
    expect(result).toContain('A test repository')
  })

  it('includes file tree when repoContext provided', () => {
    const result = buildChatPrompt({ ...BASE_OPTS, repoContext: REPO_CONTEXT })
    expect(result).toContain('src/\n  index.ts\n  utils.ts')
  })

  it('includes "No repository" message without repoContext', () => {
    const result = buildChatPrompt({ ...BASE_OPTS })
    expect(result).toContain('No repository is currently connected')
  })

  it('includes pinned context when provided', () => {
    const result = buildChatPrompt({
      ...BASE_OPTS,
      repoContext: REPO_CONTEXT,
      pinnedContext: '## Pinned: config.ts\nexport const PORT = 3000',
    })
    expect(result).toContain('Pinned Files')
    expect(result).toContain('export const PORT = 3000')
  })

  it('omits pinned files section without pinnedContext', () => {
    const result = buildChatPrompt({
      ...BASE_OPTS,
      repoContext: REPO_CONTEXT,
    })
    expect(result).not.toContain('Pinned Files')
  })

  it('includes structural index when provided', () => {
    const result = buildChatPrompt({
      ...BASE_OPTS,
      repoContext: REPO_CONTEXT,
      structuralIndex: '{"files":[{"path":"a.ts"}]}',
    })
    expect(result).toContain('{"files":[{"path":"a.ts"}]}')
  })

  it('shows "Not available" for structural index when not provided', () => {
    const result = buildChatPrompt({
      ...BASE_OPTS,
      repoContext: REPO_CONTEXT,
    })
    expect(result).toContain('Not available')
  })

  it('includes model context window info', () => {
    const result = buildChatPrompt({ ...BASE_OPTS })
    expect(result).toContain('128,000')
  })
})
