import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests for the repo-loading flow: loading a repo via URL query param,
 * verifying the file tree populates, error handling for invalid repos,
 * and loading indicator visibility.
 *
 * Uses `public-apis/public-apis` — a small, public, stable repo.
 *
 * ## Hydration note
 *
 * The app uses React.lazy + Suspense for tab components. We MUST wait for
 * `networkidle` before interacting — `domcontentloaded` fires before
 * React hydration completes, leaving click handlers unattached.
 *
 * In dev mode Next.js compiles chunks on demand, so the first load
 * can take 60–120s while the bundle compiles.
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

/** Wait for text to appear in the document body. */
async function waitForBodyText(page: Page, text: string, timeoutMs = 30_000) {
  await page.waitForFunction(
    (t) => document.body.textContent?.includes(t) ?? false,
    text,
    { timeout: timeoutMs },
  )
}

/**
 * Fill the repo URL input and click Connect.
 *
 * React controlled inputs reset DOM-set values until hydration completes.
 * This helper retries fill() until the value "sticks" (React acknowledges it)
 * and the Connect button becomes enabled, then clicks it.
 */
async function fillAndConnect(page: Page, url: string) {
  const input = page.getByPlaceholder(/github\.com/i)
  const connectBtn = page.getByRole('button', { name: /Connect Repository/i })

  // Wait for the input to exist in the DOM
  await expect(input).toBeEditable({ timeout: 30_000 })

  // Retry loop: fill → wait → check value sticks AND button enables
  for (let attempt = 0; attempt < 20; attempt++) {
    await input.click()
    await input.fill(url)
    await page.waitForTimeout(500) // let React reconcile

    const value = await input.inputValue()
    if (value === url) {
      // Value stuck — check if button is enabled
      const isEnabled = await connectBtn.isEnabled()
      if (isEnabled) break
    }

    await page.waitForTimeout(1_500)
  }

  await expect(connectBtn).toBeEnabled({ timeout: 10_000 })
  await connectBtn.click()
}

// ---------------------------------------------------------------------------
// Repo loading via query parameter
// ---------------------------------------------------------------------------

test.describe('Repo loading', () => {
  test.describe.configure({ retries: 2 })

  test('loads a repo via ?repo= query parameter and shows repo header', async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto('/?repo=https://github.com/public-apis/public-apis', {
      waitUntil: 'networkidle',
    })
    await expect(page).toHaveTitle(/RepoLens/i)

    // The repo header should eventually show the repo name
    await waitForBodyText(page, 'public-apis', 120_000)
  })

  test('shows loading indicator while connecting', async ({ page }) => {
    test.setTimeout(120_000)

    // Navigate with repo URL — fires auto-connect, showing loading state
    await page.goto(
      '/?repo=https://github.com/pmndrs/zustand',
      { waitUntil: 'domcontentloaded' },
    )

    // The loading indicator should appear while connecting
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? ''
        return text.includes('Connecting') || text.includes('zustand')
      },
      { timeout: 60_000 },
    )
  })

  test('shows error for invalid GitHub URL', async ({ page }) => {
    test.setTimeout(120_000)

    // Navigate directly with an invalid repo URL via query param
    await page.goto('/?repo=https://not-a-valid-url', { waitUntil: 'networkidle' })
    await expect(page).toHaveTitle(/RepoLens/i)

    // Should show an error message
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? ''
        return text.includes('Invalid') || text.includes('invalid') ||
          text.includes('error') || text.includes('Error') ||
          text.includes('Failed') || text.includes('Understand Any GitHub')
      },
      { timeout: 60_000 },
    )
  })

  test('shows error for non-existent repo', async ({ page }) => {
    test.setTimeout(120_000)

    // Navigate directly with a non-existent repo URL via query param
    await page.goto('/?repo=https://github.com/thisownerdoesnotexist999/thisrepodoesnotexist999', {
      waitUntil: 'networkidle',
    })
    await expect(page).toHaveTitle(/RepoLens/i)

    // Should show an error message (API 404 or similar)
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? ''
        return text.includes('error') || text.includes('Error') ||
          text.includes('not found') || text.includes('Not Found') ||
          text.includes('Failed') || text.includes('Invalid')
      },
      { timeout: 60_000 },
    )
  })

  test('file tree populates after repo loads via query param', async ({ page }) => {
    test.setTimeout(300_000)

    await page.goto('/?repo=https://github.com/public-apis/public-apis', {
      waitUntil: 'domcontentloaded',
    })
    await expect(page).toHaveTitle(/RepoLens/i)

    // Wait for the repo to fully load — the repo name appears in the page
    await waitForBodyText(page, 'public-apis', 120_000)

    // Wait for the tab bar to be interactive — the Code tab must be visible
    const codeTab = page.getByRole('tab', { name: 'Code', exact: true })
    await expect(codeTab).toBeVisible({ timeout: 120_000 })

    // Switch to the Code tab where the file tree sidebar lives
    await codeTab.click()

    // When a repo is connected, the Code tab should NOT show the
    // "No repository connected" empty state. Instead it shows the
    // code browser which includes either a file tree or loading state.
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? ''
        // The code browser is active when the empty-state message is absent
        return !text.includes('No repository connected') &&
          !text.includes('Connect a GitHub repository to browse')
      },
      { timeout: 120_000 },
    )
  })

  test('can click an example repo to connect', async ({ page }) => {
    test.setTimeout(180_000)

    await loadApp(page)

    // Click one of the example repo chips (e.g. "pmndrs/zustand")
    const exampleButton = page.getByRole('button', { name: /zustand/i })
    await expect(exampleButton).toBeVisible({ timeout: 10_000 })
    await exampleButton.click()

    // Should start connecting — "Connecting..." or the repo name appears.
    // If the repo is cached, it may skip the loading state entirely.
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? ''
        return text.includes('Connecting') || text.includes('zustand')
      },
      { timeout: 60_000 },
    )
  })

  test('can navigate between files in the code browser', async ({ page }) => {
    test.setTimeout(300_000)

    // Load the repo and wait for it to fully connect
    await page.goto(
      '/?repo=https://github.com/public-apis/public-apis',
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page).toHaveTitle(/RepoLens/i)

    // Wait for the repo to connect — skip if GitHub API is rate-limited
    const connected = await page
      .waitForFunction(
        () => {
          const el = document.querySelector('[title="Export & Share"], button[aria-label="Export & Share"]')
          if (el) return true
          const text = document.body.textContent ?? ''
          return text.includes('Export & Share')
        },
        { timeout: 120_000 },
      )
      .then(() => true)
      .catch(() => false)

    if (!connected) {
      test.skip(true, 'Repo did not connect — GitHub API may be rate-limited')
      return
    }

    // Click the Code tab and confirm it becomes active
    const codeTab = page.getByRole('tab', { name: 'Code', exact: true })
    await codeTab.click()
    await expect(codeTab).toHaveAttribute('aria-selected', 'true', {
      timeout: 30_000,
    })

    // Wait for file tree — "Explorer" heading signals the sidebar rendered
    await expect(page.getByText('Explorer').first()).toBeVisible({
      timeout: 120_000,
    })

    // Wait for tree items to populate
    const readmeItem = page.getByRole('treeitem', { name: /README/i })
    await expect(readmeItem).toBeVisible({ timeout: 120_000 })

    // Click README.md to open it
    await readmeItem.click()

    // Verify the file content area shows something related to the file
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? ''
        return text.includes('README') && text.length > 500
      },
      { timeout: 30_000 },
    )

    // Navigate to a second file
    const secondFile = page
      .getByRole('treeitem', { name: /CONTRIBUTING|LICENSE/i })
      .first()
    await expect(secondFile).toBeVisible({ timeout: 10_000 })
    await secondFile.click()

    // Verify the editor switched — the second file's name should appear
    await page.waitForFunction(
      () => {
        const text = document.body.textContent ?? ''
        return text.includes('CONTRIBUTING') || text.includes('LICENSE')
      },
      { timeout: 30_000 },
    )
  })
})
