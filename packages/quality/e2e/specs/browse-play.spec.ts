import { expect, test } from '@playwright/test';

import { bootToHome } from './boot';

/**
 * E-10 analog (`docs/14-test-plan.md` §5.2): Home feed → drama → free-episode play attempt.
 *
 * GATE-8 is unanswered: the default media port has no BytePlus `vid`, so the play screen is the
 * honest 503 / retryable surface, not a synthesised player. The business result is that the
 * commercial gate ran (`play-page` with a failed session) rather than a white screen or a
 * client-built album.
 */
test('feed opens a drama and a free episode play attempt reaches the honest gate', async ({
  page,
}) => {
  await bootToHome(page);

  await page.getByTestId('feed-card').first().locator('a').click();
  await expect(page.getByTestId('drama-page')).toBeVisible();
  await expect(page.getByTestId('episode-row').first()).toBeVisible();

  await page.locator('[data-testid="episode-row"][data-action="PLAY"] a').first().click();

  const play = page.getByTestId('play-page');
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('data-state', 'failed');
  await expect(page.getByTestId('retryable-error')).toBeVisible();
  await expect(page.getByTestId('player-surface')).toHaveCount(0);
});
