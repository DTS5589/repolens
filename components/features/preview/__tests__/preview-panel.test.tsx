import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock all heavyweight dependencies
vi.mock('@/providers', () => ({
  useApp: () => ({
    previewUrl: null,
    isGenerating: false,
  }),
  useRepository: () => ({
    repo: null,
    files: [],
    isLoading: false,
    error: null,
    connectRepository: vi.fn(),
    disconnectRepository: vi.fn(),
    codeIndex: { totalFiles: 0, files: new Map() },
    loadingStage: 'idle',
    indexingProgress: 0,
    isCacheHit: false,
  }),
}))

vi.mock('@/lib/code/code-index', () => ({
  flattenFiles: vi.fn(() => []),
}))

vi.mock('@/lib/export', () => ({
  parseShareableUrl: vi.fn(() => null),
  updateUrlState: vi.fn(),
  clearUrlState: vi.fn(),
}))

// Mock all lazy-loaded components
vi.mock('@/components/features/code/code-browser', () => ({
  CodeBrowser: () => <div>CodeBrowser</div>,
}))
vi.mock('@/components/features/docs/doc-viewer', () => ({
  DocViewer: () => <div>DocViewer</div>,
}))
vi.mock('@/components/features/diagrams/diagram-viewer', () => ({
  DiagramViewer: () => <div>DiagramViewer</div>,
}))
vi.mock('@/components/features/issues/issues-panel', () => ({
  IssuesPanel: () => <div>IssuesPanel</div>,
}))

vi.mock('@/components/features/loading/loading-progress', () => ({
  LoadingProgress: () => <div data-testid="loading-progress">progress</div>,
}))

vi.mock('@/components/features/repo/project-summary', () => ({
  ProjectSummaryPanel: () => <div data-testid="project-summary">project summary</div>,
}))

vi.mock('@/components/features/landing/landing-page', () => ({
  LandingPage: (props: any) => (
    <div data-testid="landing-page">
      <button onClick={props.onConnect}>Connect</button>
      <input
        data-testid="repo-url-input"
        value={props.repoUrl}
        onChange={(e: any) => props.onRepoUrlChange(e.target.value)}
      />
    </div>
  ),
}))

vi.mock('./default-content', () => ({
  DefaultContent: () => <div data-testid="default-content">default</div>,
}))

vi.mock('./loading-with-status', () => ({
  LoadingWithStatus: () => <div data-testid="loading-status">loading</div>,
}))

vi.mock('./tab-config', () => ({
  PREVIEW_TABS: [
    { id: 'repo', label: 'Overview', icon: null },
    { id: 'issues', label: 'Issues', icon: null },
    { id: 'docs', label: 'Docs', icon: null },
    { id: 'diagram', label: 'Diagrams', icon: null },
    { id: 'code', label: 'Code', icon: null },
  ],
}))

vi.mock('./global-search-overlay', () => ({
  GlobalSearchOverlay: () => null,
}))

vi.mock('./preview-repo-header', () => ({
  PreviewRepoHeader: () => <div data-testid="repo-header">header</div>,
}))

vi.mock('./preview-tab-bar', () => ({
  PreviewTabBar: ({ activeTab, onTabChange }: any) => (
    <div data-testid="tab-bar">
      <button onClick={() => onTabChange('issues')}>issues-tab</button>
      <button onClick={() => onTabChange('docs')}>docs-tab</button>
      <span>{activeTab}</span>
    </div>
  ),
}))

vi.mock('@/components/features/loading/tab-skeleton', () => ({
  IssuesTabSkeleton: () => <div>issues-skeleton</div>,
  DocsTabSkeleton: () => <div>docs-skeleton</div>,
  DiagramTabSkeleton: () => <div>diagram-skeleton</div>,
  CodeTabSkeleton: () => <div>code-skeleton</div>,
}))

vi.mock('@/components/ui/feature-error-boundary', () => ({
  FeatureErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { PreviewPanel } from '../preview-panel'

describe('PreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows landing page when no repo is connected', () => {
    render(<PreviewPanel />)
    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
  })

  it('accepts a className prop', () => {
    const { container } = render(<PreviewPanel className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})


