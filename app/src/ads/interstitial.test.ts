import { describe, expect, it } from 'vitest';

import { createInterstitialSlotState, maybeShowInterstitial } from './interstitial';
import { MockBridge } from '../platform/mock-bridge';

async function readyBridge(options: ConstructorParameters<typeof MockBridge>[0] = {}) {
  const bridge = new MockBridge(options);
  await bridge.init();
  return bridge;
}

describe('maybeShowInterstitial', () => {
  it('does not call the SDK when the unit id is absent (GATE-4)', async () => {
    const bridge = await readyBridge();
    let calls = 0;
    const original = bridge.showInterstitialAd.bind(bridge);
    bridge.showInterstitialAd = async (id) => {
      calls += 1;
      return original(id);
    };

    const skipped = await maybeShowInterstitial({
      bridge,
      adUnitId: null,
      state: createInterstitialSlotState(),
    });
    const empty = await maybeShowInterstitial({
      bridge,
      adUnitId: '',
      state: createInterstitialSlotState(),
    });

    expect(skipped).toBe('SKIPPED_NO_ID');
    expect(empty).toBe('SKIPPED_NO_ID');
    expect(calls).toBe(0);
  });

  it('does not call the SDK when the capability is missing', async () => {
    const bridge = await readyBridge({ unavailable: ['createInterstitialAd'] });
    let calls = 0;
    bridge.showInterstitialAd = async () => {
      calls += 1;
      return { ok: false, error: { code: 'BRIDGE_UNSUPPORTED', message: 'no' } };
    };

    const outcome = await maybeShowInterstitial({
      bridge,
      adUnitId: 'ad_fx_interstitial',
      state: createInterstitialSlotState(),
    });

    expect(outcome).toBe('SKIPPED_CAPABILITY');
    expect(calls).toBe(0);
  });

  it('honours the cooldown so two navigations cannot stack interstitials', async () => {
    const bridge = await readyBridge();
    let calls = 0;
    const original = bridge.showInterstitialAd.bind(bridge);
    bridge.showInterstitialAd = async (id) => {
      calls += 1;
      return original(id);
    };
    const state = createInterstitialSlotState();
    const clock = { nowMs: 1_000 };
    const clockFn = { now: () => clock.nowMs };

    expect(
      await maybeShowInterstitial({
        bridge,
        adUnitId: 'ad_fx_interstitial',
        state,
        clock: clockFn,
        cooldownMs: 60_000,
      }),
    ).toBe('SHOWN');

    clock.nowMs = 30_000;
    expect(
      await maybeShowInterstitial({
        bridge,
        adUnitId: 'ad_fx_interstitial',
        state,
        clock: clockFn,
        cooldownMs: 60_000,
      }),
    ).toBe('SKIPPED_COOLDOWN');
    expect(calls).toBe(1);

    clock.nowMs = 61_000;
    expect(
      await maybeShowInterstitial({
        bridge,
        adUnitId: 'ad_fx_interstitial',
        state,
        clock: clockFn,
        cooldownMs: 60_000,
      }),
    ).toBe('SHOWN');
    expect(calls).toBe(2);
  });
});
