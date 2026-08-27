import { presentEpisodeAccess } from '../catalog/access-presentation';
import type { EpisodeItem } from '@minidrama/shared';
import type { PurchaseCapabilities } from '../catalog/access-presentation';

/**
 * What, if anything, the unlock panel may sell for one episode.
 *
 * `access-presentation.ts` decides what a *row* says. This decides what a *panel* may charge for,
 * and the two are deliberately different questions asked of the same answer: the row has to render
 * five states, the panel has to open a payment for exactly one of them.
 *
 * The rule that keeps this honest is that **whether to offer is read only from the action**, never
 * from the episode's own fields. `priceCoins` is the trap. It is a property of the episode and the
 * server does not blank it when the episode stops being sellable, so episode 7 of
 * `drm_revenge_0001` arrives today as `UNAVAILABLE` carrying a price of 60
 * (`docs/handoff/w2-work-h.md` §1). A panel that opened a coin order because a price was present
 * would sell access to something that still would not play, and the refund would be ours. So the
 * price is read *after* the action has already said "coins", and only to decide the amount.
 *
 * The three outcomes the brief separates, and why they cannot share a branch:
 *
 * - **`COINS`** — the sale. The only outcome that may open a coin order.
 * - **`VIP`** — a different product bought on a different rail. No quantity of coins opens a
 *   VIP-only episode, and the server answers `422 UNLOCK_POLICY_NOT_ALLOWED` if one is offered, so
 *   posting a coin order here would be a request that exists only to be refused.
 * - **`UNPURCHASABLE`** — not a sale at all, for four distinguishable reasons. They are kept apart
 *   because each asks the viewer for something different, and merging them produces the generic
 *   apology that tells nobody anything.
 */

export const UNPURCHASABLE_CAUSES = [
  /** The client cannot take money: no `pay` and no `createSubscription` on this TikTok build. */
  'PLATFORM_BLOCKED',
  /** The content is not serveable. `UNAVAILABLE` is not a commercial state at any price. */
  'NOT_FOR_SALE',
  /** Already playable. There is nothing to buy, and selling it again is a refund. */
  'ALREADY_PLAYABLE',
  /**
   * A coin sale the server quoted no usable price for. Rare and worth its own branch: charging a
   * number we do not have means charging zero, or charging whatever a stale render remembered.
   */
  'UNPRICED',
] as const;

export type UnpurchasableCause = (typeof UNPURCHASABLE_CAUSES)[number];

export type UnlockOffer =
  | { readonly kind: 'COINS'; readonly priceCoins: number }
  | { readonly kind: 'ADS' }
  | { readonly kind: 'VIP' }
  | { readonly kind: 'UNPURCHASABLE'; readonly cause: UnpurchasableCause };

export function describeUnlockOffer(
  episode: EpisodeItem,
  capabilities: PurchaseCapabilities,
): UnlockOffer {
  const { action } = presentEpisodeAccess(episode.viewerAccess, capabilities);

  if (action === 'UNLOCK') {
    const price = episode.priceCoins;
    if (capabilities.coin && isSellablePrice(price)) {
      return { kind: 'COINS', priceCoins: price };
    }
    if (capabilities.ads === true) {
      return { kind: 'ADS' };
    }
    return { kind: 'UNPURCHASABLE', cause: 'UNPRICED' };
  }

  if (action === 'SUBSCRIBE') {
    return { kind: 'VIP' };
  }

  if (action === 'PURCHASE_BLOCKED') {
    return { kind: 'UNPURCHASABLE', cause: 'PLATFORM_BLOCKED' };
  }

  if (action === 'PLAY') {
    return { kind: 'UNPURCHASABLE', cause: 'ALREADY_PLAYABLE' };
  }

  return { kind: 'UNPURCHASABLE', cause: 'NOT_FOR_SALE' };
}

/**
 * A price has to be a positive whole number of coins to be chargeable. `null` is the documented
 * "no coin price" and the rest — `0`, a negative, a fraction, a `NaN` that survived a JSON round
 * trip — are shapes the server should never send and that must not become a charge if it does.
 */
function isSellablePrice(price: number | null): price is number {
  return price !== null && Number.isInteger(price) && price > 0;
}
