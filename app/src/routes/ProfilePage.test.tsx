import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { err, ok } from '@minidrama/shared';

import { ProfilePage } from './ProfilePage';
import { offlineFailure } from '../testing/catalog-fixtures';
import { renderSurface } from '../testing/render';
import { stubSession } from '../testing/history-fixtures';
import {
  knownBalance,
  stubWalletApi,
  UNAVAILABLE_WALLET,
  walletHttpFailure,
} from '../testing/wallet-fixtures';

/**
 * SCR-06, as far as it can honestly go today. The assertions worth having are about what the screen
 * refuses to invent: there is no readable VIP state and no real nickname, because there is no
 * endpoint behind either of them. The wallet card quotes a number only when the server sent one.
 * The VIP card is present, quotes none, and does not open a `#/vip`.
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

  it('leads to the wallet screen', () => {
    renderSurface(<ProfilePage />);

    const wallet = screen.getByTestId('wallet-entry');
    expect(wallet.textContent).toContain('Wallet');
    expect(wallet.getAttribute('href')).toBe('/wallet');
  });

  it('leads to the settings screen', () => {
    renderSurface(<ProfilePage />);

    const settings = screen.getByTestId('settings-entry');
    expect(settings.textContent).toContain('Settings');
    expect(settings.getAttribute('href')).toBe('/settings');
  });

  it('offers only the entries that lead somewhere', () => {
    renderSurface(<ProfilePage />);

    const links = screen.getByTestId('profile-entries').querySelectorAll('a');
    expect([...links].map((link) => link.getAttribute('href'))).toEqual([
      '/history',
      '/favorites',
      '/wallet',
      '/settings',
    ]);
  });
});

describe('the profile wallet card', () => {
  const signedIn = stubSession({ state: { status: 'AUTHENTICATED', openId: 'open_1' } });

  it('quotes a balance the server sent', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance({ totalBalance: 15, coinBalance: 15, bonusBalance: 0 })),
    });
    renderSurface(<ProfilePage />, { session: signedIn, walletApi });

    expect(await screen.findByTestId('wallet-balance')).toBeDefined();
    expect(screen.getByTestId('wallet-balance').textContent).toContain('15 coins');
  });

  it('quotes no figure when the server exposes none, including a Beans-only body', async () => {
    const walletApi = stubWalletApi({ wallet: () => ok(UNAVAILABLE_WALLET) });
    renderSurface(<ProfilePage />, { session: signedIn, walletApi });

    const card = await screen.findByTestId('wallet-balance-unavailable');
    expect(card.textContent).toContain('Balance is not available yet');
    expect(card.textContent).not.toMatch(/\d/);
    expect(screen.getByTestId('profile-page').textContent).not.toMatch(/beans/i);
  });

  it('does not invent a zero when the endpoint is not deployed', async () => {
    const walletApi = stubWalletApi({ wallet: () => err(walletHttpFailure(404)) });
    renderSurface(<ProfilePage />, { session: signedIn, walletApi });

    const card = await screen.findByTestId('wallet-balance-unavailable');
    expect(card.textContent).not.toMatch(/\d/);
    expect(screen.queryByTestId('wallet-balance')).toBeNull();
  });

  it('retries a transport failure in the card without blanking the entries', async () => {
    const walletApi = stubWalletApi({ wallet: () => err(offlineFailure()) });
    renderSurface(<ProfilePage />, { session: signedIn, walletApi });

    expect(await screen.findByTestId('retryable-error')).toBeDefined();
    expect(screen.getByTestId('wallet-entry')).toBeDefined();
    expect(screen.getByTestId('history-entry')).toBeDefined();
  });
});

describe('the profile VIP card', () => {
  const signedIn = stubSession({ state: { status: 'AUTHENTICATED', openId: 'open_1' } });

  it('is an assets-area card, so a guest never sees a VIP status', () => {
    renderSurface(<ProfilePage />, { session: stubSession({ state: { status: 'ANONYMOUS' } }) });

    expect(screen.queryByTestId('profile-vip')).toBeNull();
  });

  it('quotes no status, because GET /users/me does not exist', () => {
    renderSurface(<ProfilePage />, { session: signedIn });

    const card = screen.getByTestId('profile-vip');
    expect(card.getAttribute('data-status')).toBe('unavailable');
    expect(card.textContent).toContain('VIP status is not available yet');
    expect(card.textContent).not.toMatch(/active|inactive|expires|expiry|until/i);
    expect(card.textContent).not.toMatch(/\d/);
  });

  it('does not invent a #/vip, a Beans price, or a working subscribe', () => {
    renderSurface(<ProfilePage />, { session: signedIn });

    const card = screen.getByTestId('profile-vip');
    expect(card.querySelector('a')).toBeNull();
    expect(card.textContent).not.toMatch(/beans/i);
    expect(card.textContent).not.toMatch(/\$|€|£|¥|¢/);

    const subscribe = screen.getByTestId('profile-vip-subscribe');
    expect(subscribe).toBeInstanceOf(HTMLButtonElement);
    expect((subscribe as HTMLButtonElement).disabled).toBe(true);
    expect(card.textContent).toContain('Subscribing is not available in this version yet');
  });

  it('leaves the VIP card in place when the wallet card retries', async () => {
    const walletApi = stubWalletApi({ wallet: () => err(offlineFailure()) });
    renderSurface(<ProfilePage />, { session: signedIn, walletApi });

    expect(await screen.findByTestId('retryable-error')).toBeDefined();
    expect(screen.getByTestId('profile-vip')).toBeDefined();
  });
});
