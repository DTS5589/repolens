import { describe, it, expect } from 'vitest'
import type { UIMessage } from 'ai'
import { getAssistantText, buildDocPrompt } from '../prompt-builder'
import { DOC_PRESETS } from '../preset-config'
import type { DocPreset } from '../preset-config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function presetById(id: string): DocPreset {
  const p = DOC_PRESETS.find(p => p.id === id)
  if (!p) throw new Error(`Preset ${id} not found`)
  return p
}

function makeMessage(role: 'user' | 'assistant', text: string): UIMessage {
  return {
    id: `msg-${Math.random()}`,
    role,
    parts: [{ type: 'text' as const, text }],
  }
}

// ---------------------------------------------------------------------------
// getAssistantText
// ---------------------------------------------------------------------------

describe('getAssistantText', () => {
  it('returns empty string for an empty messages array', () => {
    expect(getAssistantText([])).toBe('')
  })

  it('concatenates text from assistant messages only', () => {
    const messages: UIMessage[] = [
      makeMessage('user', 'Hello'),
      makeMessage('assistant', 'Hi there'),
      makeMessage('user', 'What?'),
      makeMessage('assistant', ', how can I help?'),
    ]
    expect(getAssistantText(messages)).toBe('Hi there, how can I help?')
  })

  it('skips user messages', () => {
    const messages: UIMessage[] = [
      makeMessage('user', 'Only user text here'),
    ]
    expect(getAssistantText(messages)).toBe('')
  })

  it('handles assistant messages without parts gracefully', () => {
    const messages: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: undefined as unknown as UIMessage['parts'],
      },
    ]
    expect(getAssistantText(messages)).toBe('')
  })

  it('filters out non-text parts', () => {
    const messages: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text' as const, text: 'real text' },
          { type: 'tool-invocation' as const, toolInvocation: {} } as unknown as UIMessage['parts'][0],
        ],
      },
    ]
    expect(getAssistantText(messages)).toBe('real text')
  })
})

// ---------------------------------------------------------------------------
// buildDocPrompt
// ---------------------------------------------------------------------------

describe('buildDocPrompt', () => {
  it('returns the preset prompt for architecture', () => {
    const preset = presetById('architecture')
    const result = buildDocPrompt(preset, null, '')
    expect(result).toBe(preset.prompt)
  })

  it('returns the preset prompt for setup', () => {
    const preset = presetById('setup')
    const result = buildDocPrompt(preset, null, '')
    expect(result).toBe(preset.prompt)
  })

  it('returns the preset prompt for api-reference', () => {
    const preset = presetById('api-reference')
    const result = buildDocPrompt(preset, null, '')
    expect(result).toBe(preset.prompt)
  })

  it('returns a dynamic prompt for file-explanation with a target file', () => {
    const preset = presetById('file-explanation')
    const result = buildDocPrompt(preset, 'src/utils.ts', '')
    expect(result).toContain('src/utils.ts')
    expect(result.toLowerCase()).toContain('explain')
  })

  it('returns the custom prompt for the custom preset', () => {
    const preset = presetById('custom')
    const result = buildDocPrompt(preset, null, 'Explain the auth flow')
    expect(result).toBe('Explain the auth flow')
  })

  it('returns empty string for custom preset with empty custom prompt', () => {
    const preset = presetById('custom')
    const result = buildDocPrompt(preset, null, '')
    expect(result).toBe('')
  })

  it('returns preset prompt for file-explanation when targetFile is null', () => {
    const preset = presetById('file-explanation')
    const result = buildDocPrompt(preset, null, '')
    // When targetFile is null, the file-explanation branch won't match,
    // so it falls through to `return preset.prompt` which is ''
    expect(result).toBe('')
  })
})
