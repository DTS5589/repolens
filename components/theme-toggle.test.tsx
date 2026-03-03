import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next-themes
const mockSetTheme = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
    resolvedTheme: 'light',
  }),
}))

import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  it('renders without crashing', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
  })

  it('renders the sr-only label text', () => {
    render(<ThemeToggle />)
    expect(screen.getByText('Toggle theme')).toBeInTheDocument()
  })

  it('opens the dropdown menu on click', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: /toggle theme/i }))

    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('calls setTheme with "dark" when Dark option is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    await user.click(screen.getByText('Dark'))

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('calls setTheme with "light" when Light option is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    await user.click(screen.getByText('Light'))

    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('calls setTheme with "system" when System option is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: /toggle theme/i }))
    await user.click(screen.getByText('System'))

    expect(mockSetTheme).toHaveBeenCalledWith('system')
  })
})
