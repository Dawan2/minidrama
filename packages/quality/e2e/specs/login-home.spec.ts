import { expect, test } from '@playwright/test';

import { bootToHome } from './boot';

/**
 * E-01 analog (`docs/14-test-plan.md` §5.1): silent mock login, then Home, then a signed-in
 * profile. This is test-login, not TikTok. D4 stays `[ ]`.
 *
 * The business result is a session the profile can read (`data-session=AUTHENTICATED` and a
 * server-issued user id), not "the splash went away".
 */
test('silent mock login reaches Home and a signed-in profile', async ({ page }) => {
  await bootToHome(page);

  await page.getByTestId('profile-link').click();
  const profile = page.getByTestId('profile-page');
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute('data-session', 'AUTHENTICATED');

  const identity = page.getByTestId('profile-identity');
  await expect(identity).toBeVisible();
  await expect(identity).not.toHaveAttribute('data-me', 'guest');
  await expect(identity).toHaveAttribute('data-user-id', /usr_/);
});
