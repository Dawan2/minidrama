import { describe, expect, it } from 'vitest';

import { createInMemoryWatchProgressStore } from './store.js';
import type { WatchProgressRecord } from './progress.js';

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

describe('createInMemoryWatchProgressStore', () => {
  it('returns undefined for an episode nothing was reported against', async () => {
    const store = createInMemoryWatchProgressStore();

    expect(await store.read('user_a', 'ep_1')).toBeUndefined();
  });

  it('reads back what it saved and upserts on the same key', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ positionSec: 45 }));
    await store.save(record({ positionSec: 60 }));

    expect(await store.read('user_a', 'ep_1')).toMatchObject({ positionSec: 60 });
  });

  // The one property that matters most in this file: a resume position is per viewer. A store keyed
  // on the episode alone would pass every other test here and serve one viewer's position to
  // another, which is the least conspicuous kind of data leak.
  it('keeps two viewers of the same episode apart', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ userId: 'user_a', positionSec: 45 }));
    await store.save(record({ userId: 'user_b', positionSec: 5 }));

    expect(await store.read('user_a', 'ep_1')).toMatchObject({ positionSec: 45 });
    expect(await store.read('user_b', 'ep_1')).toMatchObject({ positionSec: 5 });
  });

  it('keeps two episodes of the same viewer apart', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ episodeId: 'ep_1', positionSec: 45 }));
    await store.save(record({ episodeId: 'ep_2', positionSec: 5 }));

    expect(await store.read('user_a', 'ep_1')).toMatchObject({ positionSec: 45 });
    expect(await store.read('user_a', 'ep_2')).toMatchObject({ positionSec: 5 });
  });

  // A printable separator would let a crafted identifier address another pair's row.
  it('cannot be made to collide by identifiers containing separators', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ userId: 'a', episodeId: 'b:c', positionSec: 10 }));
    await store.save(record({ userId: 'a:b', episodeId: 'c', positionSec: 20 }));

    expect(await store.read('a', 'b:c')).toMatchObject({ positionSec: 10 });
    expect(await store.read('a:b', 'c')).toMatchObject({ positionSec: 20 });
  });

  it('drops the least recently written row past its capacity', async () => {
    const store = createInMemoryWatchProgressStore({ capacity: 2 });

    await store.save(record({ episodeId: 'ep_1' }));
    await store.save(record({ episodeId: 'ep_2' }));
    await store.save(record({ episodeId: 'ep_3' }));

    expect(await store.read('user_a', 'ep_1')).toBeUndefined();
    expect(await store.read('user_a', 'ep_2')).toBeDefined();
    expect(await store.read('user_a', 'ep_3')).toBeDefined();
  });

  // Eviction must not target the episode a viewer is actively reporting against, which is the row a
  // heartbeat keeps rewriting.
  it('treats a rewrite as recent activity for eviction purposes', async () => {
    const store = createInMemoryWatchProgressStore({ capacity: 2 });

    await store.save(record({ episodeId: 'ep_1', positionSec: 10 }));
    await store.save(record({ episodeId: 'ep_2' }));
    await store.save(record({ episodeId: 'ep_1', positionSec: 20 }));
    await store.save(record({ episodeId: 'ep_3' }));

    expect(await store.read('user_a', 'ep_1')).toMatchObject({ positionSec: 20 });
    expect(await store.read('user_a', 'ep_2')).toBeUndefined();
  });
});

describe('createInMemoryWatchProgressStore — listing a viewer’s rows', () => {
  it('answers an empty list for a viewer who has reported nothing', async () => {
    const store = createInMemoryWatchProgressStore();

    expect(await store.list('user_a', 10)).toEqual([]);
  });

  // The same property as `read`, on the path that returns many rows at once — and the one that would
  // leak a whole history rather than a single position.
  it('never returns another viewer’s rows', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ userId: 'user_a', episodeId: 'ep_1' }));
    await store.save(record({ userId: 'user_b', episodeId: 'ep_2' }));

    expect((await store.list('user_a', 10)).map((row) => row.episodeId)).toEqual(['ep_1']);
    expect((await store.list('user_b', 10)).map((row) => row.episodeId)).toEqual(['ep_2']);
  });

  it('orders by the server’s clock, newest first', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ episodeId: 'ep_old', updatedAtMs: NOW_MS - 60_000 }));
    await store.save(record({ episodeId: 'ep_new', updatedAtMs: NOW_MS }));
    await store.save(record({ episodeId: 'ep_mid', updatedAtMs: NOW_MS - 30_000 }));

    expect((await store.list('user_a', 10)).map((row) => row.episodeId)).toEqual([
      'ep_new',
      'ep_mid',
      'ep_old',
    ]);
  });

  // A client's clock is not a clock we control. If it ordered this list, a device set a year ahead
  // would pin its episode to the top of that viewer's history for as long as the row lived.
  it('ignores the client’s clock when ordering', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(
      record({
        episodeId: 'ep_future_client',
        clientUpdatedAtMs: NOW_MS + 365 * 24 * 60 * 60 * 1000,
        updatedAtMs: NOW_MS - 60_000,
      }),
    );
    await store.save(record({ episodeId: 'ep_recent', updatedAtMs: NOW_MS }));

    expect((await store.list('user_a', 10))[0]?.episodeId).toBe('ep_recent');
  });

  it('reads no more rows than it was asked for, taking the newest', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ episodeId: 'ep_1', updatedAtMs: NOW_MS - 20_000 }));
    await store.save(record({ episodeId: 'ep_2', updatedAtMs: NOW_MS - 10_000 }));
    await store.save(record({ episodeId: 'ep_3', updatedAtMs: NOW_MS }));

    expect((await store.list('user_a', 2)).map((row) => row.episodeId)).toEqual(['ep_3', 'ep_2']);
  });

  it('reads nothing at all for a non-positive bound', async () => {
    const store = createInMemoryWatchProgressStore();

    await store.save(record({ episodeId: 'ep_1' }));

    expect(await store.list('user_a', 0)).toEqual([]);
    expect(await store.list('user_a', -1)).toEqual([]);
  });
});
