import { describe, expect, it } from 'vitest';

import { FIXTURE_NOW_MS, FIXTURE_WORLD, createFixtureEntitlementFactsPort } from './fixtures.js';

/**
 * The fixtures encode the two defects this slot closes, so they are worth asserting about directly.
 * A fixture world that quietly loses its second season, or whose lapsed subscriber stops being
 * lapsed, would leave the DM-1 and DM-3 tests passing for the wrong reason.
 */

describe('the fixture world', () => {
  it('spans two published seasons of one drama, so the two episode numbers disagree', () => {
    const episodes = FIXTURE_WORLD.episodes.filter((entry) => entry.dramaId === 'drm_fx_revenge');
    const seasonIds = new Set(episodes.map((entry) => entry.seasonId));

    expect(seasonIds.size).toBeGreaterThanOrEqual(2);

    const perSeasonNumbers = episodes.map((entry) => entry.episode.episodeNumber);
    const dramaWideNumbers = episodes.map((entry) => entry.episode.globalEpisodeNumber);

    // Per-season numbers repeat across seasons; drama-wide numbers cannot.
    expect(new Set(perSeasonNumbers).size).toBeLessThan(perSeasonNumbers.length);
    expect(new Set(dramaWideNumbers).size).toBe(dramaWideNumbers.length);
  });

  it('holds an episode that is inside the free window by season number and outside it by drama number', () => {
    const drama = FIXTURE_WORLD.dramas.find((entry) => entry.id === 'drm_fx_revenge');
    const episode = FIXTURE_WORLD.episodes.find(
      (entry) => entry.episode.id === 'ep_fx_s2e01',
    )?.episode;

    expect(drama?.freeEpisodes).toBe(5);
    expect(episode?.episodeNumber).toBeLessThanOrEqual(5);
    expect(episode?.globalEpisodeNumber).toBeGreaterThan(5);
  });

  it('gives usr_fx_vip_expired a subscription whose flag outlived its expiry', () => {
    const lapsed = FIXTURE_WORLD.viewers.find((entry) => entry.userId === 'usr_fx_vip_expired');

    expect(lapsed?.vip?.active).toBe(true);
    expect(lapsed?.vip?.expiresAtMs).toBeLessThan(FIXTURE_NOW_MS);
  });

  it('gives usr_fx_vip_expired one purchase and one VIP viewing receipt', () => {
    const lapsed = FIXTURE_WORLD.viewers.find((entry) => entry.userId === 'usr_fx_vip_expired');

    expect(lapsed?.unlocks).toEqual([
      { episodeId: 'ep_fx_s2e03', method: 'COIN', expiresAtMs: null },
      { episodeId: 'ep_fx_s2e05', method: 'VIP', expiresAtMs: null },
    ]);
  });

  it('points every episode at a season and a drama that exist', () => {
    for (const entry of FIXTURE_WORLD.episodes) {
      const season = FIXTURE_WORLD.seasons.find((candidate) => candidate.id === entry.seasonId);
      expect(season, entry.episode.id).toBeDefined();
      expect(season?.dramaId, entry.episode.id).toBe(entry.dramaId);
      expect(
        FIXTURE_WORLD.dramas.some((candidate) => candidate.id === entry.dramaId),
        entry.episode.id,
      ).toBe(true);
    }
  });
});

describe('the fixture facts port', () => {
  const port = createFixtureEntitlementFactsPort();

  it('gathers the drama, the season, the episode and the viewer', async () => {
    const facts = await port.loadEpisodeAccessFacts({
      episodeId: 'ep_fx_s2e03',
      viewerId: 'usr_fx_vip_expired',
    });

    expect(facts.ok).toBe(true);
    expect(facts.ok && facts.value.drama.id).toBe('drm_fx_revenge');
    expect(facts.ok && facts.value.season.id).toBe('ssn_fx_s2');
    expect(facts.ok && facts.value.viewer?.userId).toBe('usr_fx_vip_expired');
  });

  it('gathers no viewer for an anonymous request', async () => {
    const facts = await port.loadEpisodeAccessFacts({ episodeId: 'ep_fx_s1e01', viewerId: null });

    expect(facts.ok && facts.value.viewer).toBeNull();
  });

  it('reports an unknown episode as absent', async () => {
    const facts = await port.loadEpisodeAccessFacts({ episodeId: 'ep_nope', viewerId: null });

    expect(facts).toEqual({ ok: false, error: 'EPISODE_NOT_FOUND' });
  });

  it('reports an unknown viewer rather than answering as anonymous', async () => {
    const facts = await port.loadEpisodeAccessFacts({
      episodeId: 'ep_fx_s1e01',
      viewerId: 'usr_nope',
    });

    expect(facts).toEqual({ ok: false, error: 'VIEWER_NOT_FOUND' });
  });
});
