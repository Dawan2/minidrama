import { describe, expect, it } from 'vitest';

import { SEED_CATALOG, createInMemoryCatalogStore, dramaSortKey } from './store.js';
import { isListed, positionEpisodes } from './numbering.js';

const store = createInMemoryCatalogStore();

describe('the seed catalogue', () => {
  // A denormalised counter nobody reconciles is a counter that is eventually wrong, and this one is
  // rendered as "7 episodes" next to a grid that would show a different number.
  it('has counters that agree with the episodes it actually lists', () => {
    for (const drama of SEED_CATALOG.dramas) {
      const positioned = positionEpisodes(
        SEED_CATALOG.seasons.filter((season) => season.dramaId === drama.id),
        SEED_CATALOG.episodes.filter((episode) => episode.dramaId === drama.id),
      );

      expect({
        id: drama.id,
        totalEpisodes: drama.totalEpisodes,
        totalSeasons: drama.totalSeasons,
      }).toEqual({
        id: drama.id,
        totalEpisodes: positioned.filter(isListed).length,
        totalSeasons: SEED_CATALOG.seasons.filter(
          (season) => season.dramaId === drama.id && season.status === 'PUBLISHED',
        ).length,
      });
    }
  });

  it('uses prefixed identifiers so a log line says what it is looking at', () => {
    expect(SEED_CATALOG.dramas.every((drama) => drama.id.startsWith('drm_'))).toBe(true);
    expect(SEED_CATALOG.seasons.every((season) => season.id.startsWith('ssn_'))).toBe(true);
    expect(SEED_CATALOG.episodes.every((episode) => episode.id.startsWith('ep_'))).toBe(true);
  });

  it('gives every identifier to exactly one record', () => {
    const ids = [
      ...SEED_CATALOG.dramas.map((drama) => drama.id),
      ...SEED_CATALOG.seasons.map((season) => season.id),
      ...SEED_CATALOG.episodes.map((episode) => episode.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices every coin-unlockable episode and only those', () => {
    for (const episode of SEED_CATALOG.episodes) {
      const needsPrice = episode.unlockPolicy === 'COIN' || episode.unlockPolicy === 'COIN_OR_VIP';
      expect(needsPrice ? (episode.priceCoins ?? 0) > 0 : episode.priceCoins === null).toBe(true);
    }
  });

  it('carries no media handle: no asset key, no vid, no video URL', () => {
    const serialised = JSON.stringify(SEED_CATALOG);
    expect(serialised).not.toMatch(/\.m3u8|\.mp4|assetKey|"vid"|playUrl|videoUrl/i);
  });
});

describe('listDramas', () => {
  it('serves published dramas most-played first for HOT', async () => {
    const dramas = await store.listDramas({ sort: 'HOT' });

    expect(dramas.map((drama) => drama.id)).toEqual([
      'drm_revenge_0001',
      'drm_dynasty_0002',
      'drm_sweet_0003',
      'drm_suspense_0004',
      'drm_comedy_0005',
      'drm_family_0006',
    ]);
  });

  it('serves the same dramas most-recent first for NEW', async () => {
    const dramas = await store.listDramas({ sort: 'NEW' });

    expect(dramas.map((drama) => drama.id)).toEqual([
      'drm_sweet_0003',
      'drm_family_0006',
      'drm_dynasty_0002',
      'drm_revenge_0001',
      'drm_suspense_0004',
      'drm_comedy_0005',
    ]);
  });

  // The delisted fixture outranks four published dramas on play count and the draft one is the
  // newest record in the catalogue: if either leaked, it would leak at the top of the page.
  it.each(['HOT', 'NEW'] as const)('excludes unpublished dramas from the %s list', async (sort) => {
    const ids = (await store.listDramas({ sort })).map((drama) => drama.id);

    expect(ids).not.toContain('drm_offline_0007');
    expect(ids).not.toContain('drm_draft_0008');
  });

  it('filters by category and by tag', async () => {
    const revenge = await store.listDramas({ sort: 'HOT', category: 'REVENGE' });
    expect(revenge.map((drama) => drama.id)).toEqual(['drm_revenge_0001']);

    const tagged = await store.listDramas({ sort: 'HOT', tag: 'revenge' });
    expect(tagged.map((drama) => drama.id)).toEqual(['drm_revenge_0001', 'drm_dynasty_0002']);
  });

  it('returns an empty list for a filter nothing matches', async () => {
    expect(await store.listDramas({ sort: 'HOT', tag: 'no-such-tag' })).toEqual([]);
  });

  it('orders by a sort key that agrees with the order it returns', async () => {
    for (const sort of ['HOT', 'NEW'] as const) {
      const dramas = await store.listDramas({ sort });
      const keys = dramas.map((drama) => dramaSortKey(sort, drama));

      expect(keys).toEqual([...keys].sort());
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('listEpisodes', () => {
  it('flattens seasons into one running order', async () => {
    const episodes = await store.listEpisodes('drm_dynasty_0002');

    expect(episodes.map((entry) => [entry.episode.id, entry.globalEpisodeNumber] as const)).toEqual(
      [
        ['ep_dynasty_s1e01', 1],
        ['ep_dynasty_s1e02', 2],
        ['ep_dynasty_s1e03', 3],
        ['ep_dynasty_s2e01', 4],
        ['ep_dynasty_s2e02', 5],
        ['ep_dynasty_s2e03', 6],
      ],
    );
  });

  it('hides an offline season but keeps the numbers it used', async () => {
    const episodes = await store.listEpisodes('drm_dynasty_0002');
    const ids = episodes.map((entry) => entry.episode.id);

    expect(ids).not.toContain('ep_dynasty_s3e01');
    // Season 3 holds global numbers 7 and 8, so the visible list stops at 6 rather than renumbering.
    expect(Math.max(...episodes.map((entry) => entry.globalEpisodeNumber))).toBe(6);
  });

  it('lists an offline episode and omits a draft one', async () => {
    const ids = (await store.listEpisodes('drm_revenge_0001')).map((entry) => entry.episode.id);

    expect(ids).toContain('ep_revenge_e07');
    expect(ids).not.toContain('ep_revenge_e08');
  });

  it('answers with an empty list for a drama it does not have', async () => {
    expect(await store.listEpisodes('drm_missing')).toEqual([]);
  });
});

describe('getDrama and getEpisode', () => {
  it('returns unpublished records rather than hiding them from the caller', async () => {
    // The route decides whether "draft" means 404 and "offline" means 410. The store's job is to
    // report what exists; hiding it here would make the two indistinguishable.
    expect((await store.getDrama('drm_draft_0008'))?.drama.status).toBe('DRAFT');
    expect((await store.getDrama('drm_offline_0007'))?.drama.status).toBe('OFFLINE');
  });

  it('omits draft seasons from a drama it does return', async () => {
    const found = await store.getDrama('drm_draft_0008');
    expect(found?.seasons).toEqual([]);
  });

  it('returns an episode with the drama it belongs to and its position', async () => {
    const found = await store.getEpisode('ep_dynasty_s2e01');

    expect(found?.drama.id).toBe('drm_dynasty_0002');
    expect(found?.positioned.globalEpisodeNumber).toBe(4);
    expect(found?.positioned.episode.episodeNumber).toBe(1);
    expect(found?.positioned.seasonNumber).toBe(2);
  });

  it('finds an episode inside an offline season, which the list does not show', async () => {
    const found = await store.getEpisode('ep_dynasty_s3e01');
    expect(found?.positioned.seasonStatus).toBe('OFFLINE');
  });

  it('does not index draft episodes at all', async () => {
    expect(await store.getEpisode('ep_revenge_e08')).toBeUndefined();
    expect(await store.getEpisode('ep_nonexistent')).toBeUndefined();
  });
});

describe('getDramas', () => {
  it('returns every requested record in one map, including unpublished ones', async () => {
    const found = await store.getDramas([
      'drm_revenge_0001',
      'drm_offline_0007',
      'drm_draft_0008',
      'drm_missing',
    ]);

    expect([...found.keys()]).toEqual(['drm_revenge_0001', 'drm_offline_0007', 'drm_draft_0008']);
    expect(found.get('drm_revenge_0001')?.status).toBe('PUBLISHED');
    expect(found.get('drm_offline_0007')?.status).toBe('OFFLINE');
    expect(found.get('drm_draft_0008')?.status).toBe('DRAFT');
    expect(found.has('drm_missing')).toBe(false);
  });

  it('does not scan the catalogue when asked for nothing', async () => {
    const found = await store.getDramas([]);
    expect(found.size).toBe(0);
  });
});
