import { describe, expect, it } from 'vitest';

import { createInMemoryCatalogStore } from '../catalog/store.js';
import {
  SEED_SEARCHABLE_DRAMAS,
  createCatalogDramaDirectory,
  createSeedDramaDirectory,
} from './dramas.js';
import type { SearchableDrama } from './dramas.js';

/**
 * The catalogue stand-in.
 *
 * Two things are worth a test here rather than a comment. The first is that visibility is decided in
 * one place — `listSearchable` — so no caller can forget it. The second is that the seed itself
 * still contains the records that make the interesting cases reachable: a delisted drama that is
 * popular enough for its absence to be conspicuous, and an unpublished one.
 */

describe('createSeedDramaDirectory', () => {
  it('lists published dramas only', async () => {
    const searchable = await createSeedDramaDirectory().listSearchable();

    expect(searchable.every((drama) => drama.status === 'PUBLISHED')).toBe(true);
    expect(searchable.map((drama) => drama.id)).not.toContain('drm_offline_0007');
    expect(searchable.map((drama) => drama.id)).not.toContain('drm_draft_0008');
  });

  // Favouriting has to tell "delisted" from "never existed" — they are a 410 and a 404 — so the
  // lookup deliberately does not apply the visibility filter the listing does.
  it.each([['drm_revenge_0001'], ['drm_offline_0007'], ['drm_draft_0008']])(
    'looks %s up whatever its publication state',
    async (dramaId) => {
      const drama = await createSeedDramaDirectory().lookup(dramaId);

      expect(drama?.id).toBe(dramaId);
    },
  );

  it('answers undefined for a drama that does not exist', async () => {
    expect(await createSeedDramaDirectory().lookup('drm_nope')).toBeUndefined();
  });

  it('accepts an injected seed, so tests are not written against the shipped one', async () => {
    const only: SearchableDrama = {
      id: 'drm_x',
      title: 'X',
      tags: [],
      status: 'PUBLISHED',
      stat: { playCount: 0 },
    };

    expect(await createSeedDramaDirectory([only]).listSearchable()).toEqual([only]);
  });
});

describe('SEED_SEARCHABLE_DRAMAS', () => {
  it('has unique identifiers, which the ranking tiebreak depends on', () => {
    const ids = SEED_SEARCHABLE_DRAMAS.map((drama) => drama.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the unpublished cases the tests need', () => {
    const byId = new Map(SEED_SEARCHABLE_DRAMAS.map((drama) => [drama.id, drama]));

    expect(byId.get('drm_offline_0007')?.status).toBe('OFFLINE');
    expect(byId.get('drm_draft_0008')?.status).toBe('DRAFT');
  });

  // A delisted drama that nobody watched would prove nothing about the filter. This one out-ranks
  // most of the published catalogue, so it would surface near the top of a tag search and its
  // absence from one is a real assertion rather than a coincidence of ordering.
  it('makes the delisted drama popular enough for its absence to be conspicuous', () => {
    const offline = SEED_SEARCHABLE_DRAMAS.find((drama) => drama.id === 'drm_offline_0007');
    const published = SEED_SEARCHABLE_DRAMAS.filter((drama) => drama.status === 'PUBLISHED');
    const moreWatched = published.filter(
      (drama) => drama.stat.playCount > (offline?.stat.playCount ?? 0),
    );

    expect(moreWatched.length).toBeLessThan(published.length / 2);
  });

  // No record here carries a URL of any kind. Cover art belongs to the catalogue's view objects,
  // and a media handle reaches a client only through a playback session (correction A4).
  it('carries no URL', () => {
    expect(JSON.stringify(SEED_SEARCHABLE_DRAMAS)).not.toMatch(/https?:\/\//);
  });
});

describe('createCatalogDramaDirectory', () => {
  it('lists the catalogue’s published dramas, not a parallel seed', async () => {
    const directory = createCatalogDramaDirectory(createInMemoryCatalogStore());
    const searchable = await directory.listSearchable();

    expect(searchable.every((drama) => drama.status === 'PUBLISHED')).toBe(true);
    expect(searchable.map((drama) => drama.id)).toContain('drm_revenge_0001');
    expect(searchable.map((drama) => drama.id)).not.toContain('drm_offline_0007');
    expect(searchable.map((drama) => drama.id)).not.toContain('drm_draft_0008');
  });

  it('looks a delisted drama up so favouriting can tell 410 from 404', async () => {
    const directory = createCatalogDramaDirectory(createInMemoryCatalogStore());
    expect((await directory.lookup('drm_offline_0007'))?.status).toBe('OFFLINE');
    expect(await directory.lookup('drm_nope')).toBeUndefined();
  });
});
