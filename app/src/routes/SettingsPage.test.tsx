import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { SettingsPage } from './SettingsPage';
import { APP_VERSION, SUPPORT_EMAIL, supportMailto } from './settings';
import { renderSurface } from '../testing/render';

/**
 * SCR-12. The assertions worth having are about what the screen refuses to invent: no working
 * ToS URL, no working privacy URL, no logout, no Beans, and a version that is the package's.
 */
describe('the settings screen', () => {
  it('names itself and quotes the package version', () => {
    renderSurface(<SettingsPage />);

    expect(screen.getByTestId('settings-page')).toBeDefined();
    expect(screen.getByTestId('settings-page').textContent).toContain('Settings');
    expect(screen.getByTestId('settings-version').getAttribute('data-version')).toBe(APP_VERSION);
    expect(screen.getByTestId('settings-version').textContent).toContain(APP_VERSION);
  });

  it('does not invent a Terms or Privacy URL while C4 and C5 are unpublished', () => {
    renderSurface(<SettingsPage />);

    expect(screen.getByTestId('settings-terms').textContent).toContain(
      'Terms of Service URL has not been published',
    );
    expect(screen.getByTestId('settings-privacy').textContent).toContain(
      'Privacy Policy URL has not been published',
    );
    expect(screen.getByTestId('settings-legal').querySelector('a')).toBeNull();
  });

  it('offers the C11 mailbox as a mailto, on an .invalid host', () => {
    renderSurface(<SettingsPage />);

    const mail = screen.getByTestId('settings-support-mail');
    expect(mail.getAttribute('href')).toBe(supportMailto());
    expect(mail.textContent).toBe(SUPPORT_EMAIL);
    expect(mail.getAttribute('href')).toContain('.invalid');
  });

  it('does not expose a logout, because silent login has none', () => {
    renderSurface(<SettingsPage />);

    expect(screen.queryByTestId('sign-out')).toBeNull();
    expect(screen.queryByRole('button', { name: /log ?out|sign ?out/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /log ?out|sign ?out/i })).toBeNull();
  });

  it('does not invent a local cache to wipe: the session is memory-only', () => {
    renderSurface(<SettingsPage />);

    expect(screen.getByTestId('settings-cache').textContent).toContain('memory');
    expect(screen.queryByTestId('settings-clear-cache')).toBeNull();
  });

  it('quotes no Beans, no fiat, and no invented balance', () => {
    renderSurface(<SettingsPage />);

    const text = screen.getByTestId('settings-page').textContent ?? '';
    expect(text).not.toMatch(/beans/i);
    expect(text).not.toMatch(/\$|€|£|¥|¢/);
  });
});
