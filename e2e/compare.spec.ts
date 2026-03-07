import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests for the comparison page: load, UI elements, repo inputs,
 * and navigation back to the landing page.
 *
 * Uses `networkidle` to wait for React hydration before interacting.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadComparePage(page: Page) {
  await page.goto('/compare', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveTitle(/RepoLens/i)
  await expect(
    page.getByRole('heading', { name: /Compare Repositories/i }),
  ).toBeVisible({ timeout: 30_000 })
}

// ---------------------------------------------------------------------------
// Comparison page
// ---------------------------------------------------------------------------

test.describe('Comparison page', () => {
  test.setTimeout(60_000)

  test('page loads with correct heading', async ({ page }) => {
    await loadComparePage(page)
    await expect(
      page.getByRole('heading', { name: /Compare Repositories/i }),
    ).toBeVisible()
  })

  test('description text is shown', async ({ page }) => {
    await loadComparePage(page)
    await expect(
      page.getByText(/Add up to .* GitHub repositories/i),
    ).toBeVisible()
  })

  test('has at least two repo input fields', async ({ page }) => {
    await loadComparePage(page)
    // RepoInputBar renders at least 2 text inputs for repo URLs
    const inputs = page.locator('input[type="text"], input[type="url"], input:not([type])')
    await expect(inputs.first()).toBeVisible()
    const count = await inputs.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('back link navigates to home', async ({ page }) => {
    await loadComparePage(page)
    const backLink = page.getByRole('link', { name: /Back/i })
    await expect(backLink).toBeVisible()
    await backLink.click()
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { name: /Understand Any GitHub/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('header is visible on compare page', async ({ page }) => {
    await loadComparePage(page)
    await expect(page.locator('header')).toBeVisible()
  })

  test('no JS errors on compare page load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await loadComparePage(page)

    const real = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('404') &&
        !e.includes('net::ERR') &&
        !e.includes('[HMR]') &&
        !e.includes('Fast Refresh') &&
        !e.includes('ClientFetchError') &&
        !e.includes('AuthError') &&
        !e.includes('Content Security Policy') &&
        !e.includes('script.debug.js'),
    )
    expect(real).toEqual([])
  })
})
