import { describe, expect, it, vi } from 'vitest';

import { MockBridge } from '../platform/mock-bridge';
import { offerInterstitialIfConfigured } from './offer-interstitial';

describe('offerInterstitialIfConfigured', () => {
  it('does not call the bridge when no unit id is configured', async () => {
    const bridge = new MockBridge();
    await bridge.init();
    const show = vi.spyOn(bridge, 'showInterstitialAd');

    await expect(offerInterstitialIfConfigured(bridge, null)).resolves.toBe('skipped');
    expect(show).not.toHaveBeenCalled();
  });

  it('shows against the mock when a unit id is supplied', async () => {
    const bridge = new MockBridge();
    await bridge.init();
    const show = vi.spyOn(bridge, 'showInterstitialAd');

    await expect(offerInterstitialIfConfigured(bridge, 'test-interstitial-unit')).resolves.toBe(
      'shown',
    );
    expect(show).toHaveBeenCalledWith('test-interstitial-unit');
  });

  it('skips when the capability is missing', async () => {
    const bridge = new MockBridge({ unavailable: ['createInterstitialAd'] });
    await bridge.init();
    const show = vi.spyOn(bridge, 'showInterstitialAd');

    await expect(offerInterstitialIfConfigured(bridge, 'test-interstitial-unit')).resolves.toBe(
      'skipped',
    );
    expect(show).not.toHaveBeenCalled();
  });
});
