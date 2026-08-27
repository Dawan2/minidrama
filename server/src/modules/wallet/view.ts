import { isWalletTransactionRefType, isWalletTransactionType } from '@minidrama/shared';
import type { Page, WalletTransaction, WalletView } from '@minidrama/shared';

import type { WalletBalance } from './balance-port.js';
import type { WalletLedger, WalletLedgerRow } from './ledger-port.js';

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

export const EMPTY_WALLET_LEDGER: Page<WalletTransaction> = {
  items: [],
  pageInfo: { nextCursor: null, hasMore: false },
};

/**
 * Project a port result onto the wire page the client `narrowPage` / `narrowWalletTransaction`
 * reads.
 *
 * `UNAVAILABLE` is the empty ledger, not a guessed `CONSUME`. Unlocks do not debit a wallet
 * (S73); synthesizing spend from them would be a ledger this process does not own.
 *
 * A row the platform named is copied field-for-field onto the closed key set. Missing deltas stay
 * missing — a `+0` recharge is a wrong line. Beans and fiat keys are dropped (`C3-09`). A row
 * without `id` or a domain `type` is dropped rather than rewritten.
 */
export function toWalletTransactionPage(ledger: WalletLedger): Page<WalletTransaction> {
  if (ledger.kind !== 'KNOWN') {
    return EMPTY_WALLET_LEDGER;
  }

  return {
    items: ledger.page.items.flatMap((row) => {
      const item = toWalletTransaction(row);
      return item === null ? [] : [item];
    }),
    pageInfo: ledger.page.pageInfo,
  };
}

export function toWalletTransaction(row: WalletLedgerRow): WalletTransaction | null {
  if (row.id === '' || !isWalletTransactionType(row.type)) {
    return null;
  }

  const item: {
    -readonly [K in keyof WalletTransaction]: WalletTransaction[K];
  } = { id: row.id, type: row.type };

  const coinDelta = readInteger(row.coinDelta);
  const bonusDelta = readInteger(row.bonusDelta);
  if (coinDelta === 'invalid' || bonusDelta === 'invalid') {
    return null;
  }
  if (coinDelta !== null) {
    item.coinDelta = coinDelta;
  }
  if (bonusDelta !== null) {
    item.bonusDelta = bonusDelta;
  }

  if (typeof row.createdAt === 'string' && row.createdAt !== '') {
    item.createdAt = row.createdAt;
  }

  if (
    typeof row.refType === 'string' &&
    isWalletTransactionRefType(row.refType) &&
    typeof row.refId === 'string' &&
    row.refId !== ''
  ) {
    item.refType = row.refType;
    item.refId = row.refId;
  }

  return item;
}

function readInteger(value: unknown): number | null | 'invalid' {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 'invalid';
  }
  return value;
}

function readNonNegativeInteger(value: unknown): number | null | 'invalid' {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 'invalid';
  }
  return value;
}
