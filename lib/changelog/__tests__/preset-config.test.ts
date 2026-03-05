import { describe, it, expect } from 'vitest'
import { CHANGELOG_PRESETS } from '../preset-config'
import type { ChangelogPreset, ChangelogType } from '../types'

// ---------------------------------------------------------------------------
// CHANGELOG_PRESETS
// ---------------------------------------------------------------------------

describe('CHANGELOG_PRESETS', () => {
  it('contains exactly 4 presets', () => {
    expect(CHANGELOG_PRESETS).toHaveLength(4)
  })

  it.each<ChangelogType>([
    'conventional',
    'release-notes',
    'keep-a-changelog',
    'custom',
  ])('includes a "%s" preset', (id) => {
    const preset = CHANGELOG_PRESETS.find(p => p.id === id)
    expect(preset).toBeDefined()
  })

  it('each preset has all required fields', () => {
    for (const preset of CHANGELOG_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.label).toBeTruthy()
      expect(preset.description).toBeTruthy()
      expect(preset.icon).toBeNull()
      expect(typeof preset.prompt).toBe('string')
    }
  })

  it('non-custom presets have a non-empty prompt', () => {
    const nonCustom = CHANGELOG_PRESETS.filter(p => p.id !== 'custom')
    for (const preset of nonCustom) {
      expect(preset.prompt.length).toBeGreaterThan(0)
    }
  })

  it('custom preset has an empty prompt', () => {
    const custom = CHANGELOG_PRESETS.find(p => p.id === 'custom')
    expect(custom).toBeDefined()
    expect(custom!.prompt).toBe('')
  })

  it('all preset ids are unique', () => {
    const ids = CHANGELOG_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('presets satisfy the ChangelogPreset interface', () => {
    for (const preset of CHANGELOG_PRESETS) {
      const typed: ChangelogPreset = preset
      expect(typed.id).toBe(preset.id)
    }
  })

  it('conventional preset mentions Conventional Commits', () => {
    const preset = CHANGELOG_PRESETS.find(p => p.id === 'conventional')!
    expect(preset.prompt).toContain('Conventional Commits')
  })

  it('keep-a-changelog preset mentions keepachangelog.com', () => {
    const preset = CHANGELOG_PRESETS.find(p => p.id === 'keep-a-changelog')!
    expect(preset.prompt).toContain('keepachangelog.com')
  })

  it('release-notes preset mentions user-facing', () => {
    const preset = CHANGELOG_PRESETS.find(p => p.id === 'release-notes')!
    expect(preset.prompt).toContain('user-facing')
  })
})
