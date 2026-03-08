import { describe, it, expect } from 'vitest'

import {
  mermaidRulesSectionChat,
  mermaidRulesSectionRaw,
  verificationSectionDefault,
  verificationSectionChangelog,
  structuralIndexBlock,
} from '../prompts/shared'

describe('mermaidRulesSectionChat', () => {
  it('returns mermaid guidelines with markdown fencing context', () => {
    const result = mermaidRulesSectionChat()
    expect(result).toContain('## Mermaid Diagram Guidelines')
    expect(result).toContain('flowchart')
    expect(result).toContain('`-->`')
    expect(result).toContain('subgraph')
  })
})

describe('mermaidRulesSectionRaw', () => {
  it('returns mermaid rules for documentation context', () => {
    const result = mermaidRulesSectionRaw('documentation')
    expect(result).toContain('documentation')
    expect(result).toContain('## Mermaid Diagram Syntax Rules')
    expect(result).toContain('WITHOUT markdown fencing')
  })

  it('returns mermaid rules for changelog context', () => {
    const result = mermaidRulesSectionRaw('the changelog')
    expect(result).toContain('the changelog')
  })
})

describe('verificationSectionDefault', () => {
  it('returns self-verification protocol for docs/chat', () => {
    const result = verificationSectionDefault()
    expect(result).toContain('## Self-Verification Protocol')
    expect(result).toContain('Re-read the key files')
    expect(result).toContain('Cross-check function signatures')
  })
})

describe('verificationSectionChangelog', () => {
  it('returns changelog-specific verification protocol', () => {
    const result = verificationSectionChangelog()
    expect(result).toContain('## Self-Verification Protocol')
    expect(result).toContain('commit data')
    expect(result).toContain('breaking changes')
  })
})

describe('structuralIndexBlock', () => {
  it('includes provided structural index content', () => {
    const index = '{"files": [{"path": "src/main.ts"}]}'
    const result = structuralIndexBlock(index)
    expect(result).toContain('## Structural Index')
    expect(result).toContain(index)
    expect(result).toContain('exports')
    expect(result).toContain('imports')
  })

  it('shows "Not available" when no index provided', () => {
    const result = structuralIndexBlock()
    expect(result).toContain('Not available')
  })

  it('shows "Not available" when undefined passed explicitly', () => {
    const result = structuralIndexBlock(undefined)
    expect(result).toContain('Not available')
  })
})
