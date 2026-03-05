import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreviewTabBar } from './preview-tab-bar'
import { PREVIEW_TABS } from './tab-config'

// Stub navigator.platform for consistent tests
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')

function renderTabBar(overrides: Partial<Parameters<typeof PreviewTabBar>[0]> = {}) {
  const defaultProps = {
    tabs: PREVIEW_TABS,
    activeTab: 'repo',
    onTabChange: vi.fn(),
    hasRepo: true,
    fileCount: 10,
    onOpenSearch: vi.fn(),
    localPreviewUrl: null,
    hasApiKey: false, // locked by default for AI tabs
    ...overrides,
  }
  return { ...render(<PreviewTabBar {...defaultProps} />), props: defaultProps }
}

describe('PreviewTabBar', () => {
  it('renders all tabs', () => {
    renderTabBar()
    for (const tab of PREVIEW_TABS) {
      expect(screen.getByRole('tab', { name: tab.label })).toBeInTheDocument()
    }
  })

  it('marks the active tab with aria-selected="true"', () => {
    renderTabBar({ activeTab: 'issues' })
    expect(screen.getByRole('tab', { name: 'Issues' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Repo' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('calls onTabChange when a tab is clicked', () => {
    const { props } = renderTabBar()
    fireEvent.click(screen.getByRole('tab', { name: 'Issues' }))
    expect(props.onTabChange).toHaveBeenCalledWith('issues')
  })

  // ---------------------------------------------------------------------------
  // Lock icon color — Improvement #5
  // ---------------------------------------------------------------------------

  describe('lock icon on AI-requiring tabs', () => {
    it('shows lock icons on AI tabs with text-destructive class when no API key', () => {
      const { container } = renderTabBar({ hasApiKey: false })

      // AI-requiring tabs: docs, changelog
      const aiTabs = PREVIEW_TABS.filter((t) => t.requiresAI)
      expect(aiTabs.length).toBeGreaterThan(0)

      for (const tab of aiTabs) {
        const tabButton = screen.getByRole('tab', { name: tab.label })
        // The Lock icon is inside a relative wrapper within the button
        const lockIcon = tabButton.querySelector('svg.text-destructive')
        expect(lockIcon).toBeTruthy()
      }
    })

    it('does NOT show lock icons when hasApiKey is true', () => {
      renderTabBar({ hasApiKey: true })
      const aiTabs = PREVIEW_TABS.filter((t) => t.requiresAI)
      for (const tab of aiTabs) {
        const tabButton = screen.getByRole('tab', { name: tab.label })
        const lockIcon = tabButton.querySelector('svg.text-destructive')
        expect(lockIcon).toBeNull()
      }
    })

    it('does NOT show lock icons on non-AI tabs regardless of API key', () => {
      renderTabBar({ hasApiKey: false })
      const nonAiTabs = PREVIEW_TABS.filter((t) => !t.requiresAI)
      for (const tab of nonAiTabs) {
        const tabButton = screen.getByRole('tab', { name: tab.label })
        const lockIcon = tabButton.querySelector('svg.text-destructive')
        expect(lockIcon).toBeNull()
      }
    })

    it('adds opacity-50 to locked tabs', () => {
      renderTabBar({ hasApiKey: false })
      const aiTabs = PREVIEW_TABS.filter((t) => t.requiresAI)
      for (const tab of aiTabs) {
        const tabButton = screen.getByRole('tab', { name: tab.label })
        expect(tabButton.className).toContain('opacity-50')
      }
    })

    it('sets title to "Requires API key" on locked tabs', () => {
      renderTabBar({ hasApiKey: false })
      const aiTabs = PREVIEW_TABS.filter((t) => t.requiresAI)
      for (const tab of aiTabs) {
        const tabButton = screen.getByRole('tab', { name: tab.label })
        expect(tabButton.title).toContain('Requires API key')
      }
    })
  })
})
