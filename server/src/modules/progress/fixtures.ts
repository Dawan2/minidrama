import { ok } from '@minidrama/shared';
import type { DramaSummary } from '@minidrama/shared';

import { FIXTURE_WORLD } from '../entitlement/fixtures.js';
import type { WatchHistoryCatalogPort, WatchedEpisodeFacts } from './catalog-port.js';

/**
 * A fixture catalogue for the watch-history list.
 *
 * The `catalog` module is in flight in an adjacent slot, so the port it will implement has nothing
 * real behind it yet. Rather than leave the list endpoint untested until then, the port is satisfied
 * here from the **same** fixture world the entitlement and playback tests use
 * (`entitlement/fixtures.ts`), extended with the display fields a `DramaSummary` carries and an
 * entitlement decision does not.
 *
 * Reusing that world rather than building a second one is the point: `ep_fx_s2e01` is episode 1 of
 * its season and episode 11 of its drama in both places, so a test that asserts
 * `lastEpisodeNumber: 11` here is asserting against the same numbering the free window is measured
 * in. Two fixture worlds would eventually disagree, and the first thing they would disagree about is
 * episode numbering.
 *
 * This is test and development data. It is never the default in `buildApp` — the default port
 * refuses (`createUnavailableWatchHistoryCatalogPort`), so no deployment can serve a fixture
 * catalogue by omission.
 */

const FIXTURE_DRAMA_SUMMARIES: readonly DramaSummary[] = [
  {
    id: 'drm_fx_revenge',
    title: '重生之复仇千金',
    coverUrl: 'https://cdn.example.invalid/covers/drm_fx_revenge.jpg',
    category: 'REVENGE',
    tags: ['逆袭', '打脸'],
    totalEpisodes: 20,
    freeEpisodes: 5,
    isCompleted: false,
    stat: { playCount: 128_400, favoriteCount: 9_120, score: 8.6 },
  },
  {
    id: 'drm_fx_withdrawn',
    title: '下架的剧',
    coverUrl: 'https://cdn.example.invalid/covers/drm_fx_withdrawn.jpg',
    category: 'OTHER',
    tags: [],
    totalEpisodes: 1,
    freeEpisodes: 5,
    isCompleted: true,
    stat: { playCount: 12, favoriteCount: 0, score: 0 },
  },
];

export function fixtureDramaSummary(dramaId: string): DramaSummary | undefined {
  return FIXTURE_DRAMA_SUMMARIES.find((drama) => drama.id === dramaId);
}

/**
 * Describes the fixture episodes, and only the ones a history row could be drawn for.
 *
 * An episode whose drama is no longer `PUBLISHED` is left out rather than described. A history row
 * for a withdrawn drama is a cover and a resume button that cannot lead anywhere — playback refuses
 * it with `410` — so the honest list does not offer it. This is the behaviour the real adapter has
 * to reproduce, which is why the fixture has a withdrawn drama in it at all.
 */
export function createFixtureWatchHistoryCatalogPort(): WatchHistoryCatalogPort {
  return {
    loadWatchedEpisodeFacts: async (episodeIds) => {
      const facts = new Map<string, WatchedEpisodeFacts>();

      for (const episodeId of episodeIds) {
        const placed = FIXTURE_WORLD.episodes.find((entry) => entry.episode.id === episodeId);
        if (placed === undefined) continue;

        const drama = FIXTURE_WORLD.dramas.find((entry) => entry.id === placed.dramaId);
        if (drama === undefined || drama.status !== 'PUBLISHED') continue;

        const summary = fixtureDramaSummary(placed.dramaId);
        if (summary === undefined) continue;

        facts.set(episodeId, {
          drama: summary,
          globalEpisodeNumber: placed.episode.globalEpisodeNumber,
        });
      }

      return ok(facts);
    },
  };
}
