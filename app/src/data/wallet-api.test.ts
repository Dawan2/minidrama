import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';

import {
  UNAVAILABLE_BALANCE,
  WALLET_PATH,
  WALLET_TRANSACTIONS_PATH,
  createWalletApi,
  narrowCoinBalance,
  narrowWalletTransaction,
} from './wallet-api';
import { apiFailure } from './failure';
import { page } from '../testing/catalog-fixtures';
import { walletTransaction, walletView } from '../testing/wallet-fixtures';
import type { HttpReader } from './http';

function httpStub(body: unknown): HttpReader {
  return { getJson: () => Promise.resolve(ok(body)) };
}

describe('the wallet endpoint', () => {
  it('publishes the path the contract defines, under the live /v1 prefix', () => {
    expect(WALLET_PATH).toBe('/v1/wallet');
    expect(WALLET_TRANSACTIONS_PATH).toBe('/v1/wallet/transactions');
  });

  it('does not invent a limit or a type filter', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(page([]))));
    await createWalletApi({ getJson }).fetchTransactions({ cursor: 'cur_2' });

    expect(getJson).toHaveBeenCalledWith(WALLET_TRANSACTIONS_PATH, {
      cursor: 'cur_2',
      limit: undefined,
      type: undefined,
    });
  });

  it('passes a transport failure through untouched, so the surface classifies it', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 401, message: 'no session' });
    const api = createWalletApi({ getJson: () => Promise.resolve({ ok: false, error: failure }) });

    const result = await api.fetchWallet();
    expect(result).toEqual({ ok: false, error: failure });
  });

  it('treats an empty ledger as a value', async () => {
    const result = await createWalletApi(httpStub(page([]))).fetchTransactions({});

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.items : null).toEqual([]);
  });

  it('rejects a ledger body that is not a page', async () => {
    for (const body of [null, [], {}, { items: {} }, { items: [], pageInfo: {} }]) {
      const result = await createWalletApi(httpStub(body)).fetchTransactions({});
      expect(result.ok, JSON.stringify(body)).toBe(false);
      expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
    }
  });
});

/**
 * Fail-closed is the whole product of this narrower. A number the server did not send is not a
 * number the client may show; a Beans amount is not a coin balance; a session grant is not a
 * wallet.
 */
describe('a coin balance', () => {
  it('is unavailable when the body is an object with nothing to quote', () => {
    expect(narrowCoinBalance({})).toEqual(UNAVAILABLE_BALANCE);
    expect(narrowCoinBalance({ status: 'ok' })).toEqual(UNAVAILABLE_BALANCE);
  });

  it('is unavailable for a session grant, which is not a wallet', () => {
    expect(
      narrowCoinBalance({
        accessToken: 'tok_1',
        expiresInSec: 7200,
        openId: 'open_1',
      }),
    ).toEqual(UNAVAILABLE_BALANCE);
  });

  /**
   * C3-09: the conversion rate does not exist, and a Beans field on a body is not a substitute
   * for one. Displaying it would quote a currency this product cannot price.
   */
  it('ignores Beans and fiat fields rather than quoting them as coins', () => {
    expect(narrowCoinBalance({ beansAmount: 60, amountCents: 99, beans: 12 })).toEqual(
      UNAVAILABLE_BALANCE,
    );
    expect(narrowCoinBalance({ beansPerCoin: 1, coinToBeans: 1, BEANS_RATE: 1 })).toEqual(
      UNAVAILABLE_BALANCE,
    );
  });

  it('quotes a documented WalletView and nothing else on the body', () => {
    const balance = narrowCoinBalance(
      walletView({ coinBalance: 100, bonusBalance: 20, extra: 'drop me' }),
    );

    expect(balance).toEqual({
      kind: 'KNOWN',
      totalBalance: 120,
      coinBalance: 100,
      bonusBalance: 20,
      pendingCredit: false,
    });
  });

  it('accepts a lone total, and does not invent a paid/bonus split for it', () => {
    expect(narrowCoinBalance({ totalBalance: 40 })).toEqual({
      kind: 'KNOWN',
      totalBalance: 40,
      coinBalance: null,
      bonusBalance: null,
      pendingCredit: false,
    });
  });

  it('sums a paid + bonus pair that arrived without a total', () => {
    expect(narrowCoinBalance({ coinBalance: 10, bonusBalance: 5 })).toEqual({
      kind: 'KNOWN',
      totalBalance: 15,
      coinBalance: 10,
      bonusBalance: 5,
      pendingCredit: false,
    });
  });

  it('treats a zero the server sent as a real empty wallet, not as a missing one', () => {
    expect(narrowCoinBalance({ coinBalance: 0, bonusBalance: 0, totalBalance: 0 })).toEqual({
      kind: 'KNOWN',
      totalBalance: 0,
      coinBalance: 0,
      bonusBalance: 0,
      pendingCredit: false,
    });
  });

  it('refuses three figures that do not add up, rather than picking one', () => {
    expect(narrowCoinBalance({ coinBalance: 10, bonusBalance: 5, totalBalance: 99 })).toEqual(
      UNAVAILABLE_BALANCE,
    );
  });

  it('rejects a named field it cannot read, so a truncated body stays retryable', () => {
    expect(narrowCoinBalance({ coinBalance: '100' })).toBeNull();
    expect(narrowCoinBalance({ coinBalance: 1.5 })).toBeNull();
    expect(narrowCoinBalance({ coinBalance: -1 })).toBeNull();
    expect(narrowCoinBalance({ totalBalance: Number.NaN })).toBeNull();
    expect(narrowCoinBalance(null)).toBeNull();
    expect(narrowCoinBalance([])).toBeNull();
  });

  it('raises the pending-credit banner only when the server said so', () => {
    expect(narrowCoinBalance({ totalBalance: 1, pendingCredit: true })).toMatchObject({
      kind: 'KNOWN',
      pendingCredit: true,
    });
    expect(narrowCoinBalance({ totalBalance: 1, pendingCredit: false })).toMatchObject({
      pendingCredit: false,
    });
    expect(narrowCoinBalance({ totalBalance: 1, pendingCredit: 'yes' })).toMatchObject({
      pendingCredit: false,
    });
  });

  it('returns a successful UNAVAILABLE from GET /v1/wallet when the body exposes nothing', async () => {
    const result = await createWalletApi(httpStub({ openId: 'open_1' })).fetchWallet();

    expect(result).toEqual({ ok: true, value: UNAVAILABLE_BALANCE });
  });
});

describe('a ledger row', () => {
  it('is rejected without an id and a known type', () => {
    expect(narrowWalletTransaction({ type: 'RECHARGE' })).toBeNull();
    expect(narrowWalletTransaction({ id: 'txn_1', type: 'TIP' })).toBeNull();
    expect(narrowWalletTransaction({ id: '', type: 'RECHARGE' })).toBeNull();
    expect(narrowWalletTransaction(null)).toBeNull();
  });

  it('survives a missing amount rather than inventing a zero movement', () => {
    const row = narrowWalletTransaction({ id: 'txn_1', type: 'RECHARGE' });

    expect(row).toEqual({
      id: 'txn_1',
      type: 'RECHARGE',
      coinDelta: null,
      bonusDelta: null,
      createdAt: null,
    });
  });

  it('keeps the fields the row renders', () => {
    expect(narrowWalletTransaction(walletTransaction())).toEqual(walletTransaction());
  });

  it('drops a Beans amount on a row rather than showing it as coins', () => {
    const row = narrowWalletTransaction({
      id: 'txn_1',
      type: 'RECHARGE',
      beansAmount: 60,
      amountCents: 99,
    });

    expect(row?.coinDelta).toBeNull();
    expect(row?.bonusDelta).toBeNull();
  });
});
