import { describe, expect, it } from 'vitest';
import { ok } from '@minidrama/shared';

import { watchRewardedAdUnlock } from './rewarded-unlock';
import { MockBridge } from '../platform/mock-bridge';
import { stubUnlockApi, unlockFailure } from '../testing/unlock-fixtures';
import type { AdUnlockGrant, AdUnlockSession } from '../data/unlock-api';

const SESSION: AdUnlockSession = {
  nonce: 'nonce_fx_1',
  adUnitId: 'ad_fx_rewarded',
  placement: 'AFTER_EPISODE',
  episodeId: 'ep_1',
};

const GRANT: AdUnlockGrant = {
  unlock: { id: 'ulk_1', episodeId: 'ep_1', method: 'AD', costCoins: 0 },
  quota: { usedToday: 1, dailyLimit: 5 },
};

async function readyBridge(options: ConstructorParameters<typeof MockBridge>[0] = {}) {
  const bridge = new MockBridge(options);
  await bridge.init();
  return bridge;
}

describe('watchRewardedAdUnlock', () => {
  it('does not call the SDK when the capability is missing', async () => {
    const bridge = await readyBridge({ unavailable: ['createRewardedVideoAd'] });
    let shows = 0;
    const original = bridge.showRewardedAd.bind(bridge);
    bridge.showRewardedAd = async (adUnitId) => {
      shows += 1;
      return original(adUnitId);
    };
    const api = stubUnlockApi();

    const outcome = await watchRewardedAdUnlock({
      api,
      bridge,
      episodeId: 'ep_1',
      placement: 'AFTER_EPISODE',
    });

    expect(outcome).toEqual({ kind: 'FAILED', reason: 'UNSUPPORTED' });
    expect(shows).toBe(0);
    expect(api.adSessionCalls).toEqual([]);
  });

  it('does not call the SDK when the server has no unit id', async () => {
    const bridge = await readyBridge();
    let shows = 0;
    const original = bridge.showRewardedAd.bind(bridge);
    bridge.showRewardedAd = async (adUnitId) => {
      shows += 1;
      return original(adUnitId);
    };
    const api = stubUnlockApi({
      adSession: () => ({
        ok: false,
        error: unlockFailure(503, 'UNLOCK_AD_UNAVAILABLE'),
      }),
    });

    const outcome = await watchRewardedAdUnlock({
      api,
      bridge,
      episodeId: 'ep_1',
      placement: 'AFTER_EPISODE',
    });

    expect(outcome).toEqual({ kind: 'FAILED', reason: 'UNAVAILABLE' });
    expect(shows).toBe(0);
  });

  it('posts the actual isEnded, including a skip, so the server is the grantor', async () => {
    const bridge = await readyBridge({ rewardedAdCompletes: false });
    const api = stubUnlockApi({
      adSession: () => ok(SESSION),
      adGrant: () => ({
        ok: false,
        error: unlockFailure(422, 'UNLOCK_AD_NOT_COMPLETED'),
      }),
    });

    const outcome = await watchRewardedAdUnlock({
      api,
      bridge,
      episodeId: 'ep_1',
      placement: 'AFTER_EPISODE',
      newIdempotencyKey: () => 'ad_key_1',
    });

    expect(outcome).toEqual({ kind: 'FAILED', reason: 'NOT_COMPLETED' });
    expect(api.adGrantCalls).toEqual([
      {
        episodeId: 'ep_1',
        nonce: 'nonce_fx_1',
        isEnded: false,
        idempotencyKey: 'ad_key_1',
      },
    ]);
  });

  it('returns UNLOCKED only after the server grant, not after the SDK close', async () => {
    const bridge = await readyBridge({ rewardedAdCompletes: true });
    const api = stubUnlockApi({
      adSession: () => ok(SESSION),
      adGrant: () => ok(GRANT),
    });

    const outcome = await watchRewardedAdUnlock({
      api,
      bridge,
      episodeId: 'ep_1',
      placement: 'MANUAL_SKIP',
    });

    expect(outcome).toEqual({ kind: 'UNLOCKED' });
    expect(api.adGrantCalls[0]?.isEnded).toBe(true);
    expect(api.adSessionCalls[0]?.placement).toBe('MANUAL_SKIP');
  });
});
