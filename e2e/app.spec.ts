import { test, expect } from '@playwright/test';

test.describe('App', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/RepoLens/i);
  });
});
