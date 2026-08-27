import type { SqliteDatabase } from '../../db/sqlite.js';
import type { WatchProgressRecord } from './progress.js';
import type { InMemoryWatchProgressStoreOptions, WatchProgressStore } from './store.js';

/**
 * The durable `WatchProgressStore`: a SQLite table behind the same interface as the in-memory map.
 *
 * The key is `(user_id, episode_id)`, never the episode alone — the same property the in-memory
 * Map enforces, and the one a dump of this table must keep. `save` is still unconditional: the
 * merge lives in `mergeReport`, and encoding last-write-wins here would make a sqlite write
 * disagree with an in-memory write of the same record. The ceiling still evicts oldest-written
 * after a rewrite moves the row to the newest `seq`, matching the Map's delete-then-set.
 *
 * `node:sqlite` is synchronous underneath; the interface stays async so a later Postgres swap
 * does not touch callers.
 */

const DEFAULT_CAPACITY = 10_000;

const FIND_SQL = `
  SELECT user_id, episode_id, position_sec, duration_sec, completed,
         client_updated_at_ms, updated_at_ms
  FROM watch_progress
  WHERE user_id = ? AND episode_id = ?
`;

const DELETE_SQL = `
  DELETE FROM watch_progress WHERE user_id = ? AND episode_id = ?
`;

const INSERT_SQL = `
  INSERT INTO watch_progress (
    user_id, episode_id, position_sec, duration_sec, completed,
    client_updated_at_ms, updated_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const LIST_SQL = `
  SELECT user_id, episode_id, position_sec, duration_sec, completed,
         client_updated_at_ms, updated_at_ms
  FROM watch_progress
  WHERE user_id = ?
  ORDER BY updated_at_ms DESC
  LIMIT ?
`;

const COUNT_SQL = `
  SELECT COUNT(*) AS n FROM watch_progress
`;

const EVICT_OLDEST_SQL = `
  DELETE FROM watch_progress WHERE seq = (
    SELECT seq FROM watch_progress ORDER BY seq ASC LIMIT 1
  )
`;

export function createSqliteWatchProgressStore(
  db: SqliteDatabase,
  options: InMemoryWatchProgressStoreOptions = {},
): WatchProgressStore {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;

  const find = db.prepare(FIND_SQL);
  const remove = db.prepare(DELETE_SQL);
  const insert = db.prepare(INSERT_SQL);
  const list = db.prepare(LIST_SQL);
  const countStmt = db.prepare(COUNT_SQL);
  const evictOldest = db.prepare(EVICT_OLDEST_SQL);

  const liveCount = (): number => asCount(countStmt.get()?.['n']);

  return {
    async read(userId, episodeId) {
      return readProgress(find.get(userId, episodeId));
    },

    async save(record) {
      db.exec('BEGIN IMMEDIATE');
      try {
        // Delete before insert so a rewrite takes a new seq and eviction stays
        // least-recently-written rather than oldest-ever-written. Evicting a row a viewer is
        // actively reporting against would lose the position of the only session that still needs
        // it — the same contract the in-memory Map enforces by delete-then-set.
        remove.run(record.userId, record.episodeId);
        insert.run(
          record.userId,
          record.episodeId,
          record.positionSec,
          record.durationSec,
          record.completed ? 1 : 0,
          record.clientUpdatedAtMs,
          record.updatedAtMs,
        );
        while (liveCount() > capacity) evictOldest.run();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async list(userId, limit) {
      if (limit <= 0) return [];

      const mine: WatchProgressRecord[] = [];
      for (const row of list.all(userId, limit)) {
        const record = readProgress(row);
        if (record !== undefined) mine.push(record);
      }
      return mine;
    },
  };
}

function readProgress(row: Record<string, unknown> | undefined): WatchProgressRecord | undefined {
  if (row === undefined) return undefined;

  const userId = asString(row['user_id']);
  const episodeId = asString(row['episode_id']);
  const positionSec = asNumber(row['position_sec']);
  const durationSec = asNumber(row['duration_sec']);
  const completed = asBoolean(row['completed']);
  const clientUpdatedAtMs = asNumber(row['client_updated_at_ms']);
  const updatedAtMs = asNumber(row['updated_at_ms']);

  if (
    userId === undefined ||
    episodeId === undefined ||
    positionSec === undefined ||
    durationSec === undefined ||
    completed === undefined ||
    clientUpdatedAtMs === undefined ||
    updatedAtMs === undefined
  ) {
    return undefined;
  }

  return {
    userId,
    episodeId,
    positionSec,
    durationSec,
    completed,
    clientUpdatedAtMs,
    updatedAtMs,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 0n) return false;
  if (value === 1 || value === 1n) return true;
  return undefined;
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}
