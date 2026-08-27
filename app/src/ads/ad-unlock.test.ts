import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { MockBridge } from '../platform/mock-bridge';
import { apiFailure } from '../data/failure';
import { runAdUnlock } from './ad-unlock';
import type { UnlockApi } from '../data/unlock-api';

function apiStub(overrides: Partial<UnlockApi> = {}): UnlockApi {
  return {
    createCoinOrder: () => Promise.resolve(err(apiFailure({ kind: 'MALFORMED', message: 'unused' }))),
    fetchCoinOrder: () => Promise.resolve(err(apiFailure({ kind: 'MALFORMED', message: 'unused' }))),
    createAdSession: () =>
      Promise.resolve(ok({ sessionId: 'ads_test', episodeId: 'ep_1' })),
    grantAdUnlock: () =>
      Promise.resolve(
        ok({
          unlock: { id: 'ulk_1', episodeId: 'ep_1', method: 'AD' as const, costCoins: 0 },
          quota: { usedToday: 1, dailyLimit: 5 },
        }),
      ),
    ...overrides,
  };
}

describe('runAdUnlock', () => {
  it('does not show an ad or grant when no unit id is configured', async () => {
    const bridge = new MockBridge();
    await bridge.init();
    const showRewardedAd = vi.spyOn(bridge, 'showRewardedAd');
    const grantAdUnlock = vi.fn(apiStub().grantAdUnlock);

    await expect(
      runAdUnlock({
        api: apiStub({ grantAdUnlock }),
        bridge,
        episodeId: 'ep_1',
        adUnitId: null,
      }),
    ).resolves.toEqual({ kind: 'FAILED', reason: 'NO_UNIT' });
    expect(showRewardedAd).not.toHaveBeenCalled();
    expect(grantAdUnlock).not.toHaveBeenCalled();
  });

  it('does not show an ad when the capability is missing', async () => {
    const bridge = new MockBridge({ unavailable: ['createRewardedVideoAd'] });
    await bridge.init();
    const showRewardedAd = vi.spyOn(bridge, 'showRewardedAd');

    await expect(
      runAdUnlock({
        api: apiStub(),
        bridge,
        episodeId: 'ep_1',
        adUnitId: 'test-rewarded-unit',
      }),
    ).resolves.toEqual({ kind: 'FAILED', reason: 'UNSUPPORTED' });
    expect(showRewardedAd).not.toHaveBeenCalled();
  });

  it('POSTs isEnded false when the viewer skips, and does not treat the showing as access', async () => {
    const bridge = new MockBridge({ rewardedAdCompletes: false });
    await bridge.init();
    const grantAdUnlock = vi.fn(() =>
      Promise.resolve(
        err(apiFailure({ kind: 'HTTP', status: 422, code: 'AD_NOT_COMPLETED', message: 'skip' })),
      ),
    );

    const outcome = await runAdUnlock({
      api: apiStub({ grantAdUnlock }),
      bridge,
      episodeId: 'ep_1',
      adUnitId: 'test-rewarded-unit',
    });

    expect(outcome).toEqual({ kind: 'FAILED', reason: 'NOT_COMPLETED' });
    expect(grantAdUnlock).toHaveBeenCalledWith({ sessionId: 'ads_test', isEnded: false });
  });

  it('POSTs isEnded true and reports UNLOCKED only from the server grant', async () => {
    const bridge = new MockBridge({ rewardedAdCompletes: true });
    await bridge.init();
    const grantAdUnlock = vi.fn(apiStub().grantAdUnlock);

    const outcome = await runAdUnlock({
      api: apiStub({ grantAdUnlock }),
      bridge,
      episodeId: 'ep_1',
      adUnitId: 'test-rewarded-unit',
    });

    expect(outcome).toEqual({ kind: 'UNLOCKED' });
    expect(grantAdUnlock).toHaveBeenCalledWith({ sessionId: 'ads_test', isEnded: true });
  });

  it('treats an empty unit id as missing', async () => {
    const bridge = new MockBridge();
    await bridge.init();

    await expect(
      runAdUnlock({
        api: apiStub(),
        bridge,
        episodeId: 'ep_1',
        adUnitId: '',
      }),
    ).resolves.toEqual({ kind: 'FAILED', reason: 'NO_UNIT' });
  });

  it('reports ALREADY_UNLOCKED from the server, not from the showing', async () => {
    const bridge = new MockBridge();
    await bridge.init();
    const grantAdUnlock = vi.fn(() =>
      Promise.resolve(
        err(apiFailure({ kind: 'HTTP', status: 409, code: 'UNLOCK_ALREADY_UNLOCKED', message: 'owned' })),
      ),
    );

    await expect(
      runAdUnlock({
        api: apiStub({ grantAdUnlock }),
        bridge,
        episodeId: 'ep_1',
        adUnitId: 'test-rewarded-unit',
      }),
    ).resolves.toEqual({ kind: 'ALREADY_UNLOCKED' });
  });

  it('classifies a session mint failure rather than showing the ad', async () => {
    const bridge = new MockBridge();
    await bridge.init();
    const showRewardedAd = vi.spyOn(bridge, 'showRewardedAd');

    await expect(
      runAdUnlock({
        api: apiStub({
          createAdSession: () =>
            Promise.resolve(
              err(apiFailure({ kind: 'HTTP', status: 401, code: 'AUTH_REQUIRED', message: 'sign in' })),
            ),
        }),
        bridge,
        episodeId: 'ep_1',
        adUnitId: 'test-rewarded-unit',
      }),
    ).resolves.toEqual({ kind: 'FAILED', reason: 'SIGN_IN_REQUIRED' });
    expect(showRewardedAd).not.toHaveBeenCalled();
  });
});
