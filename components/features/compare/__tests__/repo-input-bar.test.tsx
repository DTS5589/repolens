import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the comparison provider
const mockAddRepo = vi.fn().mockResolvedValue(true)
vi.mock('@/providers/comparison-provider', () => ({
  useComparison: () => ({
    addRepo: mockAddRepo,
    isAtCapacity: false,
    repos: new Map(),
  }),
}))

vi.mock('@/types/comparison', () => ({
  MAX_COMPARISON_REPOS: 5,
}))

import { RepoInputBar } from '../repo-input-bar'

describe('RepoInputBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders two input fields by default', () => {
    render(<RepoInputBar />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(2)
  })

  it('renders correct placeholder text for first two inputs', () => {
    render(<RepoInputBar />)
    expect(screen.getByPlaceholderText('Enter first repository URL')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter second repository URL')).toBeInTheDocument()
  })

  it('renders the Compare button', () => {
    render(<RepoInputBar />)
    expect(screen.getByRole('button', { name: /compare/i })).toBeInTheDocument()
  })

  it('disables Compare button when fewer than 2 URLs are filled', () => {
    render(<RepoInputBar />)
    const btn = screen.getByRole('button', { name: /compare/i })
    expect(btn).toBeDisabled()
  })

  it('enables Compare button when at least 2 URLs are filled', async () => {
    const user = userEvent.setup()
    render(<RepoInputBar />)

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'https://github.com/owner/repo1')
    await user.type(inputs[1], 'https://github.com/owner/repo2')

    const btn = screen.getByRole('button', { name: /compare/i })
    expect(btn).toBeEnabled()
  })

  it('adds another input when "Add another repo" is clicked', async () => {
    const user = userEvent.setup()
    render(<RepoInputBar />)

    const addBtn = screen.getByRole('button', { name: /add another repo/i })
    await user.click(addBtn)

    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(3)
  })

  it('shows remove button only for inputs beyond the minimum (2)', async () => {
    const user = userEvent.setup()
    render(<RepoInputBar />)

    // Initially no remove buttons (only 2 inputs = MIN_INPUTS)
    expect(screen.queryByLabelText(/remove repository/i)).not.toBeInTheDocument()

    // Add a third input
    await user.click(screen.getByRole('button', { name: /add another repo/i }))

    // Now there should be a remove button for the third input
    expect(screen.getByLabelText('Remove repository 3')).toBeInTheDocument()
  })

  it('removes an input field when remove button is clicked', async () => {
    const user = userEvent.setup()
    render(<RepoInputBar />)

    // Add a third input
    await user.click(screen.getByRole('button', { name: /add another repo/i }))
    expect(screen.getAllByRole('textbox')).toHaveLength(3)

    // Remove the third input
    await user.click(screen.getByLabelText('Remove repository 3'))
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })

  it('calls addRepo for each filled URL on form submission', async () => {
    const user = userEvent.setup()
    render(<RepoInputBar />)

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'https://github.com/owner/repo1')
    await user.type(inputs[1], 'https://github.com/owner/repo2')
    await user.click(screen.getByRole('button', { name: /compare/i }))

    expect(mockAddRepo).toHaveBeenCalledTimes(2)
    expect(mockAddRepo).toHaveBeenCalledWith('https://github.com/owner/repo1')
    expect(mockAddRepo).toHaveBeenCalledWith('https://github.com/owner/repo2')
  })

  it('does not submit when fewer than 2 non-empty URLs exist', async () => {
    const user = userEvent.setup()
    render(<RepoInputBar />)

    const inputs = screen.getAllByRole('textbox')
    await user.type(inputs[0], 'https://github.com/owner/repo1')
    // Leave second input empty

    // Button should be disabled, but click anyway
    const btn = screen.getByRole('button', { name: /compare/i })
    await user.click(btn)

    expect(mockAddRepo).not.toHaveBeenCalled()
  })

  it('updates input value on change', async () => {
    const user = userEvent.setup()
    render(<RepoInputBar />)

    const input = screen.getByLabelText('Repository URL 1')
    await user.type(input, 'https://github.com/test/repo')

    expect(input).toHaveValue('https://github.com/test/repo')
  })

  // -----------------------------------------------------------------------
  // URL validation
  // -----------------------------------------------------------------------

  describe('URL validation', () => {
    it('shows inline error for an invalid URL on submit', async () => {
      const user = userEvent.setup()
      render(<RepoInputBar />)

      const inputs = screen.getAllByRole('textbox')
      await user.type(inputs[0], 'not-a-github-url')
      await user.type(inputs[1], 'https://github.com/owner/repo')
      await user.click(screen.getByRole('button', { name: /compare/i }))

      expect(screen.getByRole('alert')).toHaveTextContent(/invalid github url/i)
      expect(mockAddRepo).not.toHaveBeenCalled()
    })

    it('shows error for a non-GitHub URL', async () => {
      const user = userEvent.setup()
      render(<RepoInputBar />)

      const inputs = screen.getAllByRole('textbox')
      await user.type(inputs[0], 'https://gitlab.com/owner/repo')
      await user.type(inputs[1], 'https://github.com/owner/repo')
      await user.click(screen.getByRole('button', { name: /compare/i }))

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(mockAddRepo).not.toHaveBeenCalled()
    })

    it('clears error when the user edits the invalid input', async () => {
      const user = userEvent.setup()
      render(<RepoInputBar />)

      const inputs = screen.getAllByRole('textbox')
      await user.type(inputs[0], 'bad-url')
      await user.type(inputs[1], 'https://github.com/owner/repo')
      await user.click(screen.getByRole('button', { name: /compare/i }))

      expect(screen.getByRole('alert')).toBeInTheDocument()

      // Edit the invalid input — error should disappear
      await user.clear(inputs[0])
      await user.type(inputs[0], 'https://github.com/valid/repo')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('submits successfully when all URLs are valid', async () => {
      const user = userEvent.setup()
      render(<RepoInputBar />)

      const inputs = screen.getAllByRole('textbox')
      await user.type(inputs[0], 'https://github.com/owner/repo1')
      await user.type(inputs[1], 'owner/repo2')
      await user.click(screen.getByRole('button', { name: /compare/i }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(mockAddRepo).toHaveBeenCalledTimes(2)
    })

    it('marks the invalid input with aria-invalid', async () => {
      const user = userEvent.setup()
      render(<RepoInputBar />)

      const inputs = screen.getAllByRole('textbox')
      await user.type(inputs[0], 'not-valid')
      await user.type(inputs[1], 'https://github.com/owner/repo')
      await user.click(screen.getByRole('button', { name: /compare/i }))

      expect(inputs[0]).toHaveAttribute('aria-invalid', 'true')
      expect(inputs[1]).toHaveAttribute('aria-invalid', 'false')
    })
  })
})
