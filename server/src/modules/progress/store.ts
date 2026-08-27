import type { WatchProgressRecord } from './progress.js';

/**
 * Watch-progress storage.
 *
 * The interface is deliberately narrow — read one row, write one row, list a viewer's rows — and
 * async, so that the real write path drops in behind it without touching a caller. That path is not
 * a direct table write:
 * progress peaks at roughly 5,000 writes/s (`docs/03-nonfunctional.md` §4), so it is Redis first,
 * answered immediately, and batched into Postgres with the last-write-wins comparison in the SQL
 * `WHERE` clause (`docs/design/domain-model.md` §4.5).
 *
 * Two properties of this in-memory implementation are contracts, not implementation details:
 *
 *   - **the key is `(userId, episodeId)`.** It is the primary key of `watch_progress`, and it is the
 *     reason one viewer's resume position can never be served to another. There is a test for that
 *     which is worth more than it looks: a cache keyed on `episodeId` alone is the classic way this
 *     leaks, and it leaks the least suspicious-looking data in the system;
 *   - **`save` is unconditional.** The merge decision is `mergeReport`'s, and the caller reads,
 *     merges and writes. A durable implementation must make that sequence atomic — in SQL, by
 *     putting the timestamp comparison in the upsert predicate rather than doing read-compare-write
 *     in the application, which is what makes concurrent flushes from several instances deterministic.
 *
 * **Default is process-local.** The in-memory map dies with the process, so a restart forgets every
 * position it held. `DATABASE_URL=sqlite:<path>` puts a SQLite table behind this same interface; a
 * postgres URL is refused rather than rewritten to a file. Redis (T15) is not read.
 */
export interface WatchProgressStore {
  read(userId: string, episodeId: string): Promise<WatchProgressRecord | undefined>;
  save(record: WatchProgressRecord): Promise<void>;
  /**
   * Every row this viewer has, newest accepted report first. The watch-history list is built from
   * it (`history.ts`), which is why it takes a bound: history is a page, not an export, and a
   * method that could return a viewer's entire viewing life is a method that will one day be asked
   * to.
   *
   * `limit` bounds the **rows read**, not the rows answered. A row is one episode and the list is
   * one row per drama, so the two counts differ by however many episodes of a drama a viewer has
   * watched — the caller has to over-read and then group. Where that bound sits, and what it costs,
   * is `WATCH_HISTORY_SCAN_LIMIT` in `history.ts`.
   *
   * In SQL this is `WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`, which needs an index on
   * `(user_id, updated_at DESC)`. The in-memory implementation scans instead, and says so.
   */
  list(userId: string, limit: number): Promise<readonly WatchProgressRecord[]>;
}

export interface InMemoryWatchProgressStoreOptions {
  /** Oldest rows are dropped past this bound so unbounded reporting cannot exhaust the heap. */
  readonly capacity?: number;
}

/**
 * `\u0000` cannot occur in either identifier, so no pair of identifiers can be made to produce the
 * key of another pair. Concatenating with a printable separator is how a user named `a:b` reads
 * another user's row.
 */
function progressKey(userId: string, episodeId: string): string {
  return `${userId}\u0000${episodeId}`;
}

export function createInMemoryWatchProgressStore(
  options: InMemoryWatchProgressStoreOptions = {},
): WatchProgressStore {
  const capacity = options.capacity ?? 10_000;
  const rows = new Map<string, WatchProgressRecord>();

  return {
    async read(userId, episodeId) {
      return rows.get(progressKey(userId, episodeId));
    },

    async save(record) {
      const key = progressKey(record.userId, record.episodeId);
      // Delete before set so an update moves the row to the end of the insertion order and eviction
      // stays least-recently-written rather than oldest-ever-written. Evicting a row a viewer is
      // actively reporting against would lose the position of the only session that still needs it.
      rows.delete(key);
      rows.set(key, record);

      while (rows.size > capacity) {
        const oldest = rows.keys().next();
        if (oldest.done === true) break;
        rows.delete(oldest.value);
      }
    },

    async list(userId, limit) {
      if (limit <= 0) return [];

      const mine: WatchProgressRecord[] = [];
      // A full scan of every viewer's rows, which is exactly as bad as it looks and exactly as bad
      // as it needs to be: this map holds at most `capacity` rows in one process. The durable
      // implementation is an index seek, and the interface is shaped for it — the sort and the
      // bound are applied here rather than by the caller, so the query can do both in SQL.
      for (const record of rows.values()) {
        if (record.userId === userId) mine.push(record);
      }

      // Newest accepted report first. `updatedAtMs` is server time, not the client's clock: a
      // device with a wrong clock must not be able to pin itself to the top of its own history, and
      // `clientUpdatedAtMs` is the field it controls.
      mine.sort((left, right) => right.updatedAtMs - left.updatedAtMs);

      return mine.slice(0, limit);
    },
  };
}
