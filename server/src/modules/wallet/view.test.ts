import { describe, expect, it } from 'vitest';

import { WALLET_VIEW_KEYS, toWalletView, walletViewKeys } from './view.js';
import { knownBalance } from './fixtures.js';
import type { WalletBalance } from './balance-port.js';

describe('toWalletView', () => {
  it('omits every balance field when the platform named nothing', () => {
    expect(toWalletView({ kind: 'UNAVAILABLE' })).toEqual({});
  });

  it('does not invent a zero for a KNOWN result that carried no figures', () => {
    expect(toWalletView(knownBalance())).toEqual({});
  });

  it('forwards a platform zero, which is a real empty wallet', () => {
    expect(
      toWalletView(knownBalance({ coinBalance: 0, bonusBalance: 0, totalBalance: 0 })),
    ).toEqual({ coinBalance: 0, bonusBalance: 0, totalBalance: 0 });
  });

  it('forwards a split the platform named, without renaming halves', () => {
    expect(
      toWalletView(knownBalance({ coinBalance: 100, bonusBalance: 20, totalBalance: 120 })),
    ).toEqual({ coinBalance: 100, bonusBalance: 20, totalBalance: 120 });
  });

  it('does not invent the missing half of a lone total', () => {
    expect(toWalletView(knownBalance({ totalBalance: 50 }))).toEqual({ totalBalance: 50 });
  });

  it('does not invent a total from a lone paid-coin figure', () => {
    expect(toWalletView(knownBalance({ coinBalance: 80 }))).toEqual({ coinBalance: 80 });
  });

  it('omits pendingCredit unless the platform said true', () => {
    expect(toWalletView(knownBalance({ coinBalance: 1, pendingCredit: false }))).toEqual({
      coinBalance: 1,
    });
    expect(toWalletView(knownBalance({ coinBalance: 1, pendingCredit: true }))).toEqual({
      coinBalance: 1,
      pendingCredit: true,
    });
  });

  it('refuses three figures that do not add up rather than picking one', () => {
    expect(
      toWalletView(knownBalance({ coinBalance: 100, bonusBalance: 20, totalBalance: 999 })),
    ).toEqual({});
  });

  it('refuses a negative or a float rather than shipping it', () => {
    expect(toWalletView(knownBalance({ coinBalance: -1 }))).toEqual({});
    expect(toWalletView(knownBalance({ totalBalance: 1.5 }))).toEqual({});
  });

  /**
   * C3-09: a Beans or fiat field on the facts is not a coin balance. The mapper copies the four
   * WalletView keys and nothing else, so stuffing `beansAmount` onto the object cannot leak onto
   * the wire even if a future port grows sloppy.
   */
  it('drops Beans and fiat keys rather than quoting them as coins', () => {
    const stuffed = {
      kind: 'KNOWN' as const,
      coinBalance: 100,
      beansAmount: 60,
      beansPerCoin: 0.7,
      amountCents: 99,
      currency: 'USD',
    };
    const view = toWalletView(stuffed as WalletBalance);

    expect(view).toEqual({ coinBalance: 100 });
    expect(walletViewKeys(view)).toEqual(['coinBalance']);
    expect(JSON.stringify(view)).not.toMatch(/beans|amountCents|currency|USD|fiat/i);
  });
});

describe('WALLET_VIEW_KEYS', () => {
  it('is the closed set of keys a wallet body may carry', () => {
    expect(WALLET_VIEW_KEYS).toEqual([
      'coinBalance',
      'bonusBalance',
      'totalBalance',
      'pendingCredit',
    ]);
  });
});
