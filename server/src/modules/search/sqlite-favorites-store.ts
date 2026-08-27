import type { SqliteDatabase } from '../../db/sqlite.js';
import type {
  FavoriteRecord,
  FavoritesPage,
  FavoritesStore,
  InMemoryFavoritesStoreOptions,
} from './favorites.js';

/**
 * The durable `FavoritesStore`: a SQLite table behind the same interface as the in-memory map.
 *
 * The key is `(user_id, drama_id)`, never the drama alone — the same property the in-memory Map
 * enforces, and the one a dump of this table must keep. `add` is `INSERT … ON CONFLICT DO NOTHING`,
 * which keeps the original `created_at_ms`; rewriting that timestamp on a retry would make a sqlite
 * write disagree with an in-memory write of the same pair. A repeated add also leaves `seq` alone,
 * so eviction stays insertion-order rather than last-touched.
 *
 * `node:sqlite` is synchronous underneath; the interface stays async so a later Postgres swap
 * does not touch callers.
 */

const DEFAULT_CAPACITY = 50_000;

const FIND_SQL = `
  SELECT user_id, drama_id, created_at_ms
  FROM favorite
  WHERE user_id = ? AND drama_id = ?
`;

const INSERT_SQL = `
  INSERT INTO favorite (user_id, drama_id, created_at_ms)
  VALUES (?, ?, ?)
  ON CONFLICT (user_id, drama_id) DO NOTHING
`;

const DELETE_SQL = `
  DELETE FROM favorite WHERE user_id = ? AND drama_id = ?
`;

const LIST_FIRST_SQL = `
  SELECT user_id, drama_id, created_at_ms
  FROM favorite
  WHERE user_id = ?
  ORDER BY created_at_ms DESC, drama_id DESC
  LIMIT ?
`;

const LIST_AFTER_SQL = `
  SELECT user_id, drama_id, created_at_ms
  FROM favorite
  WHERE user_id = ?
    AND (created_at_ms, drama_id) < (?, ?)
  ORDER BY created_at_ms DESC, drama_id DESC
  LIMIT ?
`;

const COUNT_SQL = `
  SELECT COUNT(*) AS n FROM favorite
`;

const EVICT_OLDEST_SQL = `
  DELETE FROM favorite WHERE seq = (
    SELECT seq FROM favorite ORDER BY seq ASC LIMIT 1
  )
`;

export function createSqliteFavoritesStore(
  db: SqliteDatabase,
  options: InMemoryFavoritesStoreOptions = {},
): FavoritesStore {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;

  const find = db.prepare(FIND_SQL);
  const insert = db.prepare(INSERT_SQL);
  const remove = db.prepare(DELETE_SQL);
  const listFirst = db.prepare(LIST_FIRST_SQL);
  const listAfter = db.prepare(LIST_AFTER_SQL);
  const countStmt = db.prepare(COUNT_SQL);
  const evictOldest = db.prepare(EVICT_OLDEST_SQL);

  const liveCount = (): number => asCount(countStmt.get()?.['n']);

  return {
    async read(userId, dramaId) {
      return readFavorite(find.get(userId, dramaId));
    },

    async add(userId, dramaId, nowMs) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = insert.run(userId, dramaId, nowMs);
        let record: FavoriteRecord;
        if (result.changes === 0) {
          const existing = readFavorite(find.get(userId, dramaId));
          if (existing === undefined) {
            throw new Error('favorite conflict without an existing row');
          }
          record = existing;
        } else {
          while (liveCount() > capacity) evictOldest.run();
          record = { userId, dramaId, favoritedAtMs: nowMs };
        }
        db.exec('COMMIT');
        return record;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async remove(userId, dramaId) {
      return remove.run(userId, dramaId).changes > 0;
    },

    async list(userId, options) {
      const after = options.after;
      const rows =
        after === undefined
          ? listFirst.all(userId, options.limit + 1)
          : listAfter.all(userId, after.favoritedAtMs, after.dramaId, options.limit + 1);

      const records: FavoriteRecord[] = [];
      for (const row of rows) {
        const record = readFavorite(row);
        if (record !== undefined) records.push(record);
      }

      const hasMore = records.length > options.limit;
      const page: FavoritesPage = {
        rows: hasMore ? records.slice(0, options.limit) : records,
        hasMore,
      };
      return page;
    },
  };
}

function readFavorite(row: Record<string, unknown> | undefined): FavoriteRecord | undefined {
  if (row === undefined) return undefined;

  const userId = asString(row['user_id']);
  const dramaId = asString(row['drama_id']);
  const favoritedAtMs = asNumber(row['created_at_ms']);

  if (userId === undefined || dramaId === undefined || favoritedAtMs === undefined) {
    return undefined;
  }

  return { userId, dramaId, favoritedAtMs };
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
