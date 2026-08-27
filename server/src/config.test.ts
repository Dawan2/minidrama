import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('falls back to container-friendly defaults', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ host: '0.0.0.0', port: 8080, logLevel: 'info' });
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({ HOST: '127.0.0.1', PORT: '3000', LOG_LEVEL: 'debug' });
    expect(config).toMatchObject({ host: '127.0.0.1', port: 3000, logLevel: 'debug' });
  });

  it('reports whether platform credentials are present without exposing them', () => {
    expect(loadConfig({}).hasPlatformCredentials).toBe(false);
    const withCredentials = loadConfig({
      TIKTOK_CLIENT_KEY: 'key',
      TIKTOK_CLIENT_SECRET: 'secret',
    });
    expect(withCredentials.hasPlatformCredentials).toBe(true);
    expect(JSON.stringify(withCredentials)).not.toContain('secret');
  });

  // Mock login is an authentication bypass, so the interesting assertion is the negative one: it
  // takes two deliberate values, and the values other flags are enabled with do not enable it.
  it('leaves the mock login path off unless the environment asks for it twice', () => {
    expect(loadConfig({}).testLoginEnabled).toBe(false);
    expect(loadConfig({ NODE_ENV: 'development' }).testLoginEnabled).toBe(false);
    expect(
      loadConfig({ MINIDRAMA_TEST_LOGIN: 'true', NODE_ENV: 'development' }).testLoginEnabled,
    ).toBe(false);
  });

  it('defaults the webhook timestamp window to the five minutes TikTok suggests', () => {
    expect(loadConfig({}).webhookToleranceSec).toBe(300);
  });

  it('reads a narrower window from the environment', () => {
    expect(loadConfig({ TIKTOK_WEBHOOK_TOLERANCE_SEC: '60' }).webhookToleranceSec).toBe(60);
  });

  // The window is not a switch. A value that would disable or invert the replay check falls back to
  // the default instead of widening it, so a typo cannot quietly turn verification into a formality.
  it.each(['0', '-1', 'forever', ''])(
    'falls back to the default for the unusable value %o',
    (raw) => {
      expect(loadConfig({ TIKTOK_WEBHOOK_TOLERANCE_SEC: raw }).webhookToleranceSec).toBe(300);
    },
  );
});
