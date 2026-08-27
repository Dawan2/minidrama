import { expect, type Page } from '@playwright/test';

/** Splash first, then the hash router lands on `/home`. A hung boot is a red smoke, not a skip. */
export async function bootToHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('feed')).toBeVisible();
  await expect(page.getByTestId('feed-card').first()).toBeVisible();
}
