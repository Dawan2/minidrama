/**
 * Catalogue view objects, shared by the client and the server.
 *
 * These are the shapes `docs/12-api-contracts.md` §3 puts on the wire, not the storage entities of
 * `docs/12-domain-model.md` §3 — the server keeps those to itself. Two properties are load-bearing:
 *
 * 1. **`viewerAccess` is computed by the server and only by the server.** The domain model is
 *    explicit that the client must not derive playability (§3.4), so this file carries the shape of
 *    the answer and none of the rules that produce it. A client-side copy of the free-window rule
 *    would be a second, unauthenticated entitlement system that drifts from the first.
 * 2. **No episode view object carries a media URL, a `vid` or an asset key.** Those reach the client
 *    only through the playback descriptor, which is issued per session after the entitlement check
 *    (correction A4, `docs/architecture/system-overview.md` §1.1). A catalogue listing that carried
 *    playback identifiers would be a way to play an episode without ever asking whether you may.
 */

export const DRAMA_CATEGORIES = [
  'ROMANCE',
  'REVENGE',
  'FAMILY',
  'SUSPENSE',
  'COMEDY',
  'FANTASY',
  'OTHER',
] as const;

export type DramaCategory = (typeof DRAMA_CATEGORIES)[number];

export const UNLOCK_POLICIES = ['FREE', 'COIN', 'VIP_ONLY', 'COIN_OR_VIP'] as const;

export type UnlockPolicy = (typeof UNLOCK_POLICIES)[number];

/** How an episode was unlocked. `AD` and `GRANT` exist in the model before they exist in code. */
export const UNLOCK_METHODS = ['COIN', 'VIP', 'AD', 'GRANT'] as const;

export type UnlockMethod = (typeof UNLOCK_METHODS)[number];

/**
 * Why an episode can or cannot be played, in the vocabulary of `docs/12-api-contracts.md` §3.3.
 * `UNAVAILABLE` is not a commercial state: it means the content itself is not serveable, and the
 * client must not offer an unlock for it.
 */
export const VIEWER_ACCESS_REASONS = [
  'FREE',
  'UNLOCKED',
  'VIP',
  'NEED_UNLOCK',
  'NEED_VIP',
  'UNAVAILABLE',
] as const;

export type ViewerAccessReason = (typeof VIEWER_ACCESS_REASONS)[number];

export interface ViewerAccess {
  readonly playable: boolean;
  readonly reason: ViewerAccessReason;
  /** Non-null only when `reason` is `UNLOCKED`. */
  readonly unlockedBy: UnlockMethod | null;
}

export interface DramaStat {
  readonly playCount: number;
  readonly favoriteCount: number;
  readonly score: number;
}

export interface DramaSummary {
  readonly id: string;
  readonly title: string;
  /**
   * `null` when there is no cover the client may load.
   *
   * That covers two cases the client should treat identically: no cover was ever set, and the
   * stored cover named a host the trusted-cover registry does not list, so the server refused to
   * pass it on (`server/src/modules/catalog/covers.ts`). Neither is renderable, and distinguishing
   * them would only invite a client to try the refused one anyway.
   *
   * The field is nullable rather than optional so that "no cover" is a value the client has to
   * handle, not a key it can forget to look for. Any UI that renders a cover therefore needs a
   * placeholder state; the server does not invent a stand-in URL, because a stand-in would itself
   * be a cover URL from a host nobody registered.
   */
  readonly coverUrl: string | null;
  readonly category: DramaCategory;
  readonly tags: readonly string[];
  readonly totalEpisodes: number;
  /**
   * How many episodes the drama gives away, counted in `globalEpisodeNumber` order. It is display
   * copy for the client ("first 3 free"); it is never the input to a playability decision, which
   * arrives already decided in `EpisodeItem.viewerAccess`.
   */
  readonly freeEpisodes: number;
  readonly isCompleted: boolean;
  readonly stat: DramaStat;
}

export interface SeasonSummary {
  readonly id: string;
  readonly seasonNumber: number;
  readonly title: string | null;
  readonly episodeCount: number;
}

export interface DramaViewerState {
  readonly favorited: boolean;
  readonly lastWatched: {
    readonly episodeId: string;
    readonly globalEpisodeNumber: number;
    readonly positionSec: number;
  } | null;
}

export interface DramaDetail extends DramaSummary {
  readonly description: string;
  /** Nullable for the same two reasons as `coverUrl`: never set, or set to an untrusted host. */
  readonly horizontalCoverUrl: string | null;
  readonly seasons: readonly SeasonSummary[];
  /** `null` for an anonymous viewer, and while favourites and progress do not exist yet. */
  readonly viewer: DramaViewerState | null;
}

export interface EpisodeItem {
  readonly id: string;
  readonly dramaId: string;
  readonly seasonId: string;
  readonly seasonNumber: number;
  /** Position within its season, as stored. Unique per season, not per drama. */
  readonly episodeNumber: number;
  /**
   * Position within the drama, across seasons. This is the number the client displays, the number
   * deep links carry, and — decisively — the number the free window is measured in. Using the
   * per-season `episodeNumber` for "first N free" would hand away the opening episodes of every
   * season a drama ever adds.
   */
  readonly globalEpisodeNumber: number;
  readonly title: string | null;
  readonly durationSec: number;
  /** The *effective* policy: the drama-level free window is already folded in. */
  readonly unlockPolicy: UnlockPolicy;
  /** `null` when the effective policy cannot be satisfied with coins. */
  readonly priceCoins: number | null;
  readonly viewerAccess: ViewerAccess;
}

/**
 * Cursor pagination, `docs/12-api-contracts.md` §2.3. `nextCursor` is opaque: clients echo it back
 * and never parse it. It is `null` exactly when `hasMore` is false.
 */
export interface PageInfo {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly pageInfo: PageInfo;
}

export const FEED_SCENES = ['HOME', 'PLAYER'] as const;

export type FeedScene = (typeof FEED_SCENES)[number];

export const FEED_CARD_TYPES = ['CONTINUE_WATCHING', 'DRAMA'] as const;

export type FeedCardType = (typeof FEED_CARD_TYPES)[number];

export interface FeedCard {
  readonly cardType: FeedCardType;
  readonly drama: DramaSummary;
  /** Present only on a `CONTINUE_WATCHING` card. */
  readonly continueEpisode: {
    readonly episodeId: string;
    readonly globalEpisodeNumber: number;
    readonly positionSec: number;
  } | null;
  /** Display copy for the recommendation reason, already localised by the server. */
  readonly recReason: string | null;
  /**
   * Impression identifier, minted per card per response. The client echoes it on `IMPRESSION` and
   * `CLICK` events, which is what makes an impression joinable to the click it produced. Two
   * responses never share one, even for the same drama.
   */
  readonly trackingId: string;
}
