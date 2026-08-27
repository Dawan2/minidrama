/**
 * The playback descriptor.
 *
 * Correction A4 in `docs/architecture/system-overview.md` §1.1: the playback endpoint does *not*
 * return a signed URL or a quality ladder. It returns the identifiers VePlayer needs, and
 * definition/quality selection stays inside the player. Anything resembling a media URL in this
 * type would be a regression back to the self-hosted design that the platform does not allow.
 */
export interface PlaybackDescriptor {
  readonly albumId: string;
  readonly episodeId: string;
  /** BytePlus video id. Opaque to us; produced by the platform media-asset pipeline. */
  readonly vid: string;
  /** Only required by TikTok app versions below 44.5.0. Short-lived; never cached past validity. */
  readonly playAuthToken?: string;
  readonly resumePositionSec: number;
}

/**
 * Why an episode cannot be played. Two authorization systems sit in series and their failures
 * must not be collapsed: a commercial lock is a conversion opportunity, a platform block is an
 * incident (`docs/architecture/system-overview.md` §5.2).
 */
export type PlaybackDenialSource = 'COMMERCIAL' | 'PLATFORM';

export interface PlaybackDenial {
  readonly source: PlaybackDenialSource;
  readonly reason: string;
}
