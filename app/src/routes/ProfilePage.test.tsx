import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { ProfilePage } from './ProfilePage';
import { renderSurface } from '../testing/render';
import { stubSession } from '../testing/history-fixtures';

/**
 * SCR-06, as far as it can honestly go today. The assertions worth having are about what the screen
 * refuses to invent: there is no balance, no VIP state and no real nickname, because there is no
 * endpoint behind any of them.
 */
describe('the profile shell', () => {
  it('names the session state it is rendering', () => {
    renderSurface(<ProfilePage />);
    expect(screen.getByTestId('profile-page').getAttribute('data-session')).toBe('ANONYMOUS');

    renderSurface(<ProfilePage />, {
      session: stubSession({ state: { status: 'AUTHENTICATED', openId: 'open_1' } }),
    });
    const pages = screen.getAllByTestId('profile-page');
    expect(pages[1]?.getAttribute('data-session')).toBe('AUTHENTICATED');
  });

  /**
   * The IA is explicit that the anonymous assets area is a login card and **not fake data**
   * (`docs/02-user-journeys.md` J10-B). A "0 coins" placeholder is not a placeholder, it is a wrong
   * balance, and a viewer who has recharged and sees it will not believe the next number either.
   */
  it('shows a login card instead of an assets area when there is no session', () => {
    renderSurface(<ProfilePage />, { session: stubSession({ state: { status: 'ANONYMOUS' } }) });

    expect(screen.getByTestId('profile-sign-in').textContent).toContain(
      'Sign in to save your progress across devices.',
    );
  });

  it('drops the login card once a session exists', () => {
    renderSurface(<ProfilePage />, {
      session: stubSession({ state: { status: 'AUTHENTICATED', openId: 'open_1' } }),
    });

    expect(screen.queryByTestId('profile-sign-in')).toBeNull();
  });

  it('quotes no balance, no VIP state and no episode counts it cannot read', () => {
    renderSurface(<ProfilePage />);

    const text = screen.getByTestId('profile-page').textContent ?? '';
    expect(text).not.toMatch(/coin/i);
    expect(text).not.toMatch(/vip/i);
    expect(text).not.toMatch(/\d/);
  });

  // Silent login, in place. There is no login screen in this product, so the card must not navigate.
  it('retries silent login from the card rather than navigating to a login screen', async () => {
    const session = stubSession({ signInSucceeds: false });
    renderSurface(<ProfilePage />, { session });

    fireEvent.click(screen.getByTestId('sign-in'));

    await waitFor(() => {
      expect(session.signInCalls()).toBe(1);
    });
    expect(await screen.findByTestId('sign-in-unavailable')).toBeDefined();
  });

  it('shows the default identity rather than an empty profile block', () => {
    renderSurface(<ProfilePage />);

    const identity = screen.getByTestId('profile-identity');
    expect(identity.textContent).toContain('Guest');
    expect(identity.textContent).not.toContain('profile.guestName');
  });
});

describe('the profile entries', () => {
  it('leads to the history screen', () => {
    renderSurface(<ProfilePage />);

    expect(screen.getByTestId('history-entry').getAttribute('href')).toBe('/history');
  });

  /**
   * The entry was a disabled button for as long as SCR-08 had nowhere to go. The screen exists now,
   * built on the per-drama favourite reads, so the entry leads to it — an entry that arrives at a
   * screen which explains its own limits beats one that arrives at "this page does not exist".
   */
  it('leads to the favourites screen', () => {
    renderSurface(<ProfilePage />);

    const favorites = screen.getByTestId('favorites-entry');
    expect(favorites.textContent).toContain('Favourites');
    expect(favorites.getAttribute('href')).toBe('/favorites');
  });

  it('offers only the entries that lead somewhere', () => {
    renderSurface(<ProfilePage />);

    const links = screen.getByTestId('profile-entries').querySelectorAll('a');
    expect([...links].map((link) => link.getAttribute('href'))).toEqual(['/history', '/favorites']);
  });
});
