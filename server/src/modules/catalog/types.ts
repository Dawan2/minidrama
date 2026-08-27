import type { DramaCategory, DramaStat, UnlockPolicy } from '@minidrama/shared';

/**
 * Catalogue storage records — the server-side entities of `docs/12-domain-model.md` §3.
 *
 * They are deliberately not the wire shapes. A record carries the publication state machine and
 * the raw per-season episode numbering; the view objects in `@minidrama/shared` carry neither,
 * because both are inputs to decisions the server makes and the client must not remake.
 *
 * Nothing here holds a media handle. `assetKey` and the BytePlus `vid` live with `media-ops` and
 * reach a client only through a playback session.
 */

/**
 * The lifecycle shared by dramas, seasons and episodes: `DRAFT → PUBLISHED ↔ OFFLINE`.
 *
 * This is *our* publication state. The platform independently holds `review_status`,
 * `online_version` and listing state for the same content (`docs/architecture/system-overview.md`
 * §6.1), and it is authoritative — an episode published here and delisted there does not play. The
 * mirrored platform columns belong to `media-ops` and are not modelled in this slot.
 */
export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE';

export interface DramaRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly coverUrl: string;
  readonly horizontalCoverUrl: string | null;
  readonly category: DramaCategory;
  readonly tags: readonly string[];
  readonly status: PublicationStatus;
  /**
   * Denormalised counters (`docs/12-domain-model.md` §3.1), counted over what a viewer can actually
   * see: published seasons, and episodes that appear in the flattened list. They are what the
   * storefront renders as "7 episodes", so counting drafts here would advertise content that is not
   * there. A store test holds them against the derived truth, because a counter nobody reconciles
   * is a counter that is eventually wrong.
   */
  readonly totalSeasons: number;
  readonly totalEpisodes: number;
  /** Free-window size, counted in global episode numbers. See `numbering.ts`. */
  readonly freeEpisodes: number;
  readonly isCompleted: boolean;
  /** UTC ISO-8601 with milliseconds. The `NEW` sort key. */
  readonly releaseAt: string;
  readonly stat: DramaStat;
}

export interface SeasonRecord {
  readonly id: string;
  readonly dramaId: string;
  readonly seasonNumber: number;
  readonly title: string | null;
  readonly status: PublicationStatus;
}

export interface EpisodeRecord {
  readonly id: string;
  readonly dramaId: string;
  readonly seasonId: string;
  /** Unique within its season, from 1. Not unique within the drama. */
  readonly episodeNumber: number;
  readonly title: string | null;
  readonly durationSec: number;
  readonly unlockPolicy: UnlockPolicy;
  /** Required when the policy admits coins; `null` otherwise. */
  readonly priceCoins: number | null;
  readonly status: PublicationStatus;
}

/**
 * An episode with the two facts that only exist relative to its drama: which season it sits in and
 * where it falls in the drama-wide running order.
 */
export interface PositionedEpisode {
  readonly episode: EpisodeRecord;
  readonly seasonNumber: number;
  readonly seasonStatus: PublicationStatus;
  readonly globalEpisodeNumber: number;
}
