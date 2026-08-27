import { describe, expect, it } from 'vitest';

import { describeUnlockOffer } from './unlock-offer';
import { episodeItem, lockedEpisodeItem, viewerAccess } from '../testing/catalog-fixtures';
import type { PurchaseCapabilities } from '../catalog/access-presentation';

const BOTH: PurchaseCapabilities = { coin: true, vip: true };
const NEITHER: PurchaseCapabilities = { coin: false, vip: false };

describe('what the panel may sell', () => {
  it('offers coins for a locked, priced episode on a client that can pay', () => {
    expect(describeUnlockOffer(lockedEpisodeItem({ priceCoins: 30 }), BOTH)).toEqual({
      kind: 'COINS',
      priceCoins: 30,
    });
  });

  it('keeps coins as the primary offer when ads are also available', () => {
    expect(
      describeUnlockOffer(lockedEpisodeItem({ priceCoins: 30 }), {
        coin: true,
        vip: true,
        ads: true,
      }),
    ).toEqual({ kind: 'COINS', priceCoins: 30 });
  });

  it('offers ads when coins cannot be taken and ads are available', () => {
    expect(
      describeUnlockOffer(lockedEpisodeItem({ priceCoins: 30 }), {
        coin: false,
        vip: false,
        ads: true,
      }),
    ).toEqual({ kind: 'ADS' });
  });

  it('offers ads for an unpriced NEED_UNLOCK when ads are available', () => {
    expect(
      describeUnlockOffer(lockedEpisodeItem({ priceCoins: null }), {
        coin: true,
        vip: true,
        ads: true,
      }),
    ).toEqual({ kind: 'ADS' });
  });

  /**
   * Priced on purpose. `priceCoins` belongs to the episode listing, not to the access decision —
   * the decision nulls it for a VIP refusal and the listing does not, which is the same asymmetry
   * that leaves a price on an `UNAVAILABLE` episode. A panel that saw a number and sold it would
   * charge coins for something no quantity of coins opens, and the server would answer `422` after
   * the viewer had already been quoted a price.
   */
  it('offers VIP, and never coins, for a VIP-only episode that still carries a price', () => {
    const episode = episodeItem({
      unlockPolicy: 'VIP_ONLY',
      priceCoins: 120,
      viewerAccess: viewerAccess('NEED_VIP'),
    });

    expect(describeUnlockOffer(episode, BOTH)).toEqual({ kind: 'VIP' });
  });

  /**
   * The distinction the brief turns on, kept where a reader can see it: three access states, three
   * different offers, and no two of them share a branch.
   */
  it('keeps NEED_UNLOCK, NEED_VIP and unpurchasable apart', () => {
    // All three priced identically, so the only thing that can separate them is the reason.
    const needUnlock = describeUnlockOffer(lockedEpisodeItem({ priceCoins: 60 }), BOTH);
    const needVip = describeUnlockOffer(
      episodeItem({ priceCoins: 60, viewerAccess: viewerAccess('NEED_VIP') }),
      BOTH,
    );
    const unavailable = describeUnlockOffer(
      episodeItem({ priceCoins: 60, viewerAccess: viewerAccess('UNAVAILABLE') }),
      BOTH,
    );

    expect(needUnlock.kind).toBe('COINS');
    expect(needVip.kind).toBe('VIP');
    expect(unavailable.kind).toBe('UNPURCHASABLE');
    expect(new Set([needUnlock.kind, needVip.kind, unavailable.kind]).size).toBe(3);
  });
});

describe('what the panel refuses to sell', () => {
  /**
   * The defect this module exists to prevent. `priceCoins` is a property of the episode and the
   * server does not blank it when the episode stops being sellable — episode 7 of
   * `drm_revenge_0001` arrives today as `UNAVAILABLE` priced at 60. A panel reading the price
   * rather than the reason would put it on sale.
   */
  it('does not sell an unavailable episode that still carries a price', () => {
    const withdrawn = episodeItem({
      unlockPolicy: 'COIN',
      priceCoins: 60,
      viewerAccess: viewerAccess('UNAVAILABLE'),
    });

    expect(describeUnlockOffer(withdrawn, BOTH)).toEqual({
      kind: 'UNPURCHASABLE',
      cause: 'NOT_FOR_SALE',
    });
  });

  it('reports the platform block as its own cause, not as "not for sale"', () => {
    expect(describeUnlockOffer(lockedEpisodeItem(), NEITHER)).toEqual({
      kind: 'UNPURCHASABLE',
      cause: 'PLATFORM_BLOCKED',
    });
  });

  /**
   * A VIP episode on a client with no subscription rail is blocked by us, not refused by policy —
   * and it stays blocked even though this client *can* take coins and the episode carries a price.
   * Falling back to the coin rail here would sell the wrong product.
   */
  it('reports a VIP episode on a client that cannot subscribe as blocked', () => {
    const episode = episodeItem({ priceCoins: 120, viewerAccess: viewerAccess('NEED_VIP') });
    expect(describeUnlockOffer(episode, { coin: true, vip: false })).toEqual({
      kind: 'UNPURCHASABLE',
      cause: 'PLATFORM_BLOCKED',
    });
  });

  it('has nothing to sell for an episode the viewer can already watch', () => {
    for (const reason of ['FREE', 'UNLOCKED', 'VIP'] as const) {
      expect(
        describeUnlockOffer(episodeItem({ viewerAccess: viewerAccess(reason) }), BOTH),
      ).toEqual({ kind: 'UNPURCHASABLE', cause: 'ALREADY_PLAYABLE' });
    }
  });

  /**
   * `presentEpisodeAccess` says `UNLOCK` from the reason alone and does not see the price, which is
   * the whole point of its signature. So the panel is the place that has to notice there is no
   * number to charge — the alternative is opening an order for an amount we do not have.
   */
  it('refuses a coin sale the server quoted no usable price for', () => {
    for (const priceCoins of [null, 0, -300, 12.5, Number.NaN]) {
      const episode = lockedEpisodeItem({ priceCoins });
      expect(describeUnlockOffer(episode, BOTH), `price ${String(priceCoins)}`).toEqual({
        kind: 'UNPURCHASABLE',
        cause: 'UNPRICED',
      });
    }
  });

  /**
   * A `viewerAccess` the server cannot emit. `presentEpisodeAccess` fails it closed to
   * `UNAVAILABLE`, and the panel must inherit that rather than re-deriving anything: a wrongly
   * locked episode is a support ticket, a wrongly sold one is a refund.
   */
  it('fails closed on a contradictory access state', () => {
    const contradiction = episodeItem({
      priceCoins: 30,
      viewerAccess: { playable: false, reason: 'FREE', unlockedBy: null },
    });

    expect(describeUnlockOffer(contradiction, BOTH)).toEqual({
      kind: 'UNPURCHASABLE',
      cause: 'NOT_FOR_SALE',
    });
  });
});
