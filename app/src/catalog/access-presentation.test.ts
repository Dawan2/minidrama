import { describe, expect, it } from 'vitest';
import { VIEWER_ACCESS_REASONS } from '@minidrama/shared';
import type { ViewerAccessReason } from '@minidrama/shared';

import { EPISODE_ACTIONS, presentEpisodeAccess } from './access-presentation';
import { viewerAccess } from '../testing/catalog-fixtures';
import type { PurchaseCapabilities } from './access-presentation';

const CAN_BUY: PurchaseCapabilities = { coin: true, vip: true };
const CANNOT_BUY: PurchaseCapabilities = { coin: false, vip: false };

describe('episode access presentation', () => {
  it('publishes its actions as data', () => {
    expect([...EPISODE_ACTIONS]).toEqual([
      'PLAY',
      'UNLOCK',
      'SUBSCRIBE',
      'PURCHASE_BLOCKED',
      'UNAVAILABLE',
    ]);
  });

  it('has an answer for every reason the contract publishes, under either capability set', () => {
    for (const reason of VIEWER_ACCESS_REASONS) {
      for (const capabilities of [CAN_BUY, CANNOT_BUY]) {
        const presentation = presentEpisodeAccess(viewerAccess(reason), capabilities);
        expect(EPISODE_ACTIONS, reason).toContain(presentation.action);
      }
    }
  });

  it('plays anything the server says is playable', () => {
    for (const reason of ['FREE', 'UNLOCKED', 'VIP'] as const) {
      const presentation = presentEpisodeAccess(viewerAccess(reason), CANNOT_BUY);
      expect(presentation, reason).toEqual({
        action: 'PLAY',
        locked: false,
        navigable: true,
        showsPrice: false,
      });
    }
  });

  it('offers an unlock for a commercially locked episode', () => {
    expect(presentEpisodeAccess(viewerAccess('NEED_UNLOCK'), CAN_BUY)).toEqual({
      action: 'UNLOCK',
      locked: true,
      navigable: false,
      showsPrice: true,
    });
  });

  it('offers an ad-only unlock without a price when coins cannot be taken', () => {
    expect(
      presentEpisodeAccess(viewerAccess('NEED_UNLOCK'), { coin: false, vip: false, ads: true }),
    ).toEqual({
      action: 'UNLOCK',
      locked: true,
      navigable: false,
      showsPrice: false,
    });
  });

  it('offers a subscription for a VIP-only episode', () => {
    expect(presentEpisodeAccess(viewerAccess('NEED_VIP'), CAN_BUY)).toEqual({
      action: 'SUBSCRIBE',
      locked: true,
      navigable: false,
      showsPrice: false,
    });
  });
});

/**
 * The distinction this module exists for. `UNAVAILABLE` is not a commercial state: the content is
 * not serveable, so there is nothing to sell. The server refuses to price it
 * (`docs/handoff/w2-work-d.md` decision S31) and the client must not reintroduce a price.
 */
describe('an unavailable episode is never a sale', () => {
  it('does not offer an unlock or a subscription, whatever the client can pay with', () => {
    for (const capabilities of [CAN_BUY, CANNOT_BUY]) {
      const presentation = presentEpisodeAccess(viewerAccess('UNAVAILABLE'), capabilities);
      expect(presentation.action).toBe('UNAVAILABLE');
      expect(presentation.showsPrice).toBe(false);
      expect(presentation.navigable).toBe(false);
    }
  });

  // Reversing the order of the availability and entitlement checks is what would put a price tag on
  // an episode that cannot play. The server decides availability first; so does this.
  it('stays unavailable even if the server also reports it playable', () => {
    const contradiction = {
      playable: true,
      reason: 'UNAVAILABLE' as ViewerAccessReason,
      unlockedBy: null,
    };
    expect(presentEpisodeAccess(contradiction, CAN_BUY).action).toBe('UNAVAILABLE');
  });

  it('is a different state from a platform block', () => {
    const unavailable = presentEpisodeAccess(viewerAccess('UNAVAILABLE'), CANNOT_BUY);
    const blocked = presentEpisodeAccess(viewerAccess('NEED_UNLOCK'), CANNOT_BUY);
    expect(unavailable.action).not.toBe(blocked.action);
  });
});

/**
 * A platform block is ours, not the viewer's: the episode is for sale, this client cannot take the
 * money. Rendering the normal unlock button would produce a purchase flow that dead-ends in the
 * bridge (`docs/02-information-architecture.md` §9).
 */
describe('a platform block is distinct from a locked episode', () => {
  it('blocks the coin unlock when payment is unavailable on this client', () => {
    expect(presentEpisodeAccess(viewerAccess('NEED_UNLOCK'), { coin: false, vip: true })).toEqual({
      action: 'PURCHASE_BLOCKED',
      locked: true,
      navigable: false,
      showsPrice: false,
    });
  });

  it('blocks the subscription when subscriptions are unavailable on this client', () => {
    expect(presentEpisodeAccess(viewerAccess('NEED_VIP'), { coin: true, vip: false }).action).toBe(
      'PURCHASE_BLOCKED',
    );
  });

  // Quoting a price the viewer has no way to pay is an invitation to a dead end.
  it('withholds the price when the purchase cannot be completed', () => {
    expect(presentEpisodeAccess(viewerAccess('NEED_UNLOCK'), CANNOT_BUY).showsPrice).toBe(false);
  });

  // The two rails are independent: a client with payments but no subscriptions can still sell
  // episodes, and a VIP-only episode on that client is blocked while a coin one is not.
  it('treats the two purchase rails independently', () => {
    const mixed: PurchaseCapabilities = { coin: true, vip: false };
    expect(presentEpisodeAccess(viewerAccess('NEED_UNLOCK'), mixed).action).toBe('UNLOCK');
    expect(presentEpisodeAccess(viewerAccess('NEED_VIP'), mixed).action).toBe('PURCHASE_BLOCKED');
  });
});

describe('failing closed', () => {
  // The server cannot produce these, which is exactly why they must not be guessed at. A wrongly
  // locked episode is a support ticket; a wrongly unlocked one is lost revenue plus a playback
  // failure the viewer blames on us.
  it('locks an episode whose reason contradicts playable: false', () => {
    for (const reason of ['FREE', 'UNLOCKED', 'VIP'] as const) {
      const contradiction = { playable: false, reason, unlockedBy: null };
      const presentation = presentEpisodeAccess(contradiction, CAN_BUY);
      expect(presentation.action, reason).toBe('UNAVAILABLE');
      expect(presentation.navigable).toBe(false);
    }
  });

  it('never marks a locked state navigable', () => {
    for (const reason of VIEWER_ACCESS_REASONS) {
      for (const capabilities of [CAN_BUY, CANNOT_BUY]) {
        const presentation = presentEpisodeAccess(viewerAccess(reason), capabilities);
        expect(presentation.navigable, `${reason} navigable`).toBe(!presentation.locked);
      }
    }
  });

  it('only ever shows a price on the one state that can be bought with coins', () => {
    for (const reason of VIEWER_ACCESS_REASONS) {
      for (const capabilities of [CAN_BUY, CANNOT_BUY]) {
        const presentation = presentEpisodeAccess(viewerAccess(reason), capabilities);
        expect(presentation.showsPrice, reason).toBe(
          presentation.action === 'UNLOCK' && capabilities.coin,
        );
      }
    }
  });
});
