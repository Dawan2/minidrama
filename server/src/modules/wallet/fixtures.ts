import { ok } from '@minidrama/shared';
import type { WalletTransactionType } from '@minidrama/shared';

import { descendingKey, paginate, queryFingerprint } from '../../core/pagination.js';
import type { KnownWalletBalance, WalletBalance, WalletBalancePort } from './balance-port.js';
import type { WalletLedgerPort, WalletLedgerRow } from './ledger-port.js';

/**
 * A port that quotes a figure for some viewers and reports unavailable for everyone else.
 *
 * Tests inject this so the success path — a platform zero, a split balance, a lone total — is
 * asserted against the real route rather than against the mapper alone.
 */
export function createScriptedWalletBalancePort(
  balances: Readonly<Record<string, WalletBalance>>,
): WalletBalancePort {
  return {
    readBalance: async (userId) => ok(balances[userId] ?? { kind: 'UNAVAILABLE' }),
  };
}

export function knownBalance(overrides: Omit<KnownWalletBalance, 'kind'> = {}): KnownWalletBalance {
  return { kind: 'KNOWN', ...overrides };
}

/**
 * A port that pages platform rows for some viewers and reports unavailable for everyone else.
 *
 * Most recent `createdAt` first, id as the tiebreak. The fingerprint includes `type` so a
 * `RECHARGE` cursor cannot be replayed against `CONSUME`.
 */
export function createScriptedWalletLedgerPort(
  ledgers: Readonly<Record<string, readonly WalletLedgerRow[]>>,
): WalletLedgerPort {
  return {
    listTransactions: async (userId, query) => {
      const rows = ledgers[userId] ?? [];
      const filtered = filterByType(rows, query.type);
      const page = paginate(sortLedgerRows(filtered), {
        keyOf: ledgerRowKey,
        limit: query.limit,
        cursor: query.cursor,
        fingerprint: queryFingerprint({
          list: 'wallet-transactions',
          type: query.type ?? '',
        }),
      });
      if (!page.ok) return page;
      return ok({ kind: 'KNOWN', page: page.value });
    },
  };
}

export function ledgerRow(
  overrides: Partial<WalletLedgerRow> & Pick<WalletLedgerRow, 'id'>,
): WalletLedgerRow {
  return {
    type: 'RECHARGE',
    coinDelta: 100,
    bonusDelta: 20,
    createdAt: '2026-08-27T10:00:00.000Z',
    ...overrides,
  };
}

function filterByType(
  rows: readonly WalletLedgerRow[],
  type: WalletTransactionType | undefined,
): readonly WalletLedgerRow[] {
  return type === undefined ? rows : rows.filter((row) => row.type === type);
}

function sortLedgerRows(rows: readonly WalletLedgerRow[]): readonly WalletLedgerRow[] {
  return [...rows].sort((left, right) => ledgerRowKey(left).localeCompare(ledgerRowKey(right)));
}

function ledgerRowKey(row: WalletLedgerRow): string {
  const parsed = row.createdAt === undefined ? Number.NaN : Date.parse(row.createdAt);
  const ms = Number.isFinite(parsed) ? parsed : 0;
  return `${descendingKey(ms)}\u0000${row.id}`;
}