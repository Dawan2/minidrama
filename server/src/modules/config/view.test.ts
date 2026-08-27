import { describe, expect, it } from 'vitest';
import { CONSERVATIVE_CLIENT_CONFIG, type ConfigView } from '@minidrama/shared';

import { toConfigView } from './view.js';

describe('toConfigView', () => {
  it('copies the conservative product state without inventing a flag', () => {
    expect(toConfigView(CONSERVATIVE_CLIENT_CONFIG)).toEqual({
      features: { comments: false, adUnlock: false },
      playback: { progressHeartbeatSec: 10 },
    });
  });

  it('forwards a strict true only when the caller named it, never from a string or 1', () => {
    const on: ConfigView = {
      features: { comments: true, adUnlock: true },
      playback: { progressHeartbeatSec: 10 },
    };
    expect(toConfigView(on).features).toEqual({ comments: true, adUnlock: true });
    expect(
      toConfigView({
        features: { comments: 'true' as unknown as boolean, adUnlock: 1 as unknown as boolean },
        playback: { progressHeartbeatSec: 10 },
      }).features,
    ).toEqual({ comments: false, adUnlock: false });
  });

  it('substitutes the 10 s default for a missing, zero or fractional heartbeat', () => {
    expect(
      toConfigView({
        features: { comments: false, adUnlock: false },
        playback: { progressHeartbeatSec: 0 },
      }).playback.progressHeartbeatSec,
    ).toBe(10);
    expect(
      toConfigView({
        features: { comments: false, adUnlock: false },
        playback: { progressHeartbeatSec: 2.5 },
      }).playback.progressHeartbeatSec,
    ).toBe(10);
  });

  it('drops legal URLs, ad-unit ids, a coin name and Beans stuffed onto the facts', () => {
    const stuffed = {
      ...CONSERVATIVE_CLIENT_CONFIG,
      termsUrl: 'https://example.invalid/tos',
      privacyUrl: 'https://example.invalid/privacy',
      adUnitId: 'unit-1',
      coinName: '看点',
      beansPerCoin: 0.7,
      wallet: { coinName: '看点' },
    };
    const view = toConfigView(stuffed);
    expect(view).toEqual(CONSERVATIVE_CLIENT_CONFIG);
    expect(JSON.stringify(view)).not.toMatch(/termsUrl|privacyUrl|adUnitId|coinName|beans|wallet/i);
  });
});
