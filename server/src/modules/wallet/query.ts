import { err, ok, isWalletTransactionType } from '@minidrama/shared';
import type { Result, WalletTransactionType } from '@minidrama/shared';

import { parseLimit } from '../../core/pagination.js';
import type { WalletLedgerQuery } from './ledger-port.js';

/**
 * What a caller is allowed to say on `GET /v1/wallet/transactions`.
 *
 * `limit` is 20 by default and 100 at most, the numbers `docs/12-api-contracts.md` §2.3 gives
 * every list endpoint. Out of range is refused rather than clamped: a silently reduced limit
 * would stop a client paging, because a short page is the obvious end-of-list signal.
 *
 * `type` is optional. An unknown value is a `400`, not "ignore the filter and return everything"
 * and not an empty page that looks like "this viewer has no CONSUMEs".
 */

export const WALLET_TRANSACTIONS_LIMIT = { fallback: 20, max: 100 } as const;

export type WalletTransactionsQueryField = 'cursor' | 'limit' | 'type';

export type WalletTransactionsQueryReason =
  'repeated' | 'not_an_integer' | 'out_of_range' | 'unknown' | 'malformed';

export interface WalletTransactionsQueryFailure {
  readonly field: WalletTransactionsQueryField;
  readonly reason: WalletTransactionsQueryReason;
}

export function parseWalletTransactionsQuery(
  raw: Readonly<Record<string, unknown>>,
): Result<WalletLedgerQuery, WalletTransactionsQueryFailure> {
  const cursor = singleValue(raw['cursor'], 'cursor');
  if (!cursor.ok) return cursor;
  if (cursor.value !== undefined && cursor.value.length === 0) {
    return err({ field: 'cursor', reason: 'malformed' });
  }

  const type = singleValue(raw['type'], 'type');
  if (!type.ok) return type;
  if (type.value !== undefined && !isWalletTransactionType(type.value)) {
    return err({ field: 'type', reason: 'unknown' });
  }

  const limit = parseLimit(raw['limit'], WALLET_TRANSACTIONS_LIMIT);
  if (!limit.ok) {
    const rawLimit = raw['limit'];
    const reason: WalletTransactionsQueryReason =
      typeof rawLimit === 'string' && /^[0-9]+$/.test(rawLimit) ? 'out_of_range' : 'not_an_integer';
    return err({ field: 'limit', reason });
  }

  return ok({
    cursor: cursor.value,
    limit: limit.value,
    type: type.value as WalletTransactionType | undefined,
  });
}

function singleValue(
  raw: unknown,
  field: WalletTransactionsQueryField,
): Result<string | undefined, WalletTransactionsQueryFailure> {
  if (raw === undefined) return ok(undefined);
  if (typeof raw !== 'string') return err({ field, reason: 'repeated' });
  return ok(raw);
}
