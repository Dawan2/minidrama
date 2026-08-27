import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { WalletPage } from './WalletPage';
import { offlineFailure, page } from '../testing/catalog-fixtures';
import { stubSession } from '../testing/history-fixtures';
import { renderSettled, renderSurface, settle } from '../testing/render';
import {
  knownBalance,
  stubWalletApi,
  UNAVAILABLE_WALLET,
  walletHttpFailure,
  walletTransaction,
} from '../testing/wallet-fixtures';

describe('the wallet screen', () => {
  it('asks for the wallet and the first ledger page once', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance()),
      transactions: () => ok(page([walletTransaction()])),
    });
    renderSurface(<WalletPage />, { walletApi });

    await waitFor(() => {
      expect(walletApi.walletCalls).toBe(1);
    });
    expect(walletApi.transactionCalls).toEqual([{}]);
  });

  it('shows a skeleton while both reads are in flight', () => {
    renderSurface(<WalletPage />);
    expect(screen.getByTestId('skeleton')).toBeDefined();
    expect(screen.getByTestId('wallet-page').getAttribute('data-state')).toBe('loading');
  });

  it('quotes a balance the server sent, in coins, and never as Beans', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance({ totalBalance: 40, coinBalance: 30, bonusBalance: 10 })),
    });
    renderSurface(<WalletPage />, { walletApi });

    expect(await screen.findByTestId('wallet-balance')).toBeDefined();
    expect(screen.getByTestId('wallet-balance').textContent).toContain('40 coins');
    expect(screen.getByTestId('wallet-page').textContent).not.toMatch(/beans/i);
    expect(screen.getByTestId('wallet-page').getAttribute('data-state')).toBe('empty');
  });

  it('renders a ledger row per transaction, in the order the server sent', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance()),
      transactions: () =>
        ok(
          page([
            walletTransaction({ id: 'txn_1', type: 'RECHARGE' }),
            walletTransaction({ id: 'txn_2', type: 'CONSUME', coinDelta: -30, bonusDelta: 0 }),
          ]),
        ),
    });
    renderSurface(<WalletPage />, { walletApi });

    await waitFor(() => {
      expect(screen.getAllByTestId('wallet-ledger-row')).toHaveLength(2);
    });
    expect(
      screen.getAllByTestId('wallet-ledger-row').map((row) => row.getAttribute('data-type')),
    ).toEqual(['RECHARGE', 'CONSUME']);
    expect(screen.getByTestId('wallet-page').getAttribute('data-state')).toBe('ready');
  });

  it('treats an empty ledger as its own state, not as a missing wallet', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance({ totalBalance: 0, coinBalance: 0, bonusBalance: 0 })),
      transactions: () => ok(page([])),
    });
    renderSurface(<WalletPage />, { walletApi });

    expect(await screen.findByTestId('empty-state')).toBeDefined();
    expect(screen.getByTestId('empty-state').textContent).toContain('No activity yet');
    expect(screen.getByTestId('wallet-balance').textContent).toContain('0 coins');
    expect(screen.getByTestId('wallet-page').getAttribute('data-state')).toBe('empty');
  });
});

describe('no session versus no figure versus no ledger', () => {
  it('offers a sign-in rather than an empty wallet when the server answers 401', async () => {
    const walletApi = stubWalletApi({
      wallet: () => err(walletHttpFailure(401)),
      transactions: () => err(walletHttpFailure(401)),
    });
    renderSurface(<WalletPage />, { walletApi });

    const prompt = await screen.findByTestId('wallet-sign-in');
    expect(prompt.textContent).toContain('Sign in to see your wallet');
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.queryByTestId('wallet-balance')).toBeNull();
    expect(screen.getByTestId('wallet-page').getAttribute('data-state')).toBe('auth_required');
  });

  it('does not quote a number when the endpoint is not deployed', async () => {
    const walletApi = stubWalletApi({
      wallet: () => err(walletHttpFailure(404)),
      transactions: () => err(walletHttpFailure(404)),
    });
    renderSurface(<WalletPage />, { walletApi });

    const card = await screen.findByTestId('wallet-balance-unavailable');
    expect(card.textContent).toContain('Balance is not available yet');
    expect(card.textContent).not.toMatch(/\d/);
    expect(screen.getByTestId('empty-state').textContent).toContain('No activity yet');
    expect(screen.getByTestId('wallet-page').getAttribute('data-state')).toBe('unavailable');
  });

  it('does not quote a number when the body is a session grant or a Beans amount', async () => {
    const walletApi = stubWalletApi({ wallet: () => ok(UNAVAILABLE_WALLET) });
    renderSurface(<WalletPage />, { walletApi });

    const card = await screen.findByTestId('wallet-balance-unavailable');
    expect(card.textContent).not.toMatch(/\d/);
    expect(screen.getByTestId('wallet-page').textContent).not.toMatch(/beans/i);
  });

  it('keeps a loaded ledger when the balance read is retryable', async () => {
    const walletApi = stubWalletApi({
      wallet: () => err(offlineFailure()),
      transactions: () => ok(page([walletTransaction({ id: 'txn_kept' })])),
    });
    renderSurface(<WalletPage />, { walletApi });

    expect(await screen.findByTestId('wallet-ledger')).toBeDefined();
    expect(screen.getByTestId('retryable-error')).toBeDefined();
    expect(screen.queryByTestId('wallet-balance')).toBeNull();
  });
});

describe('the recharge entry', () => {
  it('is present and does not invent a price or a recharge route', async () => {
    renderSurface(<WalletPage />);

    const recharge = await screen.findByTestId('wallet-recharge');
    expect(recharge.textContent).toContain('Top up');
    expect(recharge.textContent).toContain('not available yet');
    expect(recharge.querySelector('a')).toBeNull();
    expect(recharge.textContent).not.toMatch(/beans/i);
    expect(recharge.textContent).not.toMatch(/\$/);
  });
});

describe('pending credit', () => {
  it('raises the banner only when the server marked a credit as pending', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance({ pendingCredit: true })),
    });
    renderSurface(<WalletPage />, { walletApi });

    expect(await screen.findByTestId('wallet-pending')).toBeDefined();
  });
});

describe('wallet paging', () => {
  it('appends the next page without replacing the rows already on screen', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance()),
      transactions: (_request, index) =>
        index === 0
          ? ok(page([walletTransaction({ id: 'txn_1' })], 'cur_2'))
          : ok(page([walletTransaction({ id: 'txn_2', type: 'CONSUME' })])),
    });
    await renderSettled(<WalletPage />, { walletApi });

    expect(screen.getAllByTestId('wallet-ledger-row')).toHaveLength(1);
    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more-wallet'));
    });
    expect(screen.getAllByTestId('wallet-ledger-row')).toHaveLength(2);
  });
});

describe('a 401 while appending', () => {
  it('keeps the rows and offers sign-in under them', async () => {
    const walletApi = stubWalletApi({
      wallet: () => ok(knownBalance()),
      transactions: (_request, index) =>
        index === 0
          ? ok(page([walletTransaction({ id: 'txn_1' })], 'cur_2'))
          : err(walletHttpFailure(401)),
    });
    await renderSettled(<WalletPage />, { walletApi });
    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more-wallet'));
    });

    expect(screen.getByTestId('wallet-ledger-row')).toBeDefined();
    expect(screen.getByTestId('wallet-sign-in-more')).toBeDefined();
  });
});

describe('silent login from the wallet', () => {
  it('retries in place rather than navigating to a login screen', async () => {
    const session = stubSession({ signInSucceeds: false });
    const walletApi = stubWalletApi({
      wallet: () => err(walletHttpFailure(401)),
      transactions: () => err(walletHttpFailure(401)),
    });
    renderSurface(<WalletPage />, { session, walletApi });

    fireEvent.click(await screen.findByTestId('sign-in'));
    await waitFor(() => {
      expect(session.signInCalls()).toBe(1);
    });
    expect(screen.queryByTestId('fallback-page')).toBeNull();
  });
});
