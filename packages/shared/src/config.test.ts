import { describe, expect, it } from 'vitest';

import {
  CONSERVATIVE_CLIENT_CONFIG,
  CONFIG_FEATURE_KEYS,
  CONFIG_PLAYBACK_KEYS,
  CONFIG_VIEW_KEYS,
  DEFAULT_PROGRESS_HEARTBEAT_SEC,
  type ConfigView,
} from './config.js';

describe('ConfigView', () => {
  it('is the conservative boot defaults: comments off, ads off, heartbeat 10', () => {
    const view: ConfigView = CONSERVATIVE_CLIENT_CONFIG;
    expect(view.features.comments).toBe(false);
    expect(view.features.adUnlock).toBe(false);
    expect(view.playback.progressHeartbeatSec).toBe(10);
    expect(DEFAULT_PROGRESS_HEARTBEAT_SEC).toBe(10);
  });

  it('names only features and playback as top-level keys', () => {
    expect(CONFIG_VIEW_KEYS).toEqual(['features', 'playback']);
    expect(CONFIG_FEATURE_KEYS).toEqual(['comments', 'adUnlock']);
    expect(CONFIG_PLAYBACK_KEYS).toEqual(['progressHeartbeatSec']);
  });

  it('does not carry a legal URL, ad-unit id, coin name or Beans field on the type', () => {
    const view: ConfigView = CONSERVATIVE_CLIENT_CONFIG;
    expect(view).toEqual({
      features: { comments: false, adUnlock: false },
      playback: { progressHeartbeatSec: 10 },
    });
    expect(JSON.stringify(view)).not.toMatch(
      /beans|termsUrl|privacyUrl|legalUrls|adUnitId|coinName|wallet/i,
    );
  });
});
