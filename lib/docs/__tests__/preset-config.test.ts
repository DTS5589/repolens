import { describe, it, expect } from 'vitest'
import { DOC_PRESETS } from '../preset-config'
import type { DocType, DocPreset } from '../preset-config'

// ---------------------------------------------------------------------------
// DOC_PRESETS structure validation
// ---------------------------------------------------------------------------

describe('DOC_PRESETS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DOC_PRESETS)).toBe(true)
    expect(DOC_PRESETS.length).toBeGreaterThan(0)
  })

  it('contains exactly 6 presets', () => {
    expect(DOC_PRESETS).toHaveLength(6)
  })

  it('includes all DocType values', () => {
    const expectedTypes: DocType[] = ['architecture', 'setup', 'api-reference', 'file-explanation', 'onboarding', 'custom']
    const presetIds = DOC_PRESETS.map(p => p.id)
    expect(presetIds).toEqual(expect.arrayContaining(expectedTypes))
  })

  it('has unique IDs', () => {
    const ids = DOC_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(
    DOC_PRESETS.filter(p => p.id !== 'file-explanation' && p.id !== 'custom'),
  )('$id has a non-empty label, description, and prompt', (preset) => {
    expect(preset.label).toBeTruthy()
    expect(preset.description).toBeTruthy()
    expect(preset.prompt).toBeTruthy()
  })

  it('file-explanation preset has empty prompt (set dynamically)', () => {
    const preset = DOC_PRESETS.find(p => p.id === 'file-explanation')!
    expect(preset).toBeDefined()
    expect(preset.prompt).toBe('')
  })

  it('custom preset has empty prompt (user-provided)', () => {
    const preset = DOC_PRESETS.find(p => p.id === 'custom')!
    expect(preset).toBeDefined()
    expect(preset.prompt).toBe('')
  })

  it('architecture preset prompt mentions architecture', () => {
    const preset = DOC_PRESETS.find(p => p.id === 'architecture')!
    expect(preset.prompt.toLowerCase()).toContain('architecture')
  })

  it('setup preset prompt mentions installation or getting started', () => {
    const preset = DOC_PRESETS.find(p => p.id === 'setup')!
    expect(
      preset.prompt.toLowerCase().includes('installation') ||
      preset.prompt.toLowerCase().includes('getting started'),
    ).toBe(true)
  })

  it('api-reference preset prompt mentions api or functions', () => {
    const preset = DOC_PRESETS.find(p => p.id === 'api-reference')!
    expect(
      preset.prompt.toLowerCase().includes('api') ||
      preset.prompt.toLowerCase().includes('functions'),
    ).toBe(true)
  })

  it('onboarding preset prompt mentions onboarding or AI', () => {
    const preset = DOC_PRESETS.find(p => p.id === 'onboarding')!
    expect(
      preset.prompt.toLowerCase().includes('onboarding') ||
      preset.prompt.toLowerCase().includes('ai'),
    ).toBe(true)
  })

  it('all presets have icon set to null (rendered at component level)', () => {
    for (const preset of DOC_PRESETS) {
      expect(preset.icon).toBeNull()
    }
  })
})
