import { err, ok } from '@minidrama/shared';

import { isAdSessionOutcome } from './ad-sessions.js';
import type { AdUnlockSession } from './ad-sessions.js';
import type {
  AdSessionCreateFailure,
  AdSessionRedeemFailure,
  AdUnlockSessionStore,
} from './ad-session-store.js';
import type { SqliteDatabase } from '../../db/sqlite.js';

const INSERT_SQL = `
  INSERT INTO ad_unlock_sessions (
    id, user_id, episode_id, drama_id, idempotency_key, created_at_ms,
    redeemed_at_ms, outcome, unlock_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_COLUMNS = `
  id, user_id, episode_id, drama_id, idempotency_key, created_at_ms,
  redeemed_at_ms, outcome, unlock_id
`;

const FIND_BY_ID_SQL = `SELECT ${SELECT_COLUMNS} FROM ad_unlock_sessions WHERE id = ?`;
const FIND_BY_IDEMPOTENCY_SQL = `
  SELECT ${SELECT_COLUMNS} FROM ad_unlock_sessions WHERE user_id = ? AND idempotency_key = ?
`;
const REDEEM_SQL = `
  UPDATE ad_unlock_sessions
  SET redeemed_at_ms = ?, outcome = ?, unlock_id = ?
  WHERE id = ? AND redeemed_at_ms IS NULL
`;

export function createSqliteAdUnlockSessionStore(db: SqliteDatabase): AdUnlockSessionStore {
  const insert = db.prepare(INSERT_SQL);
  const findById = db.prepare(FIND_BY_ID_SQL);
  const findByIdempotency = db.prepare(FIND_BY_IDEMPOTENCY_SQL);
  const redeemStmt = db.prepare(REDEEM_SQL);

  return {
    async create(session) {
      try {
        insert.run(
          session.id,
          session.userId,
          session.episodeId,
          session.dramaId,
          session.idempotencyKey,
          session.createdAtMs,
          session.redeemedAtMs,
          session.outcome,
          session.unlockId,
        );
        return ok(session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/UNIQUE/i.test(message)) {
          const existing = readSession(
            findByIdempotency.get(session.userId, session.idempotencyKey),
          );
          if (existing === undefined)
            return err('SESSION_NOT_RECORDED' satisfies AdSessionCreateFailure);
          if (existing.episodeId !== session.episodeId) {
            return err('IDEMPOTENCY_CONFLICT' satisfies AdSessionCreateFailure);
          }
          return ok(existing);
        }
        return err('SESSION_NOT_RECORDED');
      }
    },

    async findByIdempotencyKey(userId, idempotencyKey) {
      return readSession(findByIdempotency.get(userId, idempotencyKey));
    },

    async get(id) {
      return readSession(findById.get(id));
    },

    async redeem(id, input) {
      try {
        const result = redeemStmt.run(input.atMs, input.outcome, input.unlockId, id);
        if (result.changes === 0) {
          const existing = readSession(findById.get(id));
          if (existing === undefined)
            return err('SESSION_NOT_FOUND' satisfies AdSessionRedeemFailure);
          return err('ALREADY_REDEEMED' satisfies AdSessionRedeemFailure);
        }
        const redeemed = readSession(findById.get(id));
        if (redeemed === undefined) return err('SESSION_NOT_RECORDED');
        return ok(redeemed);
      } catch {
        return err('SESSION_NOT_RECORDED');
      }
    },
  };
}

function readSession(row: Record<string, unknown> | undefined): AdUnlockSession | undefined {
  if (row === undefined) return undefined;

  const id = asString(row['id']);
  const userId = asString(row['user_id']);
  const episodeId = asString(row['episode_id']);
  const dramaId = asString(row['drama_id']);
  const idempotencyKey = asString(row['idempotency_key']);
  const createdAtMs = asNumber(row['created_at_ms']);
  const redeemedAtMs = asNullableNumber(row['redeemed_at_ms']);
  const outcome = asOutcome(row['outcome']);
  const unlockId = asNullableString(row['unlock_id']);

  if (
    id === undefined ||
    userId === undefined ||
    episodeId === undefined ||
    dramaId === undefined ||
    idempotencyKey === undefined ||
    createdAtMs === undefined ||
    redeemedAtMs === undefined ||
    outcome === undefined ||
    unlockId === undefined
  ) {
    return undefined;
  }

  return {
    id,
    userId,
    episodeId,
    dramaId,
    idempotencyKey,
    createdAtMs,
    redeemedAtMs,
    outcome,
    unlockId,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return asString(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asNumber(value);
}

function asOutcome(value: unknown): AdUnlockSession['outcome'] | undefined {
  if (value === null) return null;
  return isAdSessionOutcome(value) ? value : undefined;
}
