/**
 * Facts the settings screen can quote without inventing a contract.
 *
 * The version is the package version. C4/C5 ToS and privacy URLs are not published
 * (`docs/11-official-onboarding-checklist.md`); a working URL here would be a commercial
 * document written by this slot. C11 is a contact mailbox that must complete 2FA on the
 * portal — `example.invalid` is the repository placeholder, so a leaked build cannot mail a
 * real inbox. There is no logout: silent login has no sign-out (`docs/02-screen-inventory.md`
 * SCR-12).
 */

export const APP_VERSION = '0.0.0';

export const SUPPORT_EMAIL = 'support@example.invalid';

export function supportMailto(): string {
  return `mailto:${SUPPORT_EMAIL}`;
}
