import { err } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * Where the media identifiers come from.
 *
 * This port exists so that resolving an episode's media is a step that can only be reached *after*
 * the entitlement verdict says the viewer may play. A locked episode never reaches it, which makes
 * "a denial does not mint a descriptor" a property of the control flow rather than of a reviewer's
 * attention — `routes.test.ts` asserts the port is never consulted on a denied request.
 *
 * It is deliberately not part of `EntitlementFactsPort`. The entitlement module carries no media
 * reference of any kind, not even in its fixtures (`docs/handoff/w2-work-f.md` §4), because a
 * decision endpoint that also knows the `vid` becomes a second source of media references outside
 * the audited playback path (correction A4, `docs/architecture/system-overview.md` §1.1).
 *
 * The default refuses, for the same reason the entitlement facts port does: the media-asset table
 * is W7 work, and a deployment with no data layer must not invent a video id.
 */

export interface PlaybackMediaQuery {
  readonly episodeId: string;
}

/**
 * The identifiers VePlayer needs that are not already in the access facts. `albumId` is not here —
 * it is the drama the episode belongs to, which the access facts already carry, and deriving it
 * twice is how two callers end up disagreeing about which album an episode is in.
 */
export interface PlaybackMedia {
  /** BytePlus video id. Opaque to us; produced by the platform media-asset pipeline. */
  readonly vid: string;
}

/**
 * One failure, on purpose. An entitled viewer who cannot be given a `vid` — no asset row, transcode
 * still running, storage unreachable — gets the same answer whichever it is: come back shortly.
 * `docs/12-error-catalog.md` gives that case `EPISODE_ASSET_UNAVAILABLE` at `503`, and the viewer
 * can act on none of the distinctions.
 */
export type PlaybackMediaFailure = 'MEDIA_UNAVAILABLE';

export interface PlaybackMediaPort {
  resolveMedia(query: PlaybackMediaQuery): Promise<Result<PlaybackMedia, PlaybackMediaFailure>>;
}

/** The fail-closed default: no media-asset table, therefore no video id. */
export function createUnavailablePlaybackMediaPort(): PlaybackMediaPort {
  return {
    resolveMedia: async () => err('MEDIA_UNAVAILABLE'),
  };
}
