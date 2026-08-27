import { describe, expect, it } from 'vitest';

import { createAdUnlock, createCoinUnlock, newUnlockId } from './unlocks.js';

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

describe('createAdUnlock', () => {
  it('is a permanent AD receipt with no coin charge', () => {
    const unlock = createAdUnlock({
      id: newUnlockId(),
      userId: 'usr_1',
      episodeId: 'ep_1',
      dramaId: 'drm_1',
      sessionId: 'ads_1',
      grantedAtMs: NOW,
    });

    expect(unlock.method).toBe('AD');
    expect(unlock.costCoins).toBe(0);
    expect(unlock.expiresAtMs).toBeNull();
    expect(unlock.orderId).toBe('ads_1');
  });

  it('does not share a constructor with coin unlocks', () => {
    const coin = createCoinUnlock({
      id: newUnlockId(),
      userId: 'usr_1',
      episodeId: 'ep_1',
      dramaId: 'drm_1',
      costCoins: 30,
      orderId: 'uord_1',
      grantedAtMs: NOW,
    });
    expect(coin.method).toBe('COIN');
    expect(coin.costCoins).toBe(30);
  });
});
