import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Test that all expected symbols are re-exported from the barrel
// ---------------------------------------------------------------------------

describe('lib/changelog barrel exports', () => {
  it('exports all expected types', async () => {
    const mod = await import('../index')

    // Types are checked at compile time, but we can verify the runtime exports
    expect(mod.CHANGELOG_PRESETS).toBeDefined()
    expect(Array.isArray(mod.CHANGELOG_PRESETS)).toBe(true)
    expect(typeof mod.getAssistantText).toBe('function')
    expect(typeof mod.buildChangelogPrompt).toBe('function')
  })

  it('CHANGELOG_PRESETS from barrel matches the direct import', async () => {
    const barrel = await import('../index')
    const direct = await import('../preset-config')

    expect(barrel.CHANGELOG_PRESETS).toBe(direct.CHANGELOG_PRESETS)
  })

  it('getAssistantText from barrel matches the direct import', async () => {
    const barrel = await import('../index')
    const direct = await import('../prompt-builder')

    expect(barrel.getAssistantText).toBe(direct.getAssistantText)
  })

  it('buildChangelogPrompt from barrel matches the direct import', async () => {
    const barrel = await import('../index')
    const direct = await import('../prompt-builder')

    expect(barrel.buildChangelogPrompt).toBe(direct.buildChangelogPrompt)
  })
})
