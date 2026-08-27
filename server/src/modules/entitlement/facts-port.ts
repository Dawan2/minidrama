import { err } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import type { DramaFacts, EpisodeFacts, SeasonFacts, ViewerFacts } from './access.js';

/**
 * Where the decision's facts come from.
 *
 * The decision function is pure, so something has to read the content row, the season, the drama
 * policy and the viewer's unlocks. That is this port. It exists as an interface because the data
 * layer is W7 work: until the tables and seeds land there is nothing to read, and the default
 * implementation says so rather than guessing.
 *
 * The default refuses. This is the same posture as `createUnavailableIdentityPort`: a deployment
 * with no data layer answers "unavailable" and denies playback, instead of inventing an entitlement
 * state in which everything is either free or locked. Both of those guesses are wrong in a way that
 * costs money — one gives away paid content, the other tells paying viewers they own nothing.
 */

/** Everything `decideEpisodeAccess` needs, gathered for one episode and one viewer. */
export interface EpisodeAccessFacts {
  readonly drama: DramaFacts;
  readonly season: SeasonFacts;
  readonly episode: EpisodeFacts;
  /** `null` for an anonymous request. */
  readonly viewer: ViewerFacts | null;
}

export interface EpisodeAccessFactsQuery {
  readonly episodeId: string;
  /** `null` for an anonymous request. Never derived from client input — see `viewer-resolver.ts`. */
  readonly viewerId: string | null;
}

/**
 * `EPISODE_NOT_FOUND` and `VIEWER_NOT_FOUND` are facts about the request; `FACTS_UNAVAILABLE` is a
 * fault on our side. They are kept apart because they get different HTTP statuses and only the last
 * one should page anybody.
 */
export type EpisodeAccessFactsFailure =
  'EPISODE_NOT_FOUND' | 'VIEWER_NOT_FOUND' | 'FACTS_UNAVAILABLE';

export interface EntitlementFactsPort {
  loadEpisodeAccessFacts(
    query: EpisodeAccessFactsQuery,
  ): Promise<Result<EpisodeAccessFacts, EpisodeAccessFactsFailure>>;
}

/** The fail-closed default: no data layer, therefore no verdict. */
export function createUnavailableEntitlementFactsPort(): EntitlementFactsPort {
  return {
    loadEpisodeAccessFacts: async () => err('FACTS_UNAVAILABLE'),
  };
}
