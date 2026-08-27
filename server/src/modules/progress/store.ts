import type { WatchProgressRecord } from './progress.js';

/**
 * Watch-progress storage.
 *
 * The interface is deliberately narrow — read one row, write one row — and async, so that the real
 * write path drops in behind it without touching a caller. That path is not a direct table write:
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
 */
export interface WatchProgressStore {
  read(userId: string, episodeId: string): Promise<WatchProgressRecord | undefined>;
  save(record: WatchProgressRecord): Promise<void>;
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
  };
}
