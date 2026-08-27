import { describe, expect, it } from 'vitest';

import {
  CONTINUE_WATCHING_SCAN_LIMIT,
  createProgressContinueWatchingSource,
} from './continue-watching.js';
import { createEmptyContinueWatchingSource } from './feed.js';
import { createInMemoryWatchProgressStore } from '../progress/store.js';
import type { WatchProgressRecord } from '../progress/progress.js';
import type { WatchProgressStore } from '../progress/store.js';

const NOW_MS = Date.parse('2026-08-27T12:00:00.000Z');

function record(overrides: Partial<WatchProgressRecord> = {}): WatchProgressRecord {
  return {
    userId: 'user_a',
    episodeId: 'ep_sweet_e02',
    positionSec: 41,
    durationSec: 95,
    completed: false,
    clientUpdatedAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
    ...overrides,
  };
}

function countingStore(inner: WatchProgressStore): {
  readonly store: WatchProgressStore;
  readonly listed: string[];
} {
  const listed: string[] = [];
  return {
    listed,
    store: {
      read: (userId, episodeId) => inner.read(userId, episodeId),
      save: (row) => inner.save(row),
      list: async (userId, limit) => {
        listed.push(userId);
        return inner.list(userId, limit);
      },
    },
  };
}

describe('createProgressContinueWatchingSource', () => {
  it('is empty for an anonymous viewer and does not read the store', async () => {
    const inner = createInMemoryWatchProgressStore();
    await inner.save(record());
    const counted = countingStore(inner);
    const source = createProgressContinueWatchingSource(counted.store);

    expect(await source.forViewer(null)).toEqual([]);
    expect(counted.listed).toEqual([]);
  });

  it('does not invent a shared anonymous account from an empty user id', async () => {
    const inner = createInMemoryWatchProgressStore();
    await inner.save(record());
    const counted = countingStore(inner);
    const source = createProgressContinueWatchingSource(counted.store);

    expect(await source.forViewer('')).toEqual([]);
    expect(counted.listed).toEqual([]);
  });

  it('returns the heartbeat the same viewer wrote, newest first', async () => {
    const store = createInMemoryWatchProgressStore();
    await store.save(record({ episodeId: 'ep_sweet_e01', positionSec: 12, updatedAtMs: NOW_MS }));
    await store.save(
      record({ episodeId: 'ep_sweet_e02', positionSec: 41, updatedAtMs: NOW_MS + 1_000 }),
    );
    const source = createProgressContinueWatchingSource(store);

    expect(await source.forViewer('user_a')).toEqual([
      { episodeId: 'ep_sweet_e02', positionSec: 41 },
      { episodeId: 'ep_sweet_e01', positionSec: 12 },
    ]);
  });

  it("does not leak another viewer's rows onto this rail", async () => {
    const store = createInMemoryWatchProgressStore();
    await store.save(record({ userId: 'user_b', positionSec: 80 }));
    const source = createProgressContinueWatchingSource(store);

    expect(await source.forViewer('user_a')).toEqual([]);
  });

  it('does not invent a restart when the stored row is marked completed', async () => {
    const store = createInMemoryWatchProgressStore();
    await store.save(record({ positionSec: 90, completed: true }));
    const source = createProgressContinueWatchingSource(store);

    expect(await source.forViewer('user_a')).toEqual([
      { episodeId: 'ep_sweet_e02', positionSec: 90 },
    ]);
  });

  it('drops a stored position that is not a non-negative integer rather than forwarding it', async () => {
    const store = createInMemoryWatchProgressStore();
    await store.save(record({ positionSec: -3 }));
    const source = createProgressContinueWatchingSource(store);

    expect(await source.forViewer('user_a')).toEqual([]);
  });

  it(`caps the read at ${CONTINUE_WATCHING_SCAN_LIMIT} rows`, async () => {
    const inner = createInMemoryWatchProgressStore();
    let observedLimit: number | undefined;
    const store: WatchProgressStore = {
      read: (userId, episodeId) => inner.read(userId, episodeId),
      save: (row) => inner.save(row),
      list: async (userId, limit) => {
        observedLimit = limit;
        return inner.list(userId, limit);
      },
    };
    const source = createProgressContinueWatchingSource(store);

    await source.forViewer('user_a');
    expect(observedLimit).toBe(CONTINUE_WATCHING_SCAN_LIMIT);
  });
});

describe('createEmptyContinueWatchingSource', () => {
  it('stays empty so a test can pin the rail off without standing up progress', async () => {
    expect(await createEmptyContinueWatchingSource().forViewer('user_a')).toEqual([]);
  });
});
