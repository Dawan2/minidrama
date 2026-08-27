import { err, ok } from '@minidrama/shared';

import { UNLOCK_METHODS } from '../entitlement/access.js';
import type { UnlockMethod } from '../entitlement/access.js';
import type { SqliteDatabase } from '../../db/sqlite.js';
import type { Unlock } from './unlocks.js';
import type { UnlockRecordFailure, UnlockRecordResult, UnlockStore } from './unlock-store.js';

/**
 * The durable `UnlockStore`: a SQLite table behind the same interface as the in-memory map.
 *
 * The insert is `INSERT … ON CONFLICT (user_id, episode_id) DO NOTHING`. That is the unique index
 * of `docs/12-domain-model.md` §6.1, and it is what makes a redelivered callback keep the first
 * receipt rather than restamp it. The in-memory store does the same with a Map; the suites are
 * the specification, and both implementations have to pass them.
 *
 * `UNLOCK_NOT_RECORDED` is reachable here, which it is not in memory: a closed connection, a
 * read-only file, a missing table. The payment callback must not see an exception for those
 * (`unlock-store.ts`).
 */

const INSERT_SQL = `
  INSERT INTO unlocks (
    id, user_id, episode_id, drama_id, method, cost_coins, order_id, granted_at_ms, expires_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (user_id, episode_id) DO NOTHING
`;

const FIND_SQL = `
  SELECT id, user_id, episode_id, drama_id, method, cost_coins, order_id, granted_at_ms, expires_at_ms
  FROM unlocks
  WHERE user_id = ? AND episode_id = ?
`;

const LIST_SQL = `
  SELECT id, user_id, episode_id, drama_id, method, cost_coins, order_id, granted_at_ms, expires_at_ms
  FROM unlocks
  ORDER BY rowid
`;

export function createSqliteUnlockStore(db: SqliteDatabase): UnlockStore {
  const insert = db.prepare(INSERT_SQL);
  const find = db.prepare(FIND_SQL);
  const list = db.prepare(LIST_SQL);

  return {
    async record(unlock) {
      try {
        const result = insert.run(
          unlock.id,
          unlock.userId,
          unlock.episodeId,
          unlock.dramaId,
          unlock.method,
          unlock.costCoins,
          unlock.orderId,
          unlock.grantedAtMs,
          unlock.expiresAtMs,
        );

        if (result.changes === 0) {
          const existing = readUnlock(find.get(unlock.userId, unlock.episodeId));
          if (existing === undefined)
            return err('UNLOCK_NOT_RECORDED' satisfies UnlockRecordFailure);
          return ok({ unlock: existing, created: false } satisfies UnlockRecordResult);
        }

        return ok({ unlock, created: true } satisfies UnlockRecordResult);
      } catch {
        return err('UNLOCK_NOT_RECORDED');
      }
    },

    async findForEpisode(userId, episodeId) {
      return readUnlock(find.get(userId, episodeId));
    },

    async list() {
      const rows: Unlock[] = [];
      for (const row of list.all()) {
        const unlock = readUnlock(row);
        if (unlock !== undefined) rows.push(unlock);
      }
      return rows;
    },
  };
}

function readUnlock(row: Record<string, unknown> | undefined): Unlock | undefined {
  if (row === undefined) return undefined;

  const id = asString(row['id']);
  const userId = asString(row['user_id']);
  const episodeId = asString(row['episode_id']);
  const dramaId = asString(row['drama_id']);
  const method = asMethod(row['method']);
  const costCoins = asNumber(row['cost_coins']);
  const orderId = asString(row['order_id']);
  const grantedAtMs = asNumber(row['granted_at_ms']);
  const expiresAtMs = asNullableNumber(row['expires_at_ms']);

  if (
    id === undefined ||
    userId === undefined ||
    episodeId === undefined ||
    dramaId === undefined ||
    method === undefined ||
    costCoins === undefined ||
    orderId === undefined ||
    grantedAtMs === undefined ||
    expiresAtMs === undefined
  ) {
    return undefined;
  }

  return { id, userId, episodeId, dramaId, method, costCoins, orderId, grantedAtMs, expiresAtMs };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asNumber(value);
}

function asMethod(value: unknown): UnlockMethod | undefined {
  return typeof value === 'string' && (UNLOCK_METHODS as readonly string[]).includes(value)
    ? (value as UnlockMethod)
    : undefined;
}
