import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { FeatureErrorBoundary } from '../feature-error-boundary'

// ---------------------------------------------------------------------------
// Test helper — throws during render on demand
// ---------------------------------------------------------------------------

let shouldThrow = false
const TEST_ERROR = new Error('Something broke')

function ThrowingChild() {
  if (shouldThrow) {
    throw TEST_ERROR
  }
  return <div data-testid="child">Child rendered</div>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeatureErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('renders children normally when no error occurs', () => {
    render(
      <FeatureErrorBoundary featureName="Issues">
        <ThrowingChild />
      </FeatureErrorBoundary>,
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Child rendered')).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Error fallback UI
  // -----------------------------------------------------------------------

  it('shows error fallback UI when a child component throws during render', () => {
    shouldThrow = true

    render(
      <FeatureErrorBoundary featureName="Issues">
        <ThrowingChild />
      </FeatureErrorBoundary>,
    )

    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    expect(screen.getByText('Issues failed to load')).toBeInTheDocument()
    expect(screen.getByText('Something broke')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('displays the featureName in the error fallback', () => {
    shouldThrow = true

    render(
      <FeatureErrorBoundary featureName="Diagrams">
        <ThrowingChild />
      </FeatureErrorBoundary>,
    )

    expect(screen.getByText('Diagrams failed to load')).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Message truncation
  // -----------------------------------------------------------------------

  it('truncates error messages longer than 200 characters', () => {
    const longMessage = 'x'.repeat(250)
    const longError = new Error(longMessage)

    function LongErrorChild(): React.JSX.Element {
      throw longError
    }

    render(
      <FeatureErrorBoundary featureName="Code">
        <LongErrorChild />
      </FeatureErrorBoundary>,
    )

    // The displayed message should be 200 chars + ellipsis character
    const displayed = screen.getByText(/^x+…$/)
    expect(displayed.textContent).toHaveLength(201) // 200 + '…'
  })

  it('does not truncate error messages of exactly 200 characters', () => {
    const exactMessage = 'y'.repeat(200)

    function ExactErrorChild(): React.JSX.Element {
      throw new Error(exactMessage)
    }

    render(
      <FeatureErrorBoundary featureName="Code">
        <ExactErrorChild />
      </FeatureErrorBoundary>,
    )

    expect(screen.getByText(exactMessage)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Retry
  // -----------------------------------------------------------------------

  it('"Try Again" button resets the error state and re-renders children', () => {
    shouldThrow = true

    render(
      <FeatureErrorBoundary featureName="Issues">
        <ThrowingChild />
      </FeatureErrorBoundary>,
    )

    // Error state visible
    expect(screen.getByText('Issues failed to load')).toBeInTheDocument()

    // Stop throwing so the retry succeeds
    shouldThrow = false

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    // Children should render again
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByText('Issues failed to load')).not.toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // Custom fallback
  // -----------------------------------------------------------------------

  it('renders a custom fallback prop instead of the default error UI', () => {
    shouldThrow = true

    render(
      <FeatureErrorBoundary
        featureName="Docs"
        fallback={<div data-testid="custom-fallback">Custom error view</div>}
      >
        <ThrowingChild />
      </FeatureErrorBoundary>,
    )

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
    expect(screen.getByText('Custom error view')).toBeInTheDocument()
    // Default UI elements should NOT be present
    expect(screen.queryByText('Docs failed to load')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // componentDidCatch logging
  // -----------------------------------------------------------------------

  it('calls console.error with the feature name and error in componentDidCatch', () => {
    shouldThrow = true
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <FeatureErrorBoundary featureName="Diagrams">
        <ThrowingChild />
      </FeatureErrorBoundary>,
    )

    // Our componentDidCatch call — look for a call that includes the feature name
    const featureCall = consoleSpy.mock.calls.find(
      (args) =>
        typeof args[0] === 'string' &&
        args[0].includes('[FeatureErrorBoundary]') &&
        args[0].includes('Diagrams'),
    )
    expect(featureCall).toBeDefined()
    // Second argument should be the error
    expect(featureCall![1]).toBe(TEST_ERROR)
  })
})
