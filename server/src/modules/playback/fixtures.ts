import { err, ok } from '@minidrama/shared';

import type { PlaybackMediaPort } from './media-port.js';

/**
 * A fixture media catalogue, and a counting wrapper around any media port.
 *
 * The entitlement fixtures deliberately carry no media reference (`docs/handoff/w2-work-f.md` §4),
 * so playback keeps its own table rather than adding a `vid` column to a module that is not allowed
 * to know one. The keys are the entitlement fixture episode ids, because the two tables have to
 * describe the same world for an end-to-end assertion to mean anything.
 *
 * Every fixture episode has an entry, including the ones no viewer can play. An asset exists
 * independently of whether anybody is entitled to it, and a table that only listed the playable
 * episodes would make the denial tests pass for the wrong reason — the media lookup would fail
 * anyway. A test in `routes.test.ts` holds the two tables level, so an episode added to the
 * entitlement world cannot quietly become an episode with no asset.
 *
 * This is test and development data. `buildApp` never reaches for it — the default port refuses.
 */

const FIXTURE_VIDS: Readonly<Record<string, string>> = {
  ep_fx_s1e01: 'vid_fx_0001',
  ep_fx_s1e05: 'vid_fx_0005',
  ep_fx_s1e06: 'vid_fx_0006',
  ep_fx_s2e01: 'vid_fx_0011',
  ep_fx_s2e03: 'vid_fx_0013',
  ep_fx_s2e05: 'vid_fx_0015',
  ep_fx_s2e07: 'vid_fx_0017',
  ep_fx_s2e08_unpriced: 'vid_fx_0018',
  ep_fx_s2e09_draft: 'vid_fx_0019',
  ep_fx_s2e10_offline: 'vid_fx_0020',
  ep_fx_s3e01: 'vid_fx_0021',
  ep_fx_w1e01: 'vid_fx_w001',
};

/** Read by `fixtures.test.ts` only, to prove the table covers the entitlement fixture world. */
export const FIXTURE_MEDIA_EPISODE_IDS: readonly string[] = Object.keys(FIXTURE_VIDS);

export function createFixturePlaybackMediaPort(): PlaybackMediaPort {
  return {
    resolveMedia: async ({ episodeId }) => {
      const vid = FIXTURE_VIDS[episodeId];

      return vid === undefined ? err('MEDIA_UNAVAILABLE') : ok({ vid });
    },
  };
}

export interface CountingPlaybackMediaPort extends PlaybackMediaPort {
  /** The episode ids the route asked about, in order. Empty is the assertion that matters. */
  readonly lookups: readonly string[];
}

/**
 * Wraps a media port and records what it was asked for.
 *
 * "A denial does not mint a descriptor" is provable from the response body, but only weakly: an
 * absent `vid` in a `403` proves the descriptor was not *sent*, not that it was never assembled. A
 * route that resolved the media first and then discarded it would pass that assertion while still
 * doing the lookup — and the lookup is the part that touches the media-asset store on behalf of
 * someone who has not paid. Counting the calls tests the ordering itself.
 */
export function createCountingPlaybackMediaPort(
  inner: PlaybackMediaPort = createFixturePlaybackMediaPort(),
): CountingPlaybackMediaPort {
  const lookups: string[] = [];

  return {
    lookups,
    resolveMedia: async (query) => {
      lookups.push(query.episodeId);

      return inner.resolveMedia(query);
    },
  };
}
