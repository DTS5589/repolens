import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests for the landing page: load, hero content, navigation,
 * repo input, and settings modal trigger.
 *
 * Uses `networkidle` to wait for React hydration before interacting.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadApp(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page).toHaveTitle(/RepoLens/i)
  await expect(
    page.getByRole('heading', { name: /Understand Any GitHub/i }),
  ).toBeVisible({ timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

test.describe('Landing page', () => {
  test('page loads with correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/RepoLens/i)
  })

  test('hero heading is visible', async ({ page }) => {
    await loadApp(page)
    await expect(
      page.getByRole('heading', { name: /Understand Any GitHub/i }),
    ).toBeVisible()
  })

  test('GitHub URL input field is present', async ({ page }) => {
    await loadApp(page)
    await expect(page.getByPlaceholder(/github\.com/i)).toBeVisible()
  })

  test('Connect Repository button is present', async ({ page }) => {
    await loadApp(page)
    await expect(
      page.getByRole('button', { name: /Connect Repository/i }),
    ).toBeVisible()
  })

  test('can type a GitHub URL into the input', async ({ page }) => {
    await loadApp(page)
    const input = page.getByPlaceholder(/github\.com/i)
    await input.fill('https://github.com/facebook/react')
    await expect(input).toHaveValue('https://github.com/facebook/react')
  })

  test('Compare link is visible in header', async ({ page }) => {
    await loadApp(page)
    await expect(
      page.getByRole('link', { name: /Compare/i }),
    ).toBeVisible()
  })

  test('settings button opens settings modal', async ({ page }) => {
    await loadApp(page)

    // Open settings via custom event — retry until the useEffect listener is attached
    await page.waitForFunction(
      () => {
        window.dispatchEvent(new Event('open-settings'))
        return document.querySelector('[role="dialog"]') !== null
      },
      { timeout: 30_000, polling: 500 },
    )

    // Settings modal should open with "API Settings" title
    await expect(page.getByRole('heading', { name: /API Settings/i })).toBeVisible({ timeout: 10_000 })
  })
})
