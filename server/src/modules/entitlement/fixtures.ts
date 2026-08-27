import { err, ok } from '@minidrama/shared';

import { readBearerToken } from './viewer-resolver.js';
import type { EntitlementFactsPort } from './facts-port.js';
import type { EpisodeFacts, SeasonFacts, ViewerFacts } from './access.js';
import type { DramaFacts } from './access.js';
import type { ViewerResolver } from './viewer-resolver.js';

/**
 * A fixture entitlement world.
 *
 * The data layer is W7 work, so the HTTP wrapper has nothing real to read yet. Rather than let the
 * route stay untested until then, the facts port is satisfied here by a small hand-built catalogue
 * whose shape is chosen to make the two defects this slot closes reproducible:
 *
 *   - the drama has **two seasons**, so `episodeNumber` and `globalEpisodeNumber` disagree for every
 *     episode past the first season. `ep_fx_s2e01` is episode 1 of its season and episode 11 of the
 *     drama, and with `freeEpisodes: 5` the two readings give opposite answers (DM-1);
 *   - `usr_fx_vip_expired` holds a lapsed subscription **and** two rows that look alike and must not
 *     behave alike: coins paid for one episode, and a `VIP` viewing receipt for another (DM-3).
 *
 * This is test and development data. It is never the default in `buildApp` — the default port
 * refuses (`createUnavailableEntitlementFactsPort`), so no deployment can serve fixture
 * entitlements by omission.
 */

/** Fixture VIP dates are relative to this instant, so tests inject it as the clock. */
export const FIXTURE_NOW_MS = Date.parse('2026-08-27T10:00:00.000Z');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const FIXTURE_DRAMAS: readonly DramaFacts[] = [
  { id: 'drm_fx_revenge', status: 'PUBLISHED', freeEpisodes: 5 },
  { id: 'drm_fx_withdrawn', status: 'OFFLINE', freeEpisodes: 5 },
];

const FIXTURE_SEASONS: readonly (SeasonFacts & { readonly dramaId: string })[] = [
  { id: 'ssn_fx_s1', dramaId: 'drm_fx_revenge', status: 'PUBLISHED' },
  { id: 'ssn_fx_s2', dramaId: 'drm_fx_revenge', status: 'PUBLISHED' },
  { id: 'ssn_fx_s3', dramaId: 'drm_fx_revenge', status: 'DRAFT' },
  { id: 'ssn_fx_w1', dramaId: 'drm_fx_withdrawn', status: 'PUBLISHED' },
];

interface FixtureEpisode {
  readonly episode: EpisodeFacts;
  readonly dramaId: string;
  readonly seasonId: string;
}

/**
 * Season 1 is episodes 1–10 of the drama and season 2 is 11–20, which is the arrangement that makes
 * the per-season number unusable as an access input.
 */
const FIXTURE_EPISODES: readonly FixtureEpisode[] = [
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s1',
    episode: {
      id: 'ep_fx_s1e01',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 1,
      globalEpisodeNumber: 1,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s1',
    episode: {
      id: 'ep_fx_s1e05',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 5,
      globalEpisodeNumber: 5,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s1',
    episode: {
      id: 'ep_fx_s1e06',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 6,
      globalEpisodeNumber: 6,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s2',
    episode: {
      id: 'ep_fx_s2e01',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 1,
      globalEpisodeNumber: 11,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s2',
    episode: {
      id: 'ep_fx_s2e03',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 3,
      globalEpisodeNumber: 13,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s2',
    episode: {
      id: 'ep_fx_s2e05',
      status: 'PUBLISHED',
      unlockPolicy: 'VIP_ONLY',
      priceCoins: 0,
      episodeNumber: 5,
      globalEpisodeNumber: 15,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s2',
    episode: {
      id: 'ep_fx_s2e07',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN',
      priceCoins: 500,
      episodeNumber: 7,
      globalEpisodeNumber: 17,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s2',
    // A paid policy with no price: the misconfiguration that must not be quoted as "0 coins".
    episode: {
      id: 'ep_fx_s2e08_unpriced',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN',
      priceCoins: 0,
      episodeNumber: 8,
      globalEpisodeNumber: 18,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s2',
    episode: {
      id: 'ep_fx_s2e09_draft',
      status: 'DRAFT',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 9,
      globalEpisodeNumber: 19,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s2',
    episode: {
      id: 'ep_fx_s2e10_offline',
      status: 'OFFLINE',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 10,
      globalEpisodeNumber: 20,
    },
  },
  {
    dramaId: 'drm_fx_revenge',
    seasonId: 'ssn_fx_s3',
    // Published under a draft season: the episode row alone does not decide visibility.
    episode: {
      id: 'ep_fx_s3e01',
      status: 'PUBLISHED',
      unlockPolicy: 'COIN_OR_VIP',
      priceCoins: 300,
      episodeNumber: 1,
      globalEpisodeNumber: 21,
    },
  },
  {
    dramaId: 'drm_fx_withdrawn',
    seasonId: 'ssn_fx_w1',
    // Inside the free window of a drama that is no longer on the shelf.
    episode: {
      id: 'ep_fx_w1e01',
      status: 'PUBLISHED',
      unlockPolicy: 'FREE',
      priceCoins: 0,
      episodeNumber: 1,
      globalEpisodeNumber: 1,
    },
  },
];

/**
 * `usr_fx_vip_expired` is the fixture this slot is built around. Its stored `active` flag still says
 * `true` while its expiry has passed, which is exactly the state a subscription sits in between
 * lapsing and whatever job notices — so a decision that trusts the flag passes, and one that checks
 * server time fails it.
 */
const FIXTURE_VIEWERS: readonly ViewerFacts[] = [
  {
    userId: 'usr_fx_vip_active',
    vip: { active: true, expiresAtMs: FIXTURE_NOW_MS + 30 * DAY_MS },
    unlocks: [],
  },
  {
    userId: 'usr_fx_vip_expired',
    vip: { active: true, expiresAtMs: FIXTURE_NOW_MS - DAY_MS },
    unlocks: [
      // Bought with coins. Survives the lapse, or the lapse revoked something that was paid for.
      { episodeId: 'ep_fx_s2e03', method: 'COIN', expiresAtMs: null },
      // Written while the subscription was live. A viewing receipt, not a purchase, so it expires
      // with the subscription that produced it.
      { episodeId: 'ep_fx_s2e05', method: 'VIP', expiresAtMs: null },
    ],
  },
  {
    userId: 'usr_fx_newcomer',
    vip: null,
    unlocks: [],
  },
  {
    userId: 'usr_fx_lapsed_grant',
    vip: null,
    // The reserved limited-time case from `docs/12-domain-model.md` §6.1, already expired.
    unlocks: [{ episodeId: 'ep_fx_s2e03', method: 'GRANT', expiresAtMs: FIXTURE_NOW_MS - HOUR_MS }],
  },
];

/** The fixture session token for a fixture user. */
export function fixtureViewerToken(userId: string): string {
  return `fxt_${userId}`;
}

export function createFixtureEntitlementFactsPort(): EntitlementFactsPort {
  return {
    loadEpisodeAccessFacts: async ({ episodeId, viewerId }) => {
      const found = FIXTURE_EPISODES.find((entry) => entry.episode.id === episodeId);
      if (found === undefined) return err('EPISODE_NOT_FOUND');

      const season = FIXTURE_SEASONS.find((entry) => entry.id === found.seasonId);
      const drama = FIXTURE_DRAMAS.find((entry) => entry.id === found.dramaId);
      // A catalogue row pointing at a season or drama that is not there is a broken world, not an
      // absent episode, and the fixtures are asserted to be consistent in `fixtures.test.ts`.
      if (season === undefined || drama === undefined) return err('FACTS_UNAVAILABLE');

      if (viewerId === null) {
        return ok({ drama, season, episode: found.episode, viewer: null });
      }

      const viewer = FIXTURE_VIEWERS.find((entry) => entry.userId === viewerId);
      if (viewer === undefined) return err('VIEWER_NOT_FOUND');

      return ok({ drama, season, episode: found.episode, viewer });
    },
  };
}

/** Resolves `fxt_<userId>` tokens, and refuses anything else rather than falling back to anonymous. */
export function createFixtureViewerResolver(): ViewerResolver {
  return {
    resolve: (authorization) => {
      const token = readBearerToken(authorization);
      if (!token.ok || token.value === null) return token;

      return token.value.startsWith('fxt_') ? ok(token.value.slice(4)) : err('SESSION_REJECTED');
    },
  };
}

export const FIXTURE_WORLD = {
  dramas: FIXTURE_DRAMAS,
  seasons: FIXTURE_SEASONS,
  episodes: FIXTURE_EPISODES,
  viewers: FIXTURE_VIEWERS,
} as const;
