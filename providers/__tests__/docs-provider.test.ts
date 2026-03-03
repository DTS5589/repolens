import { describe, it, expect } from 'vitest'
import {
  getAssistantText,
  buildDocPrompt,
  DOC_PRESETS,
  type DocPreset,
} from '../docs-provider'
import type { UIMessage } from 'ai'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assistantMsg(text: string, id = 'msg-1'): UIMessage {
  return {
    id,
    role: 'assistant',
    content: text,
    parts: [{ type: 'text', text }],
    createdAt: new Date(),
  } as UIMessage
}

function userMsg(text: string, id = 'user-1'): UIMessage {
  return {
    id,
    role: 'user',
    content: text,
    parts: [{ type: 'text', text }],
    createdAt: new Date(),
  } as UIMessage
}

function assistantMsgNoParts(id = 'no-parts'): UIMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    parts: [],
    createdAt: new Date(),
  } as UIMessage
}

// ---------------------------------------------------------------------------
// getAssistantText
// ---------------------------------------------------------------------------

describe('getAssistantText', () => {
  it('returns empty string for empty messages array', () => {
    expect(getAssistantText([])).toBe('')
  })

  it('extracts text from a single assistant message', () => {
    const result = getAssistantText([assistantMsg('Hello World')])
    expect(result).toBe('Hello World')
  })

  it('concatenates text from multiple assistant messages', () => {
    const msgs = [assistantMsg('Part 1', 'a1'), assistantMsg(' Part 2', 'a2')]
    expect(getAssistantText(msgs)).toBe('Part 1 Part 2')
  })

  it('ignores non-assistant messages', () => {
    const msgs = [userMsg('user question'), assistantMsg('answer')]
    expect(getAssistantText(msgs)).toBe('answer')
  })

  it('handles assistant messages with no text parts', () => {
    const msgs = [assistantMsgNoParts()]
    expect(getAssistantText(msgs)).toBe('')
  })

  it('handles mix of messages with and without text parts', () => {
    const msgs = [assistantMsgNoParts('np'), assistantMsg('Hello', 'a')]
    expect(getAssistantText(msgs)).toBe('Hello')
  })
})

// ---------------------------------------------------------------------------
// buildDocPrompt
// ---------------------------------------------------------------------------

describe('buildDocPrompt', () => {
  function findPreset(id: string): DocPreset {
    const preset = DOC_PRESETS.find(p => p.id === id)
    if (!preset) throw new Error(`Preset '${id}' not found`)
    return preset
  }

  it('returns preset.prompt for architecture type', () => {
    const preset = findPreset('architecture')
    const result = buildDocPrompt(preset, null, '')
    expect(result).toBe(preset.prompt)
    expect(result).toContain('architecture overview')
  })

  it('returns preset.prompt for setup type', () => {
    const preset = findPreset('setup')
    const result = buildDocPrompt(preset, null, '')
    expect(result).toBe(preset.prompt)
    expect(result).toContain('Getting Started')
  })

  it('returns preset.prompt for api-reference type', () => {
    const preset = findPreset('api-reference')
    const result = buildDocPrompt(preset, null, '')
    expect(result).toBe(preset.prompt)
    expect(result).toContain('API reference')
  })

  it('returns file explanation prompt with file path for file-explanation type', () => {
    const preset = findPreset('file-explanation')
    const result = buildDocPrompt(preset, 'src/utils.ts', '')
    expect(result).toContain('src/utils.ts')
    expect(result).toContain('Explain this file')
  })

  it('returns preset.prompt when file-explanation has no targetFile', () => {
    const preset = findPreset('file-explanation')
    const result = buildDocPrompt(preset, null, '')
    // file-explanation preset.prompt is '' (empty)
    expect(result).toBe(preset.prompt)
  })

  it('returns customPrompt for custom type', () => {
    const preset = findPreset('custom')
    const customText = 'Write a migration guide from v1 to v2'
    const result = buildDocPrompt(preset, null, customText)
    expect(result).toBe(customText)
  })

  it('returns empty string for custom type with empty customPrompt', () => {
    const preset = findPreset('custom')
    expect(buildDocPrompt(preset, null, '')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// DOC_PRESETS
// ---------------------------------------------------------------------------

describe('DOC_PRESETS', () => {
  it('has exactly 5 presets', () => {
    expect(DOC_PRESETS).toHaveLength(5)
  })

  it('each preset has a unique id', () => {
    const ids = DOC_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all presets have required fields', () => {
    for (const preset of DOC_PRESETS) {
      expect(preset).toHaveProperty('id')
      expect(preset).toHaveProperty('label')
      expect(preset).toHaveProperty('description')
      expect(preset).toHaveProperty('prompt')
      expect(typeof preset.id).toBe('string')
      expect(typeof preset.label).toBe('string')
      expect(typeof preset.description).toBe('string')
      expect(typeof preset.prompt).toBe('string')
    }
  })

  it('contains expected preset ids', () => {
    const ids = DOC_PRESETS.map(p => p.id)
    expect(ids).toContain('architecture')
    expect(ids).toContain('setup')
    expect(ids).toContain('api-reference')
    expect(ids).toContain('file-explanation')
    expect(ids).toContain('custom')
  })

  it('standard presets (architecture, setup, api-reference) have non-empty prompts', () => {
    const standardIds = ['architecture', 'setup', 'api-reference']
    for (const id of standardIds) {
      const preset = DOC_PRESETS.find(p => p.id === id)
      expect(preset?.prompt.length).toBeGreaterThan(0)
    }
  })
})
