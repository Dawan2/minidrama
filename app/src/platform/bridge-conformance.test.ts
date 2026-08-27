import { describe, expect, it } from 'vitest';

import { BRIDGE_METHOD_NAMES, CAPABILITY_NAMES } from './types';
import { MockBridge } from './mock-bridge';
import { TikTokBridge } from './tiktok-bridge';
import type { PlatformBridge } from './types';

const implementations: readonly [string, () => PlatformBridge][] = [
  ['MockBridge', () => new MockBridge()],
  ['TikTokBridge', () => new TikTokBridge('test-client-key')],
];

describe.each(implementations)('%s conforms to PlatformBridge', (_name, create) => {
  it('implements every declared method', () => {
    const bridge = create() as unknown as Record<string, unknown>;
    for (const method of BRIDGE_METHOD_NAMES) {
      expect(typeof bridge[method]).toBe('function');
    }
  });

  it('reports every capability', () => {
    const report = create().capabilities();
    expect(Object.keys(report).sort()).toEqual([...CAPABILITY_NAMES].sort());
  });

  it('refuses every capability before init', async () => {
    const bridge = create();
    expect(bridge.isReady()).toBe(false);
    for (const capability of CAPABILITY_NAMES) {
      expect(bridge.canIUse(capability)).toBe(false);
    }
  });

  it('resolves rather than throwing when a capability is used before init', async () => {
    const bridge = create();
    const result = await bridge.login();
    expect(result.ok).toBe(false);
  });
});

describe('MockBridge behaviour', () => {
  it('becomes ready and grants capabilities after init', async () => {
    const bridge = new MockBridge();
    expect((await bridge.init()).ok).toBe(true);
    expect(bridge.isReady()).toBe(true);
    expect(bridge.canIUse('getPlayer')).toBe(true);
  });

  it('returns an auth code, never a token', async () => {
    const bridge = new MockBridge();
    await bridge.init();
    const result = await bridge.login();
    expect(result.ok && result.value).toEqual({ authCode: 'mock-auth-code' });
  });

  it('models a capability missing on an older client', async () => {
    const bridge = new MockBridge({ unavailable: ['createRewardedVideoAd'] });
    await bridge.init();
    expect(bridge.capabilities().createRewardedVideoAd).toBe('unavailable-this-client');

    const result = await bridge.showRewardedAd('unit-1');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNSUPPORTED');
  });

  it('reports a skipped rewarded ad as not ended, so nothing is granted', async () => {
    const bridge = new MockBridge({ rewardedAdCompletes: false });
    await bridge.init();
    const result = await bridge.showRewardedAd('unit-1');
    expect(result.ok && result.value.isEnded).toBe(false);
  });
});

describe('TikTokBridge without the SDK present', () => {
  it('fails init with a typed error instead of throwing', async () => {
    const bridge = new TikTokBridge('test-client-key');
    const result = await bridge.init();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('BRIDGE_NOT_READY');
  });
});
