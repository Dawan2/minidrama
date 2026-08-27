import { expect, type Page } from '@playwright/test';

/**
 * Splash first, then the hash router lands on `/home`.
 *
 * The document's only external script is the TikTok SDK. This smoke is the off-device path:
 * no `window.TTMinis` → MockBridge. Waiting for `load` (or even `domcontentloaded` without
 * intercepting) hangs if `connect.tiktok-minis.com` never answers. Aborting that URL is not a
 * fake login — it is the same discriminator `createBridge` already uses.
 */
export async function bootToHome(page: Page): Promise<void> {
  await page.route('https://connect.tiktok-minis.com/**', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('feed')).toBeVisible();
  await expect(page.getByTestId('feed-card').first()).toBeVisible();
}
