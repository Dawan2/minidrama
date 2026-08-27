/**
 * Favourites storage: one row per `(viewer, drama)`.
 *
 * The interface is three methods — read one, add one, remove one — and async, so the durable
 * implementation drops in behind it without touching a caller. That implementation is a single
 * table, `favorite(user_id, drama_id, created_at)` with the pair as its primary key
 * (`docs/12-domain-model.md` §3), and the primary key is what makes `add` idempotent in SQL:
 * `INSERT … ON CONFLICT (user_id, drama_id) DO NOTHING` keeps the original `created_at`, which is
 * the property the route's contract depends on.
 *
 * Three properties of this in-memory implementation are contracts rather than implementation
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
 *     the handoff, decision S45 — but the distinction is exactly what a "favourites removed" metric
 *     would have to count, and throwing it away at the store leaves nothing to count later.
 */

export interface FavoriteRecord {
  readonly userId: string;
  readonly dramaId: string;
  /** Server time when the favourite was first recorded, epoch milliseconds. */
  readonly favoritedAtMs: number;
}

export interface FavoritesStore {
  read(userId: string, dramaId: string): Promise<FavoriteRecord | undefined>;
  /** Idempotent. Returns the stored row, which is the *existing* row when there already was one. */
  add(userId: string, dramaId: string, nowMs: number): Promise<FavoriteRecord>;
  /** Idempotent. True when a row was actually removed. */
  remove(userId: string, dramaId: string): Promise<boolean>;
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
  };
}
