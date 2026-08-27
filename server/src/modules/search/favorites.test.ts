import { describe, expect, it } from 'vitest';

import { createInMemoryFavoritesStore } from './favorites.js';

/**
 * The store, on its own.
 *
 * The per-viewer key is tested here rather than only through HTTP because it is the property that
 * makes a cross-viewer leak impossible, and because a store keyed on `dramaId` alone would pass
 * every single-viewer test that exists.
 */

const NOW = Date.parse('2026-08-27T12:00:00.000Z');

describe('createInMemoryFavoritesStore', () => {
  it('records a favourite and reads it back', async () => {
    const store = createInMemoryFavoritesStore();

    await store.add('user_a', 'drm_1', NOW);

    expect(await store.read('user_a', 'drm_1')).toEqual({
      userId: 'user_a',
      dramaId: 'drm_1',
      favoritedAtMs: NOW,
    });
  });

  it('answers undefined for a drama this viewer never followed', async () => {
    const store = createInMemoryFavoritesStore();

    expect(await store.read('user_a', 'drm_1')).toBeUndefined();
  });

  // A double-tapped button, or a retry after a network failure, is not a new decision.
  it('keeps the first timestamp when the same favourite is added again', async () => {
    const store = createInMemoryFavoritesStore();

    await store.add('user_a', 'drm_1', NOW);
    const second = await store.add('user_a', 'drm_1', NOW + 60_000);

    expect(second.favoritedAtMs).toBe(NOW);
    expect((await store.read('user_a', 'drm_1'))?.favoritedAtMs).toBe(NOW);
  });

  it('removes a favourite, and reports whether there was one', async () => {
    const store = createInMemoryFavoritesStore();

    await store.add('user_a', 'drm_1', NOW);

    expect(await store.remove('user_a', 'drm_1')).toBe(true);
    expect(await store.remove('user_a', 'drm_1')).toBe(false);
    expect(await store.read('user_a', 'drm_1')).toBeUndefined();
  });

  it('lets a viewer follow a drama again after unfollowing it, with a new timestamp', async () => {
    const store = createInMemoryFavoritesStore();

    await store.add('user_a', 'drm_1', NOW);
    await store.remove('user_a', 'drm_1');
    await store.add('user_a', 'drm_1', NOW + 60_000);

    expect((await store.read('user_a', 'drm_1'))?.favoritedAtMs).toBe(NOW + 60_000);
  });

  describe('is keyed by viewer and drama', () => {
    it('never serves one viewer the favourites of another', async () => {
      const store = createInMemoryFavoritesStore();

      await store.add('user_a', 'drm_1', NOW);

      expect(await store.read('user_b', 'drm_1')).toBeUndefined();
    });

    it('does not let one viewer remove another’s favourite', async () => {
      const store = createInMemoryFavoritesStore();

      await store.add('user_a', 'drm_1', NOW);

      expect(await store.remove('user_b', 'drm_1')).toBe(false);
      expect(await store.read('user_a', 'drm_1')).toBeDefined();
    });

    it('keeps two dramas of one viewer independent', async () => {
      const store = createInMemoryFavoritesStore();

      await store.add('user_a', 'drm_1', NOW);
      await store.add('user_a', 'drm_2', NOW + 1);
      await store.remove('user_a', 'drm_1');

      expect(await store.read('user_a', 'drm_1')).toBeUndefined();
      expect(await store.read('user_a', 'drm_2')).toBeDefined();
    });

    // The separator cannot occur in either identifier. Concatenating with a printable one is how a
    // viewer whose id contains the separator reads somebody else's row.
    it('cannot be made to collide by a crafted identifier', async () => {
      const store = createInMemoryFavoritesStore();

      await store.add('user_a', 'x:drm_1', NOW);

      expect(await store.read('user_a:x', 'drm_1')).toBeUndefined();
      expect(await store.read('user_a', 'x:drm_1')).toBeDefined();
    });
  });

  describe('is bounded', () => {
    it('drops the oldest rows past its capacity', async () => {
      const store = createInMemoryFavoritesStore({ capacity: 2 });

      await store.add('user_a', 'drm_1', NOW);
      await store.add('user_a', 'drm_2', NOW + 1);
      await store.add('user_a', 'drm_3', NOW + 2);

      expect(await store.read('user_a', 'drm_1')).toBeUndefined();
      expect(await store.read('user_a', 'drm_2')).toBeDefined();
      expect(await store.read('user_a', 'drm_3')).toBeDefined();
    });

    // A repeated add is not a write, so it must not reorder eviction either — otherwise a client
    // re-sending the same favourite could push out rows it had never touched.
    it('does not move a row in the eviction order when it is added again', async () => {
      const store = createInMemoryFavoritesStore({ capacity: 2 });

      await store.add('user_a', 'drm_1', NOW);
      await store.add('user_a', 'drm_2', NOW + 1);
      await store.add('user_a', 'drm_1', NOW + 2);
      await store.add('user_a', 'drm_3', NOW + 3);

      expect(await store.read('user_a', 'drm_1')).toBeUndefined();
    });
  });
});
