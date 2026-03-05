import { describe, it, expect } from 'vitest'
import { PREVIEW_TABS } from '../tab-config'

describe('tab-config', () => {
  it('includes a "deps" tab', () => {
    const depsTab = PREVIEW_TABS.find(t => t.id === 'deps')
    expect(depsTab).toBeDefined()
    expect(depsTab!.label).toBe('Deps')
  })

  it('has the expected set of tabs', () => {
    const ids = PREVIEW_TABS.map(t => t.id)
    expect(ids).toContain('repo')
    expect(ids).toContain('issues')
    expect(ids).toContain('docs')
    expect(ids).toContain('diagram')
    expect(ids).toContain('code')
    expect(ids).toContain('deps')
  })

  it('every tab has id, label, and icon', () => {
    for (const tab of PREVIEW_TABS) {
      expect(tab.id).toBeTruthy()
      expect(tab.label).toBeTruthy()
      expect(tab.icon).toBeDefined()
    }
  })
})
