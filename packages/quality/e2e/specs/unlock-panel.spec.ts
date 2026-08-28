import { expect, test } from '@playwright/test';

import { bootToHome } from './boot';

/**
 * E-20 analog (`docs/14-test-plan.md` §5.3): Home feed → drama → locked episode → PNL-02.
 *
 * GATE-2 / GATE-4 are unanswered, so this spec opens the coin unlock panel and does **not**
 * pay, invent a Beans rate, or enable recharge. Live `GET /v1/config` keeps `adUnlock` false.
 * Completing IAP and a granted unlock that then plays are later remainders. D8 / `#/vip` stay
 * absent. GATE-8 is unanswered: the panel is the intercept, not a synthesised player.
 */
test('a locked episode opens the unlock panel without paying or inventing a channel', async ({
  page,
}) => {
  await bootToHome(page);

  await page.getByTestId('feed-card').first().locator('a').click();
  await expect(page.getByTestId('drama-page')).toBeVisible();
  await expect(page.getByTestId('episode-row').first()).toBeVisible();

  const unlockRow = page.locator('[data-testid="episode-row"][data-action="UNLOCK"]');
  await expect(unlockRow.first()).toBeVisible();
  await unlockRow.first().getByTestId('episode-action').click();

  const panel = page.getByTestId('unlock-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-offer="COINS"]')).toBeVisible();
  await expect(page.getByTestId('unlock-confirm')).toBeVisible();
  await expect(page.getByTestId('unlock-price')).toBeVisible();
  await expect(page.getByTestId('unlock-ad-action')).toHaveCount(0);
  await expect(page.locator('a[href="#/vip"]')).toHaveCount(0);
  await expect(page.getByTestId('player-surface')).toHaveCount(0);
});
