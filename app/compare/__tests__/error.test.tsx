import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompareError from '../error'

// Mock next/link to render a simple anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

describe('CompareError', () => {
  const mockError = new Error('Something went wrong')
  const mockReset = vi.fn()

  it('renders the error heading', () => {
    render(<CompareError error={mockError} reset={mockReset} />)
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('Comparison failed')).toBeInTheDocument()
  })

  it('renders a descriptive error message', () => {
    render(<CompareError error={mockError} reset={mockReset} />)
    expect(
      screen.getByText(/Something went wrong while comparing repositories/),
    ).toBeInTheDocument()
  })

  it('renders a "Try again" button that calls reset', async () => {
    const user = userEvent.setup()
    render(<CompareError error={mockError} reset={mockReset} />)

    const retryBtn = screen.getByRole('button', { name: /try again/i })
    expect(retryBtn).toBeInTheDocument()

    await user.click(retryBtn)
    expect(mockReset).toHaveBeenCalledOnce()
  })

  it('renders a "Back to home" link pointing to /', () => {
    render(<CompareError error={mockError} reset={mockReset} />)
    const homeLink = screen.getByRole('link', { name: /back to home/i })
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('logs the error to console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<CompareError error={mockError} reset={mockReset} />)
    expect(errorSpy).toHaveBeenCalledWith('[CompareErrorBoundary]', mockError)
    errorSpy.mockRestore()
  })
})
