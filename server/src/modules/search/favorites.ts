/**
 * Favourites storage: one row per `(viewer, drama)`.
 *
 * The interface is four methods — read one, add one, remove one, list a page of one viewer's — and
 * async, so the durable implementation drops in behind it without touching a caller. That
 * implementation is a single table, `favorite(user_id, drama_id, created_at)` with the pair as its
 * primary key (`docs/12-domain-model.md` §3), and the primary key is what makes `add` idempotent in
 * SQL: `INSERT … ON CONFLICT (user_id, drama_id) DO NOTHING` keeps the original `created_at`, which
 * is the property the route's contract depends on.
 *
 * **Default is process-local.** The in-memory map dies with the process, so a restart forgets every
 * favourite it held. `DATABASE_URL=sqlite:<path>` puts a SQLite table behind this same interface; a
 * postgres URL is refused rather than rewritten to a file. Redis (T15) is not read.
 *
 * Four properties of this in-memory implementation are contracts rather than implementation
 * details:
 *
 *   - **the key is `(userId, dramaId)`**, the primary key of the table, and the reason one viewer's
 *     favourites can never be served to another. The separator is `\u0000`, which cannot occur in
 *     either identifier: concatenating with a printable separator is how a viewer named `a:b` reads
 *     another viewer's row;
 *   - **`add` never moves an existing timestamp.** A double-tapped favourite button, or a retry
 *     after a network failure, must not rewrite "following since". The route's advertised
 *     idempotence rests on this;
 *   - **`remove` reports whether it removed anything.** The route answers the same either way — see
 *     `docs/handoff/w2-work-j.md`, decision S45 — but the distinction is exactly what a "favourites
 *     removed" metric would have to count, and throwing it away at the store leaves nothing to
 *     count later;
 *   - **`list` is keyset paged on `(favoritedAtMs, dramaId)` descending, and always scoped to one
 *     `userId`.** The order is total, which is what makes the page boundary meaningful: two
 *     favourites recorded in the same millisecond — one tap on a "follow all" row, or a clock with
 *     coarse resolution — would otherwise sort arbitrarily, and a page boundary that falls between
 *     them drops or repeats a row on the next request. In SQL it is
 *     `WHERE user_id = $1 AND (created_at, drama_id) < ($2, $3) ORDER BY created_at DESC,
 *     drama_id DESC LIMIT $4 + 1`, which wants an index on `(user_id, created_at DESC)`.
 */

export interface FavoriteRecord {
  readonly userId: string;
  readonly dramaId: string;
  /** Server time when the favourite was first recorded, epoch milliseconds. */
  readonly favoritedAtMs: number;
}

/**
 * A position in the favourites ordering: everything strictly *after* it, in that ordering, is the
 * next page. Both components are needed because neither alone is unique — a timestamp can repeat,
 * and a drama id repeats across viewers.
 *
 * It deliberately carries no `userId`. The viewer is resolved from the session on every request,
 * and a cursor that named the viewer would be a client-supplied user id — which is the one input a
 * per-viewer endpoint must never take.
 */
export interface FavoritesCursor {
  readonly favoritedAtMs: number;
  readonly dramaId: string;
}

export interface FavoritesListOptions {
  /** How many rows to return at most. The store returns fewer only when there are fewer. */
  readonly limit: number;
  /** Omitted for the first page. */
  readonly after?: FavoritesCursor;
}

export interface FavoritesPage {
  /** At most `limit` rows, ordered `favoritedAtMs` then `dramaId`, both descending. */
  readonly rows: readonly FavoriteRecord[];
  /**
   * Whether a further row exists past this page. Reported by the store rather than inferred from
   * `rows.length === limit`, which is wrong exactly once per list: a viewer whose favourite count
   * is an exact multiple of the page size would be handed an empty final page and told there was
   * more.
   */
  readonly hasMore: boolean;
}

export interface FavoritesStore {
  read(userId: string, dramaId: string): Promise<FavoriteRecord | undefined>;
  /** Idempotent. Returns the stored row, which is the *existing* row when there already was one. */
  add(userId: string, dramaId: string, nowMs: number): Promise<FavoriteRecord>;
  /** Idempotent. True when a row was actually removed. */
  remove(userId: string, dramaId: string): Promise<boolean>;
  /** One page of one viewer's favourites, most recently followed first. */
  list(userId: string, options: FavoritesListOptions): Promise<FavoritesPage>;
}

/**
 * The list order: most recently followed first, with the drama id as a tiebreak so the order is
 * total. Descending on both components, so the keyset predicate is a single row-value comparison
 * rather than one rule per column.
 */
export function compareFavoritesDescending(a: FavoriteRecord, b: FavoriteRecord): number {
  if (a.favoritedAtMs !== b.favoritedAtMs) return b.favoritedAtMs - a.favoritedAtMs;
  if (a.dramaId === b.dramaId) return 0;
  return a.dramaId < b.dramaId ? 1 : -1;
}

/** True when `row` sorts strictly after `cursor` in the order above — i.e. it is on a later page. */
function isAfter(row: FavoriteRecord, cursor: FavoritesCursor): boolean {
  if (row.favoritedAtMs !== cursor.favoritedAtMs) return row.favoritedAtMs < cursor.favoritedAtMs;
  return row.dramaId < cursor.dramaId;
}

export interface InMemoryFavoritesStoreOptions {
  /** Oldest rows are dropped past this bound so unbounded writing cannot exhaust the heap. */
  readonly capacity?: number;
}

function favoriteKey(userId: string, dramaId: string): string {
  return `${userId}\u0000${dramaId}`;
}

export function createInMemoryFavoritesStore(
  options: InMemoryFavoritesStoreOptions = {},
): FavoritesStore {
  const capacity = options.capacity ?? 50_000;
  const rows = new Map<string, FavoriteRecord>();

  return {
    read(userId, dramaId): Promise<FavoriteRecord | undefined> {
      return Promise.resolve(rows.get(favoriteKey(userId, dramaId)));
    },

    add(userId, dramaId, nowMs): Promise<FavoriteRecord> {
      const key = favoriteKey(userId, dramaId);

      const existing = rows.get(key);
      // Deliberately not re-inserted: a repeated add is not a new decision, so neither the stored
      // timestamp nor this row's position in the eviction order changes.
      if (existing !== undefined) return Promise.resolve(existing);

      const record: FavoriteRecord = { userId, dramaId, favoritedAtMs: nowMs };
      rows.set(key, record);

      while (rows.size > capacity) {
        const oldest = rows.keys().next();
        if (oldest.done === true) break;
        rows.delete(oldest.value);
      }

      return Promise.resolve(record);
    },

    remove(userId, dramaId): Promise<boolean> {
      return Promise.resolve(rows.delete(favoriteKey(userId, dramaId)));
    },

    list(userId, options): Promise<FavoritesPage> {
      // A full scan and sort per request, which is what an in-memory Map allows and what the index
      // on `(user_id, created_at DESC)` replaces. The *shape* of the answer is what matters here:
      // the durable query returns the same rows in the same order for the same cursor.
      const owned = [...rows.values()]
        .filter((row) => row.userId === userId)
        .sort(compareFavoritesDescending);

      const after = options.after;
      const remaining = after === undefined ? owned : owned.filter((row) => isAfter(row, after));

      // One row past the page, then discarded: asking for `limit + 1` is how `hasMore` becomes an
      // observation rather than a guess.
      const window = remaining.slice(0, options.limit + 1);
      const hasMore = window.length > options.limit;

      return Promise.resolve({
        rows: hasMore ? window.slice(0, options.limit) : window,
        hasMore,
      });
    },
  };
}
