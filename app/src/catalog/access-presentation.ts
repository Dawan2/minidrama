import type { ViewerAccess } from '@minidrama/shared';

/**
 * What an episode's access state looks like on screen.
 *
 * This module exists because "you cannot watch this" is four different products.
 *
 * - **`NEED_UNLOCK`** is a sale. It shows a price and a call to action, and the whole commercial
 *   funnel hangs off it.
 * - **`NEED_VIP`** is a different sale, with a different product and a different button.
 * - **`UNAVAILABLE`** is not a sale at all. The content is not serveable — withdrawn, not
 *   transcoded, refused by the platform — and offering an unlock for it sells access to something
 *   that still would not play. The server already refuses to price it
 *   (`docs/handoff/w2-work-d.md` decision S31); this module is the client half of the same rule,
 *   because a price computed on the client would reintroduce exactly what the server declined.
 * - **A platform block** is ours, not the viewer's. When the client cannot take money — payment or
 *   subscription capability missing on this TikTok build, or the ability not yet granted to the app
 *   (`docs/02-information-architecture.md` §9: "all channels unavailable → not purchasable yet") —
 *   the episode is still for sale, just not here and not now. Rendering a dead buy button is worse
 *   than saying so.
 *
 * The two rules that make this correct and are asserted by the tests:
 *
 * 1. **`viewerAccess` is the only input.** The signature cannot see `freeEpisodes`, `unlockPolicy`
 *    or `priceCoins`, so the free-window rule cannot be reimplemented here. The domain model
 *    forbids the client deriving playability, and a client-side copy of that rule is a second,
 *    unauthenticated entitlement system that drifts from the first.
 * 2. **It fails closed.** A `viewerAccess` the server should never emit resolves to
 *    `UNAVAILABLE` — locked, no offer — rather than to a play button.
 */

export const EPISODE_ACTIONS = [
  'PLAY',
  'UNLOCK',
  'SUBSCRIBE',
  /** For sale, but this client cannot complete a purchase. Distinct copy, no price, no CTA. */
  'PURCHASE_BLOCKED',
  /** Not for sale at any price. */
  'UNAVAILABLE',
] as const;

export type EpisodeAction = (typeof EPISODE_ACTIONS)[number];

/**
 * Which purchase rails the current client actually has, probed through `PlatformBridge.canIUse`.
 * Both default to unavailable at the call sites, because an un-probed capability is an unknown one
 * and an unknown one must not render a button.
 */
export interface PurchaseCapabilities {
  /** `canIUse('pay')` — coin purchase, and therefore single-episode unlock. */
  readonly coin: boolean;
  /** `canIUse('createSubscription')` — VIP. */
  readonly vip: boolean;
}

export interface EpisodePresentation {
  readonly action: EpisodeAction;
  /** Whether to draw the lock affordance. `PLAY` is the only unlocked state. */
  readonly locked: boolean;
  /** Whether a tap may open the player. False for every state the player cannot serve. */
  readonly navigable: boolean;
  /**
   * Whether the price belongs on screen. False for `UNAVAILABLE` (there is no price) and false for
   * `PURCHASE_BLOCKED` (quoting a price the viewer cannot pay is an invitation to a dead end).
   */
  readonly showsPrice: boolean;
}

export function presentEpisodeAccess(
  access: ViewerAccess,
  capabilities: PurchaseCapabilities,
): EpisodePresentation {
  // Availability is decided before entitlement on the server, so `UNAVAILABLE` is checked first
  // here too. Reversing the order is how an unavailable episode acquires a price tag.
  if (access.reason === 'UNAVAILABLE') {
    return unavailable();
  }

  if (access.playable) {
    return { action: 'PLAY', locked: false, navigable: true, showsPrice: false };
  }

  if (access.reason === 'NEED_UNLOCK') {
    return capabilities.coin
      ? { action: 'UNLOCK', locked: true, navigable: false, showsPrice: true }
      : purchaseBlocked();
  }

  if (access.reason === 'NEED_VIP') {
    return capabilities.vip
      ? { action: 'SUBSCRIBE', locked: true, navigable: false, showsPrice: false }
      : purchaseBlocked();
  }

  // Everything left is a contradiction: `FREE`, `UNLOCKED` or `VIP` with `playable: false`. The
  // server cannot produce it, which is exactly why it must not be guessed at. Fail closed — a
  // wrongly locked episode is a support ticket, a wrongly unlocked one is lost revenue and a
  // playback failure the viewer blames on us.
  return unavailable();
}

function unavailable(): EpisodePresentation {
  return { action: 'UNAVAILABLE', locked: true, navigable: false, showsPrice: false };
}

function purchaseBlocked(): EpisodePresentation {
  return { action: 'PURCHASE_BLOCKED', locked: true, navigable: false, showsPrice: false };
}
