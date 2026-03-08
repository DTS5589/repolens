import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ai/providers', () => ({
  getModelContextWindow: vi.fn().mockReturnValue(128_000),
}))

import { buildDocsPrompt, type DocsPromptOptions, type DocType } from '../prompts/docs'

const BASE_OPTS: Omit<DocsPromptOptions, 'docType'> = {
  repoContext: {
    name: 'test-repo',
    description: 'A test repository',
    structure: 'src/\n  index.ts\n  utils.ts',
  },
  structuralIndex: '{"files":[]}',
  stepBudget: 40,
  model: 'gpt-4o',
}

const DOC_TYPES: DocType[] = [
  'architecture',
  'setup',
  'api-reference',
  'file-explanation',
  'onboarding',
  'custom',
]

describe('buildDocsPrompt', () => {
  describe.each(DOC_TYPES)('docType=%s', (docType) => {
    it('matches snapshot', () => {
      const result = buildDocsPrompt({ ...BASE_OPTS, docType })
      expect(result).toMatchSnapshot()
    })

    it('matches snapshot with targetFile', () => {
      const result = buildDocsPrompt({
        ...BASE_OPTS,
        docType,
        targetFile: 'src/utils.ts',
      })
      expect(result).toMatchSnapshot()
    })
  })

  it('includes repo name and description', () => {
    const result = buildDocsPrompt({ ...BASE_OPTS, docType: 'architecture' })
    expect(result).toContain('test-repo')
    expect(result).toContain('A test repository')
  })

  it('shows "No description" for empty description', () => {
    const result = buildDocsPrompt({
      ...BASE_OPTS,
      docType: 'setup',
      repoContext: { name: 'test', description: '', structure: 'src/' },
    })
    expect(result).toContain('No description')
  })

  it('includes targetFile section when provided', () => {
    const result = buildDocsPrompt({
      ...BASE_OPTS,
      docType: 'file-explanation',
      targetFile: 'lib/core.ts',
    })
    expect(result).toContain('## Target File')
    expect(result).toContain('lib/core.ts')
  })

  it('omits targetFile section when null', () => {
    const result = buildDocsPrompt({
      ...BASE_OPTS,
      docType: 'architecture',
      targetFile: null,
    })
    expect(result).not.toContain('## Target File')
  })

  it('omits targetFile section when not provided', () => {
    const result = buildDocsPrompt({ ...BASE_OPTS, docType: 'setup' })
    expect(result).not.toContain('## Target File')
  })

  it('includes mermaid rules for documentation', () => {
    const result = buildDocsPrompt({ ...BASE_OPTS, docType: 'architecture' })
    expect(result).toContain('Mermaid Diagram Syntax Rules')
    expect(result).toContain('documentation')
  })

  it('includes step budget', () => {
    const result = buildDocsPrompt({ ...BASE_OPTS, docType: 'setup', stepBudget: 30 })
    expect(result).toContain('30 tool-call rounds')
  })

  it('includes verification protocol', () => {
    const result = buildDocsPrompt({ ...BASE_OPTS, docType: 'custom' })
    expect(result).toContain('Self-Verification Protocol')
  })

  it('includes structural index content', () => {
    const result = buildDocsPrompt({
      ...BASE_OPTS,
      docType: 'architecture',
      structuralIndex: '{"files":[{"path":"src/main.ts"}]}',
    })
    expect(result).toContain('{"files":[{"path":"src/main.ts"}]}')
  })

  it('includes model context window info', () => {
    const result = buildDocsPrompt({ ...BASE_OPTS, docType: 'architecture' })
    expect(result).toContain('128,000')
  })

  it('includes file tree', () => {
    const result = buildDocsPrompt({ ...BASE_OPTS, docType: 'architecture' })
    expect(result).toContain('src/\n  index.ts\n  utils.ts')
  })
})
