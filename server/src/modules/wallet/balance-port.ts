import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * Where a coin balance comes from.
 *
 * The wallet route is a read, and the only honest source of a coin figure is the platform (or, later,
 * a ledger this process owns). Until that source exists the default implementation reports
 * `UNAVAILABLE` rather than `0`: a viewer who has recharged and sees an invented zero will not
 * believe the next number either (`docs/plan/cycle-3-backlog.md` C3-04, `docs/handoff/w3-work-m.md`
 * M16).
 *
 * `UNAVAILABLE` is a successful read of an absence — the platform has no coin figure for us to
 * quote — and becomes a `200` with the balance fields omitted. `BALANCE_UNREADABLE` is a fault: we
 * tried to ask and could not complete the check, which is a `503`, never a guessed number.
 *
 * Beans and fiat are not on this port. The platform charges Beans; what a coin is worth in Beans
 * is a pricing decision that does not exist (`C3-09`). A `beansAmount` here would be that
 * decision, made in a type definition.
 */

export type KnownWalletBalance = {
  readonly kind: 'KNOWN';
  /** Paid-coin balance. Omit when the platform did not name it. `0` only when it said zero. */
  readonly coinBalance?: number;
  readonly bonusBalance?: number;
  readonly totalBalance?: number;
  /** Only set when the platform said a credit is still settling. */
  readonly pendingCredit?: boolean;
};

export type WalletBalance = { readonly kind: 'UNAVAILABLE' } | KnownWalletBalance;

export type WalletBalanceFailure = 'BALANCE_UNREADABLE';

export interface WalletBalancePort {
  readBalance(userId: string): Promise<Result<WalletBalance, WalletBalanceFailure>>;
}

/** The fail-closed default: no platform coin figure, therefore no number to quote. */
export function createUnavailableWalletBalancePort(): WalletBalancePort {
  return {
    readBalance: async () => ok({ kind: 'UNAVAILABLE' }),
  };
}

/** A port that cannot even ask. Distinct from "asked, no figure": this is ours to fix. */
export function createUnreadableWalletBalancePort(): WalletBalancePort {
  return {
    readBalance: async () => err('BALANCE_UNREADABLE'),
  };
}
