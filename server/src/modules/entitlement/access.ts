/**
 * The episode access decision.
 *
 * One pure function owns the whole question "may this viewer play this episode, and if not, what
 * would change that". It reads facts and returns a verdict: no I/O, no clock, no session lookup, so
 * the rules are testable exhaustively and the answer for a given set of facts is the same everywhere
 * it is asked. `docs/12-api-contracts.md` §3.3 is explicit that the client must never derive
 * playability itself; this is the one place the server derives it.
 *
 * Two ordering properties in here are load-bearing and are the reason the function exists at all.
 *
 * **A purchase is checked before a subscription (DM-3).** The ladder consults durable unlock
 * records *before* VIP. If VIP were consulted first, an episode a viewer bought with coins would be
 * reported as "playable because VIP", the purchase would never be looked at, and the day the
 * subscription lapsed the same episode would come back as `NEED_UNLOCK` — a refund-grade bug in
 * which a subscription lapse silently revokes separately paid content. The corollary is that a
 * `VIP`-method unlock row is *not* a purchase: `docs/12-domain-model.md` §6.1 allows one to be
 * written when a VIP views a paid episode, and §12 open question 3 asks what it should mean. It
 * means a viewing receipt, so it grants nothing on its own. Treating it as an entitlement would
 * turn one month of VIP into permanent access to everything watched during it.
 *
 * **The free window is measured on the drama-wide episode number (DM-1).** `drama.freeEpisodes` is
 * a drama-level policy ("the first N episodes are free", `docs/12-domain-model.md` §3.1), and
 * `Episode.episodeNumber` restarts at 1 in every season (§3.2). Comparing the per-season number
 * against the drama-level window gives away the first N episodes of *each* season — for a
 * two-season drama with `freeEpisodes: 5`, five paid episodes become free. `episodeNumber` is
 * carried in the facts because callers display it, and is deliberately never read here.
 */

export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'OFFLINE'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const UNLOCK_POLICIES = ['FREE', 'COIN', 'VIP_ONLY', 'COIN_OR_VIP'] as const;
export type UnlockPolicy = (typeof UNLOCK_POLICIES)[number];

export const UNLOCK_METHODS = ['COIN', 'AD', 'GRANT', 'VIP'] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];

/**
 * The methods that leave something behind when a subscription ends. Coins were paid, an ad was
 * watched to completion, a grant was an operational promise — all three are receipts for a specific
 * episode. `VIP` is absent on purpose: see the DM-3 note above.
 */
const DURABLE_UNLOCK_METHODS: readonly UnlockMethod[] = ['COIN', 'AD', 'GRANT'];

/** The reason vocabulary of `viewerAccess` in `docs/12-api-contracts.md` §3.3. */
export type AccessReason = 'FREE' | 'UNLOCKED' | 'VIP' | 'NEED_UNLOCK' | 'NEED_VIP' | 'UNAVAILABLE';

/**
 * Why an episode cannot be played at all, as opposed to not being paid for. Kept separate from
 * `AccessReason` so the HTTP edge can answer "does not exist" and "was withdrawn" differently
 * without re-deriving content policy, and so a misconfiguration is never mistaken for either.
 */
export type UnavailableCause = 'NOT_PUBLISHED' | 'WITHDRAWN' | 'MISCONFIGURED_PRICE';

/**
 * What the viewer can do about a denial. Ad unlock (C4-08) is offered for the same `COINS`
 * episodes, not as a third option: inventing `AD` here would be a second commercial ladder.
 */
export type UnlockOption = 'COINS' | 'VIP';

export interface DramaFacts {
  readonly id: string;
  readonly status: ContentStatus;
  /** Drama-level free window: the first N episodes of the drama, counted across seasons. */
  readonly freeEpisodes: number;
}

export interface SeasonFacts {
  readonly id: string;
  readonly status: ContentStatus;
}

export interface EpisodeFacts {
  readonly id: string;
  readonly status: ContentStatus;
  readonly unlockPolicy: UnlockPolicy;
  /** Required to be a positive integer when the policy involves coins. */
  readonly priceCoins: number;
  /** Position within the drama across all seasons, 1-based. The free window is measured on this. */
  readonly globalEpisodeNumber: number;
  /** Position within its season, 1-based. Display only — never an input to access (DM-1). */
  readonly episodeNumber: number;
}

export interface UnlockFacts {
  readonly episodeId: string;
  readonly method: UnlockMethod;
  /** `null` means permanent. `docs/12-domain-model.md` §6.1 reserves the limited-time case. */
  readonly expiresAtMs: number | null;
}

export interface VipFacts {
  readonly active: boolean;
  readonly expiresAtMs: number | null;
}

export interface ViewerFacts {
  readonly userId: string;
  readonly vip: VipFacts | null;
  /** The viewer's unlock rows for the episode under decision. */
  readonly unlocks: readonly UnlockFacts[];
}

export interface EpisodeAccessQuery {
  readonly drama: DramaFacts;
  readonly season: SeasonFacts;
  readonly episode: EpisodeFacts;
  /** `null` is an anonymous viewer: no VIP, no unlocks (`docs/12-api-contracts.md` §3.3). */
  readonly viewer: ViewerFacts | null;
  readonly nowMs: number;
}

export interface EpisodeAccess {
  readonly playable: boolean;
  readonly reason: AccessReason;
  /** The method that granted access, so a client can say *why* rather than just "unlocked". */
  readonly unlockedBy: UnlockMethod | null;
  readonly unlockOptions: readonly UnlockOption[];
  /** The coin price when paying is one of the options, `null` otherwise. */
  readonly priceCoins: number | null;
  /** Non-null exactly when `reason` is `UNAVAILABLE`. */
  readonly unavailableCause: UnavailableCause | null;
}

export function decideEpisodeAccess(query: EpisodeAccessQuery): EpisodeAccess {
  const { drama, season, episode, viewer, nowMs } = query;

  // 1. Visibility, before anything commercial. A draft or withdrawn ancestor hides the episode
  //    whatever the viewer holds: an unlock is not a licence to play content we have taken down
  //    (`docs/12-domain-model.md` §3.1, §3.2).
  const unavailableCause = findUnavailableCause(drama, season, episode);
  if (unavailableCause !== null) {
    return unavailable(unavailableCause);
  }

  // 2. Free content, either by the episode's own policy or by the drama-level window. Checked
  //    before entitlements because it costs the viewer nothing to be right about it.
  if (episode.unlockPolicy === 'FREE' || isWithinFreeWindow(drama, episode)) {
    return {
      playable: true,
      reason: 'FREE',
      unlockedBy: null,
      unlockOptions: [],
      priceCoins: null,
      unavailableCause: null,
    };
  }

  // 3. What the viewer owns. Ahead of VIP (DM-3) so a lapse cannot revoke a purchase, and so an
  //    active subscriber's paid episode still reports the purchase that paid for it.
  const owned = findDurableUnlock(viewer, episode.id, nowMs);
  if (owned !== undefined) {
    return {
      playable: true,
      reason: 'UNLOCKED',
      unlockedBy: owned.method,
      unlockOptions: [],
      priceCoins: null,
      unavailableCause: null,
    };
  }

  // 4. Subscription. `COIN` is excluded deliberately: a coin-only episode is not part of the VIP
  //    bundle (`docs/12-domain-model.md` §3.4).
  if (episode.unlockPolicy !== 'COIN' && isVipActive(viewer, nowMs)) {
    return {
      playable: true,
      reason: 'VIP',
      unlockedBy: 'VIP',
      unlockOptions: [],
      priceCoins: null,
      unavailableCause: null,
    };
  }

  if (episode.unlockPolicy === 'VIP_ONLY') {
    return {
      playable: false,
      reason: 'NEED_VIP',
      unlockedBy: null,
      unlockOptions: ['VIP'],
      priceCoins: null,
      unavailableCause: null,
    };
  }

  // 5. The price is validated here, at the one point where it is about to be quoted. A paid episode
  //    with no usable price is a misconfiguration, and quoting `0` coins for it would let the unlock
  //    endpoint charge nothing and hand the episode over. Checking it this late means the error
  //    cannot hide the episode from viewers who already have access.
  if (!isPositiveInteger(episode.priceCoins)) {
    return unavailable('MISCONFIGURED_PRICE');
  }

  return {
    playable: false,
    reason: 'NEED_UNLOCK',
    unlockedBy: null,
    unlockOptions: episode.unlockPolicy === 'COIN_OR_VIP' ? ['COINS', 'VIP'] : ['COINS'],
    priceCoins: episode.priceCoins,
    unavailableCause: null,
  };
}

function unavailable(cause: UnavailableCause): EpisodeAccess {
  return {
    playable: false,
    reason: 'UNAVAILABLE',
    unlockedBy: null,
    unlockOptions: [],
    priceCoins: null,
    unavailableCause: cause,
  };
}

/**
 * A draft anywhere in the chain outranks a withdrawal, so an unpublished episode is reported as
 * absent rather than as "exists, but taken down" — the second answer confirms the existence of
 * content nobody outside the CMS is supposed to know about. Anything that is neither published nor
 * draft is treated as withdrawn, so a status added later denies until it is handled here.
 */
function findUnavailableCause(
  drama: DramaFacts,
  season: SeasonFacts,
  episode: EpisodeFacts,
): UnavailableCause | null {
  const statuses = [drama.status, season.status, episode.status];

  if (statuses.some((status) => status === 'DRAFT')) return 'NOT_PUBLISHED';
  if (statuses.some((status) => status !== 'PUBLISHED')) return 'WITHDRAWN';

  return null;
}

/** DM-1: the window is drama-wide, so it is measured on the drama-wide number and nothing else. */
function isWithinFreeWindow(drama: DramaFacts, episode: EpisodeFacts): boolean {
  if (!isPositiveInteger(drama.freeEpisodes)) return false;
  // No fallback to `episode.episodeNumber`. A missing or nonsensical drama-wide position means we
  // cannot tell whether the episode is inside the window, and "cannot tell" is not "free".
  if (!isPositiveInteger(episode.globalEpisodeNumber)) return false;

  return episode.globalEpisodeNumber <= drama.freeEpisodes;
}

function findDurableUnlock(
  viewer: ViewerFacts | null,
  episodeId: string,
  nowMs: number,
): UnlockFacts | undefined {
  return viewer?.unlocks.find(
    (unlock) =>
      unlock.episodeId === episodeId &&
      DURABLE_UNLOCK_METHODS.includes(unlock.method) &&
      (unlock.expiresAtMs === null || unlock.expiresAtMs > nowMs),
  );
}

/**
 * Server time decides, per `docs/12-domain-model.md` §4.1. Both fields must agree: a stored `active`
 * flag that outlived its expiry is a lapsed subscription whose flag has not caught up, and an
 * expiry in the future with `active: false` is a subscription that was cancelled or refunded and
 * must not be resurrected by the leftover date. A missing expiry is not evidence of a lifetime
 * tier — no such product is modelled — so it grants nothing.
 */
function isVipActive(viewer: ViewerFacts | null, nowMs: number): boolean {
  const vip = viewer?.vip;
  if (vip == null || !vip.active || vip.expiresAtMs === null) return false;

  return vip.expiresAtMs > nowMs;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}
