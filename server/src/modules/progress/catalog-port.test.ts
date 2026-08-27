import { describe, expect, it } from 'vitest';

import { FIXTURE_WORLD } from '../entitlement/fixtures.js';
import { createFixtureWatchHistoryCatalogPort, fixtureDramaSummary } from './fixtures.js';
import { createUnavailableWatchHistoryCatalogPort } from './catalog-port.js';

describe('createUnavailableWatchHistoryCatalogPort', () => {
  // The one property that matters: it does not answer "no facts". An empty answer is
  // indistinguishable from "this viewer has watched nothing", and telling a viewer they have watched
  // nothing is a claim they act on by leaving.
  it('refuses rather than answering with no facts', async () => {
    const port = createUnavailableWatchHistoryCatalogPort();

    expect(await port.loadWatchedEpisodeFacts(['ep_fx_s1e01'])).toEqual({
      ok: false,
      error: 'CATALOG_UNAVAILABLE',
    });
  });

  it('refuses an empty request too, rather than looking like a working port', async () => {
    const port = createUnavailableWatchHistoryCatalogPort();

    expect((await port.loadWatchedEpisodeFacts([])).ok).toBe(false);
  });
});

describe('createFixtureWatchHistoryCatalogPort', () => {
  const port = createFixtureWatchHistoryCatalogPort();

  it('numbers an episode across its drama, not within its season', async () => {
    const facts = await port.loadWatchedEpisodeFacts(['ep_fx_s1e01', 'ep_fx_s2e01']);
    if (!facts.ok) throw new Error('the fixture port refused');

    // Both are "episode 1" of their season. Only one of them is episode 1 of the drama.
    expect(facts.value.get('ep_fx_s1e01')?.globalEpisodeNumber).toBe(1);
    expect(facts.value.get('ep_fx_s2e01')?.globalEpisodeNumber).toBe(11);
  });

  it('describes both fixture seasons as one drama', async () => {
    const facts = await port.loadWatchedEpisodeFacts(['ep_fx_s1e01', 'ep_fx_s2e07']);
    if (!facts.ok) throw new Error('the fixture port refused');

    expect(facts.value.get('ep_fx_s1e01')?.drama.id).toBe('drm_fx_revenge');
    expect(facts.value.get('ep_fx_s2e07')?.drama.id).toBe('drm_fx_revenge');
  });

  // A missing key is an answer: the caller drops the row rather than failing the page.
  it('leaves out an episode it has never heard of', async () => {
    const facts = await port.loadWatchedEpisodeFacts(['ep_not_a_thing']);
    if (!facts.ok) throw new Error('the fixture port refused');

    expect(facts.value.size).toBe(0);
  });

  it('leaves out an episode whose drama is no longer on the shelf', async () => {
    const facts = await port.loadWatchedEpisodeFacts(['ep_fx_w1e01']);
    if (!facts.ok) throw new Error('the fixture port refused');

    expect(facts.value.has('ep_fx_w1e01')).toBe(false);
    // The drama exists and has a summary; it is its publication state that keeps it out of a list.
    expect(fixtureDramaSummary('drm_fx_withdrawn')).toBeDefined();
  });

  it('carries the display fields a history row needs and no playback identifier', async () => {
    const facts = await port.loadWatchedEpisodeFacts(['ep_fx_s1e01']);
    if (!facts.ok) throw new Error('the fixture port refused');

    const drama = facts.value.get('ep_fx_s1e01')?.drama;

    expect(drama).toMatchObject({
      id: 'drm_fx_revenge',
      title: expect.any(String),
      coverUrl: expect.any(String),
      totalEpisodes: expect.any(Number),
      freeEpisodes: 5,
    });
    expect(JSON.stringify(drama)).not.toMatch(/vid|assetKey|playAuthToken/i);
  });

  // Two fixture worlds would eventually disagree, and these are the two fields they would disagree
  // about first: the free window, which decides what a viewer is told is free, and the drama-wide
  // episode number, which is what that window is counted in.
  it('agrees with the entitlement fixture world it is built from', async () => {
    const episodeIds = FIXTURE_WORLD.episodes.map((entry) => entry.episode.id);
    const facts = await port.loadWatchedEpisodeFacts(episodeIds);
    if (!facts.ok) throw new Error('the fixture port refused');

    for (const placed of FIXTURE_WORLD.episodes) {
      const described = facts.value.get(placed.episode.id);
      const drama = FIXTURE_WORLD.dramas.find((entry) => entry.id === placed.dramaId);

      if (drama?.status !== 'PUBLISHED') {
        expect(described).toBeUndefined();
        continue;
      }

      expect(described?.globalEpisodeNumber).toBe(placed.episode.globalEpisodeNumber);
      expect(described?.drama.id).toBe(placed.dramaId);
      expect(described?.drama.freeEpisodes).toBe(drama.freeEpisodes);
    }
  });
});
