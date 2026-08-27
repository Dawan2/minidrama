import { err, ok } from '@minidrama/shared';
import type { Page, Result, WalletTransactionType } from '@minidrama/shared';

/**
 * Where a coin ledger comes from.
 *
 * `GET /v1/wallet/transactions` is a read, and the only honest source of a movement is the
 * platform (or, later, a ledger this process owns and writes). Until that source exists the
 * default implementation reports `UNAVAILABLE`. The route answers that as a **200 empty page**,
 * not a guessed `CONSUME`: unlocks do not debit a wallet
 * (`docs/handoff/w9-work-unlock-grant.md` S73), and an invented spend would be bookkeeping
 * somebody would have to unpick.
 *
 * `UNAVAILABLE` is a successful read of an absence — we have no platform rows to quote — and is
 * the empty ledger SCR-09 already draws. `LEDGER_UNREADABLE` is a fault: we tried to ask and
 * could not complete the check, which is a `503`, never a guessed list. `INVALID_CURSOR` is the
 * caller's: a cursor this query did not issue.
 *
 * Beans and fiat are not on this port (`C3-09`).
 */

export interface WalletLedgerRow {
  readonly id: string;
  readonly type: WalletTransactionType;
  readonly coinDelta?: number;
  readonly bonusDelta?: number;
  readonly refType?: string;
  readonly refId?: string;
  readonly createdAt?: string;
}

export interface WalletLedgerQuery {
  readonly cursor: string | undefined;
  readonly limit: number;
  readonly type: WalletTransactionType | undefined;
}

export type WalletLedger =
  | { readonly kind: 'UNAVAILABLE' }
  | { readonly kind: 'KNOWN'; readonly page: Page<WalletLedgerRow> };

export type WalletLedgerFailure = 'LEDGER_UNREADABLE' | 'INVALID_CURSOR';

export interface WalletLedgerPort {
  listTransactions(
    userId: string,
    query: WalletLedgerQuery,
  ): Promise<Result<WalletLedger, WalletLedgerFailure>>;
}

/**
 * The fail-closed default: no platform ledger, therefore no rows to quote — including no
 * `CONSUME` synthesised from unlock receipts.
 */
export function createUnavailableWalletLedgerPort(): WalletLedgerPort {
  return {
    listTransactions: async () => ok({ kind: 'UNAVAILABLE' }),
  };
}

/** A port that cannot even ask. Distinct from "asked, no rows": this is ours to fix. */
export function createUnreadableWalletLedgerPort(): WalletLedgerPort {
  return {
    listTransactions: async () => err('LEDGER_UNREADABLE'),
  };
}
