import { describe, expect, it, vi } from 'vitest';
import { CONSERVATIVE_CLIENT_CONFIG, err, ok } from '@minidrama/shared';

import {
  CONFIG_PATH,
  createConfigApi,
  narrowConfigView,
  resolveClientConfig,
} from './config-api';
import { apiFailure } from './failure';
import type { HttpReader } from './http';

describe('the config endpoint', () => {
  it('publishes the path the contract defines, under the live /v1 prefix', () => {
    expect(CONFIG_PATH).toBe('/v1/config');
  });

  it('asks GET /v1/config with no invented query', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() =>
      Promise.resolve(ok(CONSERVATIVE_CLIENT_CONFIG)),
    );
    await createConfigApi({ getJson }).fetchConfig();

    expect(getJson).toHaveBeenCalledWith(CONFIG_PATH);
  });

  it('passes a transport failure through untouched, so boot can fall back', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 503, message: 'down' });
    const api = createConfigApi({
      getJson: () => Promise.resolve({ ok: false, error: failure }),
    });

    const result = await api.fetchConfig();
    expect(result).toEqual({ ok: false, error: failure });
  });
});

describe('a config body', () => {
  it('quotes comments off, ads off and heartbeat 10 when the server sent that', () => {
    expect(narrowConfigView(CONSERVATIVE_CLIENT_CONFIG)).toEqual({
      features: { comments: false, adUnlock: false },
      playback: { progressHeartbeatSec: 10 },
    });
  });

  it('treats a missing comments flag as false, never as comments on', () => {
    expect(
      narrowConfigView({
        features: {},
        playback: {},
      }),
    ).toEqual({
      features: { comments: false, adUnlock: false },
      playback: { progressHeartbeatSec: 10 },
    });
  });

  it('forwards a strict true only when the server named it', () => {
    expect(
      narrowConfigView({
        features: { comments: true, adUnlock: true },
        playback: { progressHeartbeatSec: 15 },
      }),
    ).toEqual({
      features: { comments: true, adUnlock: true },
      playback: { progressHeartbeatSec: 15 },
    });
  });

  it('does not treat the string true or 1 as comments on', () => {
    expect(
      narrowConfigView({
        features: { comments: 'true', adUnlock: 1 },
        playback: { progressHeartbeatSec: 10 },
      })?.features,
    ).toEqual({ comments: false, adUnlock: false });
  });

  it('rejects a missing features or playback object, so a truncated body stays retryable', () => {
    expect(narrowConfigView({})).toBeNull();
    expect(narrowConfigView({ features: {} })).toBeNull();
    expect(narrowConfigView({ playback: {} })).toBeNull();
    expect(narrowConfigView(null)).toBeNull();
    expect(narrowConfigView([])).toBeNull();
  });

  it('ignores legal URLs, ad-unit ids, a coin name, Beans and extra keys rather than quoting them', () => {
    expect(
      narrowConfigView({
        features: { comments: false, adUnlock: false },
        playback: { progressHeartbeatSec: 10 },
        termsUrl: 'https://example.invalid/tos',
        privacyUrl: 'https://example.invalid/privacy',
        adUnitId: 'unit-1',
        coinName: '看点',
        wallet: { coinName: '看点' },
        beansPerCoin: 0.7,
      }),
    ).toEqual(CONSERVATIVE_CLIENT_CONFIG);
  });
});

describe('resolveClientConfig', () => {
  it('keeps a successful body', () => {
    const on = {
      features: { comments: true, adUnlock: false },
      playback: { progressHeartbeatSec: 10 },
    };
    expect(resolveClientConfig(ok(on))).toEqual(on);
  });

  it('falls back to comments off, ads off, heartbeat 10 when the read fails', () => {
    const failure = apiFailure({ kind: 'UNREACHABLE', message: 'timeout' });
    expect(resolveClientConfig(err(failure))).toEqual(CONSERVATIVE_CLIENT_CONFIG);
    expect(resolveClientConfig(err(failure)).features.comments).toBe(false);
  });
});
