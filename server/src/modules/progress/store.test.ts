import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { createInMemoryWatchProgressStore } from './store.js';
import { createSqliteWatchProgressStore } from './sqlite-watch-progress-store.js';
import type { InMemoryWatchProgressStoreOptions, WatchProgressStore } from './store.js';
import type { WatchProgressRecord } from './progress.js';

/**
 * Both implementations run the same suite. The in-memory map is the default; sqlite is what
 * `DATABASE_URL=sqlite:<path>` puts behind the interface. Filtering sqlite out of `describe.each`
 * is how the durable path would ship untested.
 */

const NOW_MS = Date.parse('2026-08-27T12:00:00.000Z');

function record(overrides: Partial<WatchProgressRecord> = {}): WatchProgressRecord {
  return {
    userId: 'user_a',
    episodeId: 'ep_1',
    positionSec: 45,
    durationSec: 95,
    completed: false,
    clientUpdatedAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
    ...overrides,
  };
}

interface StoreHandle {
  readonly store: WatchProgressStore;
  close(): void;
}

const backends: ReadonlyArray<
  readonly [string, (options?: InMemoryWatchProgressStoreOptions) => StoreHandle]
> = [
  [
    'in-memory',
    (options) => ({ store: createInMemoryWatchProgressStore(options), close: () => undefined }),
  ],
  [
    'sqlite',
    (options) => {
      const db = openMigratedSqlite(':memory:');
      return { store: createSqliteWatchProgressStore(db, options), close: () => db.close() };
    },
  ],
];

describe.each(backends)('WatchProgressStore (%s)', (_label, open) => {
  const handles: StoreHandle[] = [];

  function store(options?: InMemoryWatchProgressStoreOptions): WatchProgressStore {
    const handle = open(options);
    handles.push(handle);
    return handle.store;
  }

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it('returns undefined for an episode nothing was reported against', async () => {
    expect(await store().read('user_a', 'ep_1')).toBeUndefined();
  });

  it('reads back what it saved and upserts on the same key', async () => {
    const progress = store();

    await progress.save(record({ positionSec: 45 }));
    await progress.save(record({ positionSec: 60 }));

    expect(await progress.read('user_a', 'ep_1')).toMatchObject({ positionSec: 60 });
  });

  // The one property that matters most in this file: a resume position is per viewer. A store keyed
  // on the episode alone would pass every other test here and serve one viewer's position to
  // another, which is the least conspicuous kind of data leak.
  it('keeps two viewers of the same episode apart', async () => {
    const progress = store();

    await progress.save(record({ userId: 'user_a', positionSec: 45 }));
    await progress.save(record({ userId: 'user_b', positionSec: 5 }));

    expect(await progress.read('user_a', 'ep_1')).toMatchObject({ positionSec: 45 });
    expect(await progress.read('user_b', 'ep_1')).toMatchObject({ positionSec: 5 });
  });

  it('keeps two episodes of the same viewer apart', async () => {
    const progress = store();

    await progress.save(record({ episodeId: 'ep_1', positionSec: 45 }));
    await progress.save(record({ episodeId: 'ep_2', positionSec: 5 }));

    expect(await progress.read('user_a', 'ep_1')).toMatchObject({ positionSec: 45 });
    expect(await progress.read('user_a', 'ep_2')).toMatchObject({ positionSec: 5 });
  });

  // A printable separator would let a crafted identifier address another pair's row.
  it('cannot be made to collide by identifiers containing separators', async () => {
    const progress = store();

    await progress.save(record({ userId: 'a', episodeId: 'b:c', positionSec: 10 }));
    await progress.save(record({ userId: 'a:b', episodeId: 'c', positionSec: 20 }));

    expect(await progress.read('a', 'b:c')).toMatchObject({ positionSec: 10 });
    expect(await progress.read('a:b', 'c')).toMatchObject({ positionSec: 20 });
  });

  it('drops the least recently written row past its capacity', async () => {
    const progress = store({ capacity: 2 });

    await progress.save(record({ episodeId: 'ep_1' }));
    await progress.save(record({ episodeId: 'ep_2' }));
    await progress.save(record({ episodeId: 'ep_3' }));

    expect(await progress.read('user_a', 'ep_1')).toBeUndefined();
    expect(await progress.read('user_a', 'ep_2')).toBeDefined();
    expect(await progress.read('user_a', 'ep_3')).toBeDefined();
  });

  // Eviction must not target the episode a viewer is actively reporting against, which is the row a
  // heartbeat keeps rewriting.
  it('treats a rewrite as recent activity for eviction purposes', async () => {
    const progress = store({ capacity: 2 });

    await progress.save(record({ episodeId: 'ep_1', positionSec: 10 }));
    await progress.save(record({ episodeId: 'ep_2' }));
    await progress.save(record({ episodeId: 'ep_1', positionSec: 20 }));
    await progress.save(record({ episodeId: 'ep_3' }));

    expect(await progress.read('user_a', 'ep_1')).toMatchObject({ positionSec: 20 });
    expect(await progress.read('user_a', 'ep_2')).toBeUndefined();
  });

  describe('listing a viewer’s rows', () => {
    it('answers an empty list for a viewer who has reported nothing', async () => {
      expect(await store().list('user_a', 10)).toEqual([]);
    });

    // The same property as `read`, on the path that returns many rows at once — and the one that
    // would leak a whole history rather than a single position.
    it('never returns another viewer’s rows', async () => {
      const progress = store();

      await progress.save(record({ userId: 'user_a', episodeId: 'ep_1' }));
      await progress.save(record({ userId: 'user_b', episodeId: 'ep_2' }));

      expect((await progress.list('user_a', 10)).map((row) => row.episodeId)).toEqual(['ep_1']);
      expect((await progress.list('user_b', 10)).map((row) => row.episodeId)).toEqual(['ep_2']);
    });

    it('orders by the server’s clock, newest first', async () => {
      const progress = store();

      await progress.save(record({ episodeId: 'ep_old', updatedAtMs: NOW_MS - 60_000 }));
      await progress.save(record({ episodeId: 'ep_new', updatedAtMs: NOW_MS }));
      await progress.save(record({ episodeId: 'ep_mid', updatedAtMs: NOW_MS - 30_000 }));

      expect((await progress.list('user_a', 10)).map((row) => row.episodeId)).toEqual([
        'ep_new',
        'ep_mid',
        'ep_old',
      ]);
    });

    // A client's clock is not a clock we control. If it ordered this list, a device set a year ahead
    // would pin its episode to the top of that viewer's history for as long as the row lived.
    it('ignores the client’s clock when ordering', async () => {
      const progress = store();

      await progress.save(
        record({
          episodeId: 'ep_future_client',
          clientUpdatedAtMs: NOW_MS + 365 * 24 * 60 * 60 * 1000,
          updatedAtMs: NOW_MS - 60_000,
        }),
      );
      await progress.save(record({ episodeId: 'ep_recent', updatedAtMs: NOW_MS }));

      expect((await progress.list('user_a', 10))[0]?.episodeId).toBe('ep_recent');
    });

    it('reads no more rows than it was asked for, taking the newest', async () => {
      const progress = store();

      await progress.save(record({ episodeId: 'ep_1', updatedAtMs: NOW_MS - 20_000 }));
      await progress.save(record({ episodeId: 'ep_2', updatedAtMs: NOW_MS - 10_000 }));
      await progress.save(record({ episodeId: 'ep_3', updatedAtMs: NOW_MS }));

      expect((await progress.list('user_a', 2)).map((row) => row.episodeId)).toEqual([
        'ep_3',
        'ep_2',
      ]);
    });

    it('reads nothing at all for a non-positive bound', async () => {
      const progress = store();

      await progress.save(record({ episodeId: 'ep_1' }));

      expect(await progress.list('user_a', 0)).toEqual([]);
      expect(await progress.list('user_a', -1)).toEqual([]);
    });
  });
});
