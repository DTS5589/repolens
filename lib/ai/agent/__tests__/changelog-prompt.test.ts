import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ai/providers', () => ({
  getModelContextWindow: vi.fn().mockReturnValue(128_000),
}))

import { buildChangelogPrompt, type ChangelogPromptOptions } from '../prompts/changelog'
import type { ChangelogType } from '@/lib/changelog/types'

const BASE_OPTS: Omit<ChangelogPromptOptions, 'changelogType'> = {
  repoContext: {
    name: 'test-repo',
    description: 'A test repository',
    structure: 'src/\n  index.ts',
  },
  structuralIndex: '{"files":[]}',
  fromRef: 'v1.0.0',
  toRef: 'v2.0.0',
  commitData: 'abc1234 feat: add new feature\ndef5678 fix: resolve bug',
  stepBudget: 40,
  model: 'gpt-4o',
}

const CHANGELOG_TYPES: ChangelogType[] = [
  'conventional',
  'release-notes',
  'keep-a-changelog',
  'custom',
]

describe('buildChangelogPrompt', () => {
  describe.each(CHANGELOG_TYPES)('changelogType=%s', (changelogType) => {
    it('matches snapshot', () => {
      const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType })
      expect(result).toMatchSnapshot()
    })
  })

  it('includes repo name and description', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('test-repo')
    expect(result).toContain('A test repository')
  })

  it('shows "No description" for empty description', () => {
    const result = buildChangelogPrompt({
      ...BASE_OPTS,
      changelogType: 'release-notes',
      repoContext: { name: 'test', description: '', structure: 'src/' },
    })
    expect(result).toContain('No description')
  })

  it('includes fromRef and toRef', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('`v1.0.0`')
    expect(result).toContain('`v2.0.0`')
  })

  it('includes commit data', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('abc1234 feat: add new feature')
    expect(result).toContain('def5678 fix: resolve bug')
  })

  it('includes mermaid rules for changelog', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('Mermaid Diagram Syntax Rules')
    expect(result).toContain('the changelog')
  })

  it('includes step budget', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional', stepBudget: 25 })
    expect(result).toContain('25 tool-call rounds')
  })

  it('includes verification protocol for changelog', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('Self-Verification Protocol')
    expect(result).toContain('commit data')
  })

  it('includes structural index content', () => {
    const result = buildChangelogPrompt({
      ...BASE_OPTS,
      changelogType: 'keep-a-changelog',
      structuralIndex: '{"files":[{"path":"src/main.ts"}]}',
    })
    expect(result).toContain('{"files":[{"path":"src/main.ts"}]}')
  })

  it('includes model context window info', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('128,000')
  })

  it('includes file tree', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('src/\n  index.ts')
  })

  it('conventional type includes emoji headings', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'conventional' })
    expect(result).toContain('Breaking Changes')
    expect(result).toContain('Features')
    expect(result).toContain('Bug Fixes')
  })

  it('release-notes type includes user-facing language', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'release-notes' })
    expect(result).toContain('user-facing release notes')
    expect(result).toContain('Highlights')
  })

  it('keep-a-changelog type follows keepachangelog spec', () => {
    const result = buildChangelogPrompt({ ...BASE_OPTS, changelogType: 'keep-a-changelog' })
    expect(result).toContain('Keep a Changelog')
    expect(result).toContain('### Added')
    expect(result).toContain('### Changed')
    expect(result).toContain('### Fixed')
  })
})
