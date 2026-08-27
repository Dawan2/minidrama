import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { createInMemoryFavoritesStore } from './favorites.js';
import { createSqliteFavoritesStore } from './sqlite-favorites-store.js';
import type {
  FavoritesCursor,
  FavoritesPage,
  FavoritesStore,
  InMemoryFavoritesStoreOptions,
} from './favorites.js';

/**
 * Both implementations run the same suite. The in-memory map is the default; sqlite is what
 * `DATABASE_URL=sqlite:<path>` puts behind the interface. Filtering sqlite out of `describe.each`
 * is how the durable path would ship untested.
 *
 * The per-viewer key is tested here rather than only through HTTP because it is the property that
 * makes a cross-viewer leak impossible, and because a store keyed on `dramaId` alone would pass
 * every single-viewer test that exists. The paging group is here for the same reason: "no gap and no
 * repeat" is a property of the keyset, and asserting it only through two HTTP responses would leave
 * it hostage to whichever of the two layers happened to be wrong.
 */

const NOW = Date.parse('2026-08-27T12:00:00.000Z');

/** The next page's position: the last row of the page just read. */
function cursorOf(page: FavoritesPage): FavoritesCursor {
  const last = page.rows.at(-1);
  if (last === undefined) throw new Error('cursorOf: the page is empty');
  return { favoritedAtMs: last.favoritedAtMs, dramaId: last.dramaId };
}

interface StoreHandle {
  readonly store: FavoritesStore;
  close(): void;
}

const backends: ReadonlyArray<
  readonly [string, (options?: InMemoryFavoritesStoreOptions) => StoreHandle]
> = [
  [
    'in-memory',
    (options) => ({ store: createInMemoryFavoritesStore(options), close: () => undefined }),
  ],
  [
    'sqlite',
    (options) => {
      const db = openMigratedSqlite(':memory:');
      return { store: createSqliteFavoritesStore(db, options), close: () => db.close() };
    },
  ],
];

describe.each(backends)('FavoritesStore (%s)', (_label, open) => {
  const handles: StoreHandle[] = [];

  function store(options?: InMemoryFavoritesStoreOptions): FavoritesStore {
    const handle = open(options);
    handles.push(handle);
    return handle.store;
  }

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it('records a favourite and reads it back', async () => {
    const favorites = store();

    await favorites.add('user_a', 'drm_1', NOW);

    expect(await favorites.read('user_a', 'drm_1')).toEqual({
      userId: 'user_a',
      dramaId: 'drm_1',
      favoritedAtMs: NOW,
    });
  });

  it('answers undefined for a drama this viewer never followed', async () => {
    const favorites = store();

    expect(await favorites.read('user_a', 'drm_1')).toBeUndefined();
  });

  // A double-tapped button, or a retry after a network failure, is not a new decision.
  it('keeps the first timestamp when the same favourite is added again', async () => {
    const favorites = store();

    await favorites.add('user_a', 'drm_1', NOW);
    const second = await favorites.add('user_a', 'drm_1', NOW + 60_000);

    expect(second.favoritedAtMs).toBe(NOW);
    expect((await favorites.read('user_a', 'drm_1'))?.favoritedAtMs).toBe(NOW);
  });

  it('removes a favourite, and reports whether there was one', async () => {
    const favorites = store();

    await favorites.add('user_a', 'drm_1', NOW);

    expect(await favorites.remove('user_a', 'drm_1')).toBe(true);
    expect(await favorites.remove('user_a', 'drm_1')).toBe(false);
    expect(await favorites.read('user_a', 'drm_1')).toBeUndefined();
  });

  it('lets a viewer follow a drama again after unfollowing it, with a new timestamp', async () => {
    const favorites = store();

    await favorites.add('user_a', 'drm_1', NOW);
    await favorites.remove('user_a', 'drm_1');
    await favorites.add('user_a', 'drm_1', NOW + 60_000);

    expect((await favorites.read('user_a', 'drm_1'))?.favoritedAtMs).toBe(NOW + 60_000);
  });

  describe('is keyed by viewer and drama', () => {
    it('never serves one viewer the favourites of another', async () => {
      const favorites = store();

      await favorites.add('user_a', 'drm_1', NOW);

      expect(await favorites.read('user_b', 'drm_1')).toBeUndefined();
    });

    it('does not let one viewer remove another’s favourite', async () => {
      const favorites = store();

      await favorites.add('user_a', 'drm_1', NOW);

      expect(await favorites.remove('user_b', 'drm_1')).toBe(false);
      expect(await favorites.read('user_a', 'drm_1')).toBeDefined();
    });

    it('keeps two dramas of one viewer independent', async () => {
      const favorites = store();

      await favorites.add('user_a', 'drm_1', NOW);
      await favorites.add('user_a', 'drm_2', NOW + 1);
      await favorites.remove('user_a', 'drm_1');

      expect(await favorites.read('user_a', 'drm_1')).toBeUndefined();
      expect(await favorites.read('user_a', 'drm_2')).toBeDefined();
    });

    // The separator cannot occur in either identifier. Concatenating with a printable one is how a
    // viewer whose id contains the separator reads somebody else's row.
    it('cannot be made to collide by a crafted identifier', async () => {
      const favorites = store();

      await favorites.add('user_a', 'x:drm_1', NOW);

      expect(await favorites.read('user_a:x', 'drm_1')).toBeUndefined();
      expect(await favorites.read('user_a', 'x:drm_1')).toBeDefined();
    });
  });

  describe('list', () => {
    it('answers an empty page for a viewer who follows nothing', async () => {
      const favorites = store();

      expect(await favorites.list('user_a', { limit: 20 })).toEqual({ rows: [], hasMore: false });
    });

    it('returns most recently followed first', async () => {
      const favorites = store();

      await favorites.add('user_a', 'drm_1', NOW);
      await favorites.add('user_a', 'drm_2', NOW + 60_000);
      await favorites.add('user_a', 'drm_3', NOW + 30_000);

      const page = await favorites.list('user_a', { limit: 20 });

      expect(page.rows.map((row) => row.dramaId)).toEqual(['drm_2', 'drm_3', 'drm_1']);
      expect(page.hasMore).toBe(false);
    });

    // Insertion order is not the list order: a viewer who unfollows and follows again has moved
    // that drama to the top, and the timestamp is the only thing that says so.
    it('orders by the stored timestamp, not by insertion', async () => {
      const favorites = store();

      await favorites.add('user_a', 'drm_1', NOW);
      await favorites.add('user_a', 'drm_2', NOW + 60_000);
      await favorites.remove('user_a', 'drm_1');
      await favorites.add('user_a', 'drm_1', NOW + 120_000);

      expect((await favorites.list('user_a', { limit: 20 })).rows.map((row) => row.dramaId)).toEqual([
        'drm_1',
        'drm_2',
      ]);
    });

    // The property that makes a page boundary mean anything. Two favourites can share a
    // millisecond, and without a tiebreak the boundary between them falls in an arbitrary place.
    it('breaks a tied timestamp on the drama id, descending', async () => {
      const favorites = store();

      await favorites.add('user_a', 'drm_b', NOW);
      await favorites.add('user_a', 'drm_a', NOW);
      await favorites.add('user_a', 'drm_c', NOW);

      expect((await favorites.list('user_a', { limit: 20 })).rows.map((row) => row.dramaId)).toEqual([
        'drm_c',
        'drm_b',
        'drm_a',
      ]);
    });

    it('never lists another viewer’s favourites', async () => {
      const favorites = store();

      await favorites.add('user_a', 'drm_1', NOW);
      await favorites.add('user_b', 'drm_2', NOW + 1);

      expect((await favorites.list('user_a', { limit: 20 })).rows.map((row) => row.dramaId)).toEqual([
        'drm_1',
      ]);
    });

    describe('paging', () => {
      async function seed(count: number): Promise<FavoritesStore> {
        const favorites = store();
        for (let index = 0; index < count; index += 1) {
          // Ascending timestamps, so `drm_00` is the oldest and comes last.
          await favorites.add('user_a', `drm_${String(index).padStart(2, '0')}`, NOW + index);
        }
        return favorites;
      }

      it('reports there is more, and takes a cursor for the rest', async () => {
        const favorites = await seed(5);

        const first = await favorites.list('user_a', { limit: 2 });
        expect(first.rows.map((row) => row.dramaId)).toEqual(['drm_04', 'drm_03']);
        expect(first.hasMore).toBe(true);

        const second = await favorites.list('user_a', { limit: 2, after: cursorOf(first) });
        expect(second.rows.map((row) => row.dramaId)).toEqual(['drm_02', 'drm_01']);
        expect(second.hasMore).toBe(true);

        const third = await favorites.list('user_a', { limit: 2, after: cursorOf(second) });
        expect(third.rows.map((row) => row.dramaId)).toEqual(['drm_00']);
        expect(third.hasMore).toBe(false);
      });

      // The one case `rows.length === limit` gets wrong: a viewer whose favourite count is an exact
      // multiple of the page size would be told there was another page, and handed an empty one.
      it('does not claim more when the last page is exactly full', async () => {
        const favorites = await seed(4);

        const first = await favorites.list('user_a', { limit: 2 });
        const second = await favorites.list('user_a', { limit: 2, after: cursorOf(first) });

        expect(second.rows).toHaveLength(2);
        expect(second.hasMore).toBe(false);
      });

      it('walks the whole list exactly once, with no gap and no repeat', async () => {
        const favorites = await seed(7);
        const seen: string[] = [];

        let after: FavoritesCursor | undefined;
        for (let guard = 0; guard < 10; guard += 1) {
          const page = await favorites.list(
            'user_a',
            after === undefined ? { limit: 3 } : { limit: 3, after },
          );
          seen.push(...page.rows.map((row) => row.dramaId));
          if (!page.hasMore) break;
          after = cursorOf(page);
        }

        expect(seen).toEqual([
          'drm_06',
          'drm_05',
          'drm_04',
          'drm_03',
          'drm_02',
          'drm_01',
          'drm_00',
        ]);
      });

      // Tied timestamps are where a keyset without a tiebreak silently loses rows.
      it('pages through favourites recorded in the same millisecond', async () => {
        const favorites = store();
        for (const dramaId of ['drm_a', 'drm_b', 'drm_c', 'drm_d']) {
          await favorites.add('user_a', dramaId, NOW);
        }

        const first = await favorites.list('user_a', { limit: 2 });
        const second = await favorites.list('user_a', { limit: 2, after: cursorOf(first) });

        expect(first.rows.map((row) => row.dramaId)).toEqual(['drm_d', 'drm_c']);
        expect(second.rows.map((row) => row.dramaId)).toEqual(['drm_b', 'drm_a']);
        expect(second.hasMore).toBe(false);
      });

      // A cursor is a position, not a row reference: the row it names may be gone by the time the
      // next page is asked for, and paging must not stop or restart because of it.
      it('still pages when the row the cursor names has been unfollowed', async () => {
        const favorites = await seed(5);
        const first = await favorites.list('user_a', { limit: 2 });
        const after = cursorOf(first);

        await favorites.remove('user_a', 'drm_03');

        expect(
          (await favorites.list('user_a', { limit: 2, after })).rows.map((row) => row.dramaId),
        ).toEqual(['drm_02', 'drm_01']);
      });

      // A favourite added after the first page was served is newer than every row on it, so it
      // belongs before the cursor and must not appear on a later page.
      it('does not show a newly added favourite on a later page', async () => {
        const favorites = await seed(3);
        const first = await favorites.list('user_a', { limit: 2 });

        await favorites.add('user_a', 'drm_new', NOW + 1_000);

        expect(
          (await favorites.list('user_a', { limit: 2, after: cursorOf(first) })).rows.map(
            (row) => row.dramaId,
          ),
        ).toEqual(['drm_00']);
      });

      it('answers an empty page for a cursor past the end of the list', async () => {
        const favorites = await seed(2);

        const page = await favorites.list('user_a', {
          limit: 2,
          after: { favoritedAtMs: NOW - 1, dramaId: 'drm_00' },
        });

        expect(page).toEqual({ rows: [], hasMore: false });
      });

      // The cursor is a position in one viewer's ordering, but the scope is the `userId` argument.
      // A cursor cannot be used to reach into another viewer's list, which is why it carries no
      // user id at all.
      it('applies a cursor within the requesting viewer’s list only', async () => {
        const favorites = store();
        await favorites.add('user_a', 'drm_1', NOW);
        await favorites.add('user_b', 'drm_2', NOW - 1);

        const page = await favorites.list('user_a', {
          limit: 20,
          after: { favoritedAtMs: NOW, dramaId: 'drm_1' },
        });

        expect(page.rows).toEqual([]);
      });
    });
  });

  describe('is bounded', () => {
    it('drops the oldest rows past its capacity', async () => {
      const favorites = store({ capacity: 2 });

      await favorites.add('user_a', 'drm_1', NOW);
      await favorites.add('user_a', 'drm_2', NOW + 1);
      await favorites.add('user_a', 'drm_3', NOW + 2);

      expect(await favorites.read('user_a', 'drm_1')).toBeUndefined();
      expect(await favorites.read('user_a', 'drm_2')).toBeDefined();
      expect(await favorites.read('user_a', 'drm_3')).toBeDefined();
    });

    // A repeated add is not a write, so it must not reorder eviction either — otherwise a client
    // re-sending the same favourite could push out rows it had never touched.
    it('does not move a row in the eviction order when it is added again', async () => {
      const favorites = store({ capacity: 2 });

      await favorites.add('user_a', 'drm_1', NOW);
      await favorites.add('user_a', 'drm_2', NOW + 1);
      await favorites.add('user_a', 'drm_1', NOW + 2);
      await favorites.add('user_a', 'drm_3', NOW + 3);

      expect(await favorites.read('user_a', 'drm_1')).toBeUndefined();
    });
  });
});
