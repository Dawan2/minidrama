import type { Page, Result } from '@minidrama/shared';

import { asRecord, narrow, narrowPage } from './narrow';
import type { ApiFailure } from './failure';
import type { HttpReader } from './http';

/**
 * The wallet reads: "how many coins do I have", and "what moved them".
 *
 * `GET /v1/wallet` is served. There is still no coin ledger — unlocks do not debit one — so a
 * body with the balance fields omitted is a successful read of an absence, which this module
 * reads as `UNAVAILABLE`. That is not a client bug and it must not render as `0`. The screen
 * inventory (`docs/02-screen-inventory.md` SCR-09) still needs the surface, including the empty
 * ledger, which is a required state rather than an edge case.
 *
 * Two rules this module exists to hold, because both are easy to violate with a placeholder:
 *
 * 1. **No invented number.** A missing, partial or unreadable balance is `UNAVAILABLE`, never `0`.
 *    A viewer who has recharged and sees `0` will not believe the next number either
 *    (`docs/handoff/w3-work-m.md` M16, `docs/plan/cycle-3-backlog.md` C3-04).
 * 2. **No Beans, no fiat, no rate.** The platform charges Beans; what a coin is worth in Beans is
 *    a pricing decision that does not exist (`C3-09`). A `beansAmount` on a body is ignored. A
 *    `beansPerCoin` constant would be a commercial decision made in this file.
 *
 * The session grant (`POST /v1/auth/login`) is `{ accessToken, expiresInSec, openId }` and those
 * three cannot be a balance. `session-api.ts` strips anything else on purpose. This client is the
 * only probe, against the contract `docs/12-api-contracts.md` §4.6 already names. It does not
 * invent a second path.
 */

export const WALLET_PATH = '/v1/wallet';
export const WALLET_TRANSACTIONS_PATH = '/v1/wallet/transactions';

export const WALLET_TRANSACTION_TYPES = ['RECHARGE', 'CONSUME', 'REWARD', 'REFUND'] as const;

export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

/**
 * What the client is allowed to say about a coin balance.
 *
 * `UNAVAILABLE` is a successful read of an absence: the server answered, and nothing in the body
 * is a number this product can quote. It is not an error. Surfaces render a statement, not a
 * figure, and they never substitute `0`.
 *
 * `KNOWN` is the only state in which a coin amount may appear in the UI. `totalBalance` is the
 * number the viewer is shown. The split is carried when the server sent it and is `null` when it
 * did not — inventing "all paid" or "all bonus" from a lone total would be a second bookkeeping
 * system.
 */
export type CoinBalance =
  | { readonly kind: 'UNAVAILABLE' }
  | {
      readonly kind: 'KNOWN';
      readonly totalBalance: number;
      readonly coinBalance: number | null;
      readonly bonusBalance: number | null;
      /**
       * Only `true` when the server said so. A missing flag is not a pending credit; the banner
       * SCR-09 reserves for "到账确认中" stays down until a body can support it.
       */
      readonly pendingCredit: boolean;
    };

export const UNAVAILABLE_BALANCE: CoinBalance = { kind: 'UNAVAILABLE' };

export interface WalletTransaction {
  readonly id: string;
  readonly type: WalletTransactionType;
  /** Paid-coin movement. `null` when the server did not send a readable figure. */
  readonly coinDelta: number | null;
  /** Bonus-coin movement. Same rule. */
  readonly bonusDelta: number | null;
  readonly createdAt: string | null;
}

export interface WalletTransactionsRequest {
  readonly cursor?: string;
  readonly limit?: number;
  readonly type?: WalletTransactionType;
}

export interface WalletApi {
  fetchWallet(): Promise<Result<CoinBalance, ApiFailure>>;
  fetchTransactions(
    request: WalletTransactionsRequest,
  ): Promise<Result<Page<WalletTransaction>, ApiFailure>>;
}

export function createWalletApi(http: HttpReader): WalletApi {
  return {
    fetchWallet: async () => {
      const body = await http.getJson(WALLET_PATH);
      return body.ok ? narrow(body.value, narrowCoinBalance) : body;
    },

    fetchTransactions: async (request) => {
      const body = await http.getJson(WALLET_TRANSACTIONS_PATH, {
        cursor: request.cursor,
        limit: request.limit,
        type: request.type,
      });
      return body.ok ? narrowPage(body.value, narrowWalletTransaction) : body;
    },
  };
}

/**
 * Read a coin balance out of an unknown body, or report that none is there.
 *
 * Returns `null` only when the value is not an object — that is a truncated or HTML body, and
 * `narrow` maps it to `MALFORMED`. Every object, including an empty one, a session grant, and a
 * body that only names Beans, is `UNAVAILABLE` rather than a guessed number.
 */
export function narrowCoinBalance(value: unknown): CoinBalance | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const coinBalance = readNonNegativeInteger(record['coinBalance']);
  const bonusBalance = readNonNegativeInteger(record['bonusBalance']);
  const totalBalance = readNonNegativeInteger(record['totalBalance']);

  if (coinBalance === 'invalid' || bonusBalance === 'invalid' || totalBalance === 'invalid') {
    // The server named a balance field and we cannot read it. That is a truncated or drifted
    // body, not "no balance": retrying may recover a complete one. Substituting 0 would be the
    // invented number this module exists to refuse.
    return null;
  }

  const pendingCredit = record['pendingCredit'] === true;

  if (totalBalance !== null) {
    if (
      coinBalance !== null &&
      bonusBalance !== null &&
      coinBalance + bonusBalance !== totalBalance
    ) {
      // Three figures that do not add up are not a balance we can quote. Picking one would be
      // a client-side ledger.
      return UNAVAILABLE_BALANCE;
    }
    return {
      kind: 'KNOWN',
      totalBalance,
      coinBalance,
      bonusBalance,
      pendingCredit,
    };
  }

  if (coinBalance !== null && bonusBalance !== null) {
    return {
      kind: 'KNOWN',
      totalBalance: coinBalance + bonusBalance,
      coinBalance,
      bonusBalance,
      pendingCredit,
    };
  }

  if (coinBalance !== null) {
    return {
      kind: 'KNOWN',
      totalBalance: coinBalance,
      coinBalance,
      bonusBalance: null,
      pendingCredit,
    };
  }

  if (bonusBalance !== null) {
    return {
      kind: 'KNOWN',
      totalBalance: bonusBalance,
      coinBalance: null,
      bonusBalance,
      pendingCredit,
    };
  }

  // Session grants, Beans-only bodies, empty objects, and every other shape that is a JSON
  // object but not a wallet: fail closed. `beansAmount` / `amountCents` are deliberately not
  // read — displaying them would quote a currency this product has no rate for (C3-09).
  return UNAVAILABLE_BALANCE;
}

export function isWalletTransactionType(value: string): value is WalletTransactionType {
  return (WALLET_TRANSACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Strict about the two fields a row cannot be drawn without (`id`, `type`), tolerant about the
 * amounts and the timestamp.
 *
 * An amount drives a displayed figure, so an unreadable one is dropped rather than defaulted to
 * `0` — a `+0 coins` row for a recharge the server described differently is a wrong ledger line.
 * Rejecting the whole page over one missing delta would cost the viewer every other line to
 * protect a number we were going to hide anyway.
 */
export function narrowWalletTransaction(value: unknown): WalletTransaction | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const id = record['id'];
  const type = record['type'];
  if (
    typeof id !== 'string' ||
    id === '' ||
    typeof type !== 'string' ||
    !isWalletTransactionType(type)
  ) {
    return null;
  }

  return {
    id,
    type,
    coinDelta: readInteger(record['coinDelta']),
    bonusDelta: readInteger(record['bonusDelta']),
    createdAt: typeof record['createdAt'] === 'string' ? record['createdAt'] : null,
  };
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

/** Signed, because a consume is negative. `undefined` is "not sent"; anything else unreadable is `null`. */
function readInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
