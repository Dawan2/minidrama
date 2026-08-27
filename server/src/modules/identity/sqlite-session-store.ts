import { err, ok } from '@minidrama/shared';

import type { SqliteDatabase } from '../../db/sqlite.js';
import {
  generateSessionToken,
  sessionFingerprint,
  type Session,
  type SessionLookupFailure,
  type SessionStore,
  type SessionStoreOptions,
} from './session-store.js';

/**
 * The durable `SessionStore`: a SQLite table behind the same interface as the in-memory map.
 *
 * The key is the fingerprint, never the token — the same property the in-memory Map enforces, and
 * the one a dump of this table must keep. The ceiling still evicts oldest-first after reclaiming
 * expired rows: being logged out is one silent login, and an unbounded table is still a flood
 * target on disk.
 *
 * `node:sqlite` is synchronous, so the interface stays synchronous. Callers do not change.
 */

const DEFAULT_TTL_SEC = 3600;
const DEFAULT_MAX_SESSIONS = 10_000;

const INSERT_SQL = `
  INSERT INTO sessions (fingerprint, user_id, expires_at_ms, created_at_ms)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (fingerprint) DO UPDATE SET
    user_id = excluded.user_id,
    expires_at_ms = excluded.expires_at_ms
`;

const FIND_SQL = `
  SELECT user_id, expires_at_ms FROM sessions WHERE fingerprint = ?
`;

const DELETE_SQL = `
  DELETE FROM sessions WHERE fingerprint = ?
`;

const DROP_EXPIRED_SQL = `
  DELETE FROM sessions WHERE expires_at_ms <= ?
`;

const COUNT_SQL = `
  SELECT COUNT(*) AS n FROM sessions
`;

const EVICT_OLDEST_SQL = `
  DELETE FROM sessions WHERE id = (
    SELECT id FROM sessions ORDER BY id ASC LIMIT 1
  )
`;

const LIST_FINGERPRINTS_SQL = `
  SELECT fingerprint FROM sessions ORDER BY id ASC
`;

export function createSqliteSessionStore(
  db: SqliteDatabase,
  options: SessionStoreOptions = {},
): SessionStore {
  const ttlSec = options.ttlSec ?? DEFAULT_TTL_SEC;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const now = options.now ?? Date.now;
  const generateToken = options.generateToken ?? generateSessionToken;

  const insert = db.prepare(INSERT_SQL);
  const find = db.prepare(FIND_SQL);
  const remove = db.prepare(DELETE_SQL);
  const dropExpiredStmt = db.prepare(DROP_EXPIRED_SQL);
  const countStmt = db.prepare(COUNT_SQL);
  const evictOldest = db.prepare(EVICT_OLDEST_SQL);
  const listFingerprints = db.prepare(LIST_FINGERPRINTS_SQL);

  const dropExpired = (): void => {
    dropExpiredStmt.run(now());
  };

  const liveCount = (): number => {
    const row = countStmt.get();
    return asCount(row?.['n']);
  };

  return {
    issue: (userId) => {
      if (userId.length === 0) {
        throw new Error('a session must be bound to a user id');
      }

      dropExpired();
      while (liveCount() >= maxSessions) evictOldest.run();

      const accessToken = generateToken();
      const createdAtMs = now();
      insert.run(sessionFingerprint(accessToken), userId, createdAtMs + ttlSec * 1000, createdAtMs);

      return { accessToken, expiresInSec: ttlSec } satisfies Session;
    },

    resolve: (accessToken) => {
      const fingerprint = sessionFingerprint(accessToken);
      const row = find.get(fingerprint);

      if (row === undefined) return err('SESSION_UNKNOWN' satisfies SessionLookupFailure);

      const userId = asString(row['user_id']);
      const expiresAtMs = asNumber(row['expires_at_ms']);
      if (userId === undefined || expiresAtMs === undefined) {
        remove.run(fingerprint);
        return err('SESSION_UNKNOWN');
      }

      if (expiresAtMs <= now()) {
        remove.run(fingerprint);
        return err('SESSION_EXPIRED');
      }

      return ok(userId);
    },

    revoke: (accessToken) => {
      remove.run(sessionFingerprint(accessToken));
    },

    get liveSessions() {
      dropExpired();
      return liveCount();
    },

    fingerprints: () => {
      dropExpired();
      const keys: string[] = [];
      for (const row of listFingerprints.all()) {
        const fingerprint = asString(row['fingerprint']);
        if (fingerprint !== undefined) keys.push(fingerprint);
      }
      return keys;
    },
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}
