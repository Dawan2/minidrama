import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { createAdUnlock, createCoinUnlock, newUnlockId } from './unlocks.js';
import { createInMemoryUnlockStore } from './unlock-store.js';
import { createSqliteUnlockStore } from './sqlite-unlock-store.js';
import type { Unlock } from './unlocks.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * The `(userId, episodeId)` unique index of `docs/12-domain-model.md` §6.1, as behaviour.
 *
 * Every caller of `record` is a retry path — a redelivered callback, a replayed event, a second
 * order for the same episode — so the interesting assertions are all about the second write: it
 * reports the row that is already there, it does not create a second one, and it does not restamp
 * the first. The row is what makes an episode playable, so a duplicate is not a tidiness problem:
 * two receipts for one purchase is what makes a refund unable to revoke access.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

interface StoreHandle {
  readonly store: UnlockStore;
  close(): void;
}

function unlock(overrides: Partial<Unlock> = {}): Unlock {
  return {
    ...createCoinUnlock({
      id: newUnlockId(),
      userId: 'usr_1',
      episodeId: 'ep_1',
      dramaId: 'drm_1',
      costCoins: 300,
      orderId: 'uord_1',
      grantedAtMs: NOW,
    }),
    ...overrides,
  };
}

const backends: ReadonlyArray<readonly [string, () => StoreHandle]> = [
  ['in-memory', () => ({ store: createInMemoryUnlockStore(), close: () => undefined })],
  [
    'sqlite',
    () => {
      const db = openMigratedSqlite(':memory:');
      return { store: createSqliteUnlockStore(db), close: () => db.close() };
    },
  ],
];

describe('createCoinUnlock', () => {
  it('writes a permanent coin receipt, and takes neither field from a caller', () => {
    expect(
      createCoinUnlock({
        id: 'ulk_1',
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        costCoins: 300,
        orderId: 'uord_1',
        grantedAtMs: NOW,
      }),
    ).toEqual({
      id: 'ulk_1',
      userId: 'usr_1',
      episodeId: 'ep_1',
      dramaId: 'drm_1',
      method: 'COIN',
      costCoins: 300,
      orderId: 'uord_1',
      grantedAtMs: NOW,
      expiresAtMs: null,
    });
  });

  it('mints ids in the reserved prefix, and distinct ones', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newUnlockId()));

    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^ulk_[0-9a-f]{32}$/);
  });
});

describe('createAdUnlock', () => {
  it('writes a permanent AD receipt at cost 0, keyed on the session id', () => {
    expect(
      createAdUnlock({
        id: 'ulk_ad',
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        sessionId: 'ads_1',
        grantedAtMs: NOW,
      }),
    ).toEqual({
      id: 'ulk_ad',
      userId: 'usr_1',
      episodeId: 'ep_1',
      dramaId: 'drm_1',
      method: 'AD',
      costCoins: 0,
      orderId: 'ads_1',
      grantedAtMs: NOW,
      expiresAtMs: null,
    });
  });
});

describe.each(backends)('UnlockStore (%s)', (_label, open) => {
  let handle: StoreHandle;
  let store: UnlockStore;

  beforeEach(() => {
    handle = open();
    store = handle.store;
  });

  afterEach(() => {
    handle.close();
  });

  it('records an unlock and reports it as created', async () => {
    const recorded = await store.record(unlock({ id: 'ulk_first' }));

    expect(recorded).toEqual({
      ok: true,
      value: { unlock: unlock({ id: 'ulk_first' }), created: true },
    });
    expect(await store.findForEpisode('usr_1', 'ep_1')).toMatchObject({ id: 'ulk_first' });
  });

  // The second write is the one that matters: it is a retry, not a second purchase.
  it('keeps one row for one viewer and one episode', async () => {
    await store.record(unlock({ id: 'ulk_first' }));
    const second = await store.record(unlock({ id: 'ulk_second', orderId: 'uord_2' }));

    expect(second.ok && second.value.created).toBe(false);
    expect(await store.list()).toHaveLength(1);
  });

  /**
   * The row that is already there is returned, not the one that was offered. The caller stamps
   * `unlockId` onto the order from this value, so answering with the rejected id would leave an
   * order pointing at a receipt no table holds.
   */
  it('answers a duplicate with the stored row rather than the offered one', async () => {
    await store.record(unlock({ id: 'ulk_first', orderId: 'uord_1', grantedAtMs: NOW }));

    const second = await store.record(
      unlock({ id: 'ulk_second', orderId: 'uord_2', grantedAtMs: NOW + 90_000 }),
    );

    expect(second.ok && second.value.unlock).toMatchObject({
      id: 'ulk_first',
      orderId: 'uord_1',
      grantedAtMs: NOW,
    });
  });

  it('does not restamp the first grant', async () => {
    await store.record(unlock({ grantedAtMs: NOW }));
    await store.record(unlock({ grantedAtMs: NOW + 90_000 }));

    expect(await store.findForEpisode('usr_1', 'ep_1')).toMatchObject({ grantedAtMs: NOW });
  });

  // The index is a pair. One viewer buying two episodes, and two viewers buying one, are four
  // distinct receipts — a store keyed on either half alone would give one of them away.
  it('keeps one viewer\u2019s episodes apart', async () => {
    await store.record(unlock({ episodeId: 'ep_1' }));
    await store.record(unlock({ episodeId: 'ep_2' }));

    expect(await store.list()).toHaveLength(2);
    expect(await store.findForEpisode('usr_1', 'ep_2')).toBeDefined();
  });

  it('keeps two viewers apart', async () => {
    await store.record(unlock({ userId: 'usr_1' }));
    await store.record(unlock({ userId: 'usr_2' }));

    expect(await store.list()).toHaveLength(2);
    expect(await store.findForEpisode('usr_2', 'ep_1')).toBeDefined();
  });

  it('reports an episode the viewer does not hold as absent', async () => {
    await store.record(unlock({ userId: 'usr_1', episodeId: 'ep_1' }));

    expect(await store.findForEpisode('usr_1', 'ep_2')).toBeUndefined();
    expect(await store.findForEpisode('usr_2', 'ep_1')).toBeUndefined();
  });

  /**
   * Nothing evicts. The order store bounds its map, and there a dropped record is a payment to
   * reconcile; here it would be an episode somebody paid for going dark under load.
   */
  it('drops nothing as it fills', async () => {
    for (let index = 0; index < 5000; index += 1) {
      await store.record(unlock({ episodeId: `ep_${index}` }));
    }

    expect(await store.list()).toHaveLength(5000);
    expect(await store.findForEpisode('usr_1', 'ep_0')).toBeDefined();
  });
});
