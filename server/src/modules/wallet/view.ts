import type { WalletView } from '@minidrama/shared';

import type { WalletBalance } from './balance-port.js';

/**
 * Project a port result onto the wire shape the client `narrowCoinBalance` reads.
 *
 * Two properties this function exists to hold, because both are easy to violate with a
 * placeholder:
 *
 * 1. **No invented number.** A missing figure is an omitted field, never `0`. `0` is forwarded
 *    only when the port carried it — that is a platform zero, a real empty wallet.
 * 2. **No Beans, no fiat, no rate.** Only the four `WalletView` keys can leave. A `beansAmount`
 *    stuffed onto the facts is dropped, not renamed as coins (`C3-09`).
 *
 * Three figures that do not add up are not a balance we can quote. Picking one would be a
 * server-side ledger. They become an empty view, the same unavailable answer as "the platform
 * named nothing".
 */

const BALANCE_KEYS = ['coinBalance', 'bonusBalance', 'totalBalance'] as const;

export function toWalletView(balance: WalletBalance): WalletView {
  if (balance.kind !== 'KNOWN') {
    return {};
  }

  const coinBalance = readNonNegativeInteger(balance.coinBalance);
  const bonusBalance = readNonNegativeInteger(balance.bonusBalance);
  const totalBalance = readNonNegativeInteger(balance.totalBalance);

  if (coinBalance === 'invalid' || bonusBalance === 'invalid' || totalBalance === 'invalid') {
    // The port named a field we cannot quote. Substituting 0, or shipping the other two, would
    // be the invented number this mapper exists to refuse.
    return {};
  }

  if (
    coinBalance !== null &&
    bonusBalance !== null &&
    totalBalance !== null &&
    coinBalance + bonusBalance !== totalBalance
  ) {
    return {};
  }

  const view: {
    -readonly [K in keyof WalletView]: WalletView[K];
  } = {};

  if (coinBalance !== null) {
    view.coinBalance = coinBalance;
  }
  if (bonusBalance !== null) {
    view.bonusBalance = bonusBalance;
  }
  if (totalBalance !== null) {
    view.totalBalance = totalBalance;
  }
  if (balance.pendingCredit === true) {
    view.pendingCredit = true;
  }

  return view;
}

/**
 * The keys a wallet body is allowed to carry. Used by the route tests so a Beans or fiat field
 * cannot be added to the mapper and left untested: the assertion is on the enumerated set, not on
 * the absence of one name.
 */
export function walletViewKeys(view: WalletView): readonly string[] {
  return Object.keys(view);
}

export const WALLET_VIEW_KEYS: readonly string[] = [...BALANCE_KEYS, 'pendingCredit'];

function readNonNegativeInteger(value: unknown): number | null | 'invalid' {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 'invalid';
  }
  return value;
}
