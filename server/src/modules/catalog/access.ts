import type { UnlockPolicy, ViewerAccess } from '@minidrama/shared';

import { isWithinFreeWindow } from './numbering.js';
import type { DramaRecord, PositionedEpisode } from './types.js';
import type { Viewer } from './viewer.js';

/**
 * "May this viewer play this episode, and if not, why not?"
 *
 * The rules are `docs/12-domain-model.md` §3.4 and the answer shape is
 * `docs/12-api-contracts.md` §3.3. This module is the only place either exists: the client is
 * explicitly forbidden from deriving playability, so a second implementation anywhere — in the app,
 * in a view mapper, in a query — is a divergence waiting to sell an episode twice or give one away.
 *
 * Note what this module is *not*. It is the commercial gate only. The platform runs its own,
 * independent authorization over moderation state, online version and listing, and can refuse an
 * episode this function calls playable (`docs/architecture/system-overview.md` §5.2). A `playable`
 * here is a statement about entitlement, never a promise of a frame on screen.
 */

/**
 * Collapses the drama-level free window into the episode's own policy, in the priority the domain
 * model fixes: an explicitly free episode, then the free window, then the stored policy.
 *
 * The free window is measured in `globalEpisodeNumber`. See `numbering.ts` for why the per-season
 * number is the wrong one and what it costs.
 */
export function effectiveUnlockPolicy(
  positioned: PositionedEpisode,
  drama: DramaRecord,
): UnlockPolicy {
  if (positioned.episode.unlockPolicy === 'FREE') return 'FREE';
  if (isWithinFreeWindow(positioned.globalEpisodeNumber, drama.freeEpisodes)) return 'FREE';
  return positioned.episode.unlockPolicy;
}

/** The price the client may show, or `null` when coins cannot buy this episode at all. */
export function effectivePriceCoins(
  positioned: PositionedEpisode,
  drama: DramaRecord,
): number | null {
  const policy = effectiveUnlockPolicy(positioned, drama);
  if (policy !== 'COIN' && policy !== 'COIN_OR_VIP') return null;
  return positioned.episode.priceCoins;
}

/** Whether the content itself is serveable, before any question of who is asking. */
function isServeable(positioned: PositionedEpisode, drama: DramaRecord): boolean {
  return (
    drama.status === 'PUBLISHED' &&
    positioned.seasonStatus === 'PUBLISHED' &&
    positioned.episode.status === 'PUBLISHED'
  );
}

export function computeViewerAccess(
  positioned: PositionedEpisode,
  drama: DramaRecord,
  viewer: Viewer,
): ViewerAccess {
  // Availability is decided before entitlement on purpose. An episode that cannot be served is not
  // a conversion opportunity, and reporting NEED_UNLOCK for one would offer the viewer a purchase
  // that buys nothing.
  if (!isServeable(positioned, drama)) {
    return { playable: false, reason: 'UNAVAILABLE', unlockedBy: null };
  }

  const policy = effectiveUnlockPolicy(positioned, drama);
  if (policy === 'FREE') {
    return { playable: true, reason: 'FREE', unlockedBy: null };
  }

  // An owned unlock outranks VIP even for a viewer who has both. The entitlement is permanent and
  // the VIP period is not, so reporting VIP would make the client hide the "owned" state and offer
  // the episode for sale again the day the subscription lapses.
  const unlockedBy = viewer.unlocks.get(positioned.episode.id);
  if (unlockedBy !== undefined) {
    return { playable: true, reason: 'UNLOCKED', unlockedBy };
  }

  if (viewer.vip && (policy === 'VIP_ONLY' || policy === 'COIN_OR_VIP')) {
    return { playable: true, reason: 'VIP', unlockedBy: null };
  }

  if (policy === 'VIP_ONLY') {
    return { playable: false, reason: 'NEED_VIP', unlockedBy: null };
  }

  return { playable: false, reason: 'NEED_UNLOCK', unlockedBy: null };
}
