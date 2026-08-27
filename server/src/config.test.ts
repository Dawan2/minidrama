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

  it('defaults the webhook timestamp window to the five minutes TikTok suggests', () => {
    expect(loadConfig({}).webhookToleranceSec).toBe(300);
  });

  it('reads a narrower window from the environment', () => {
    expect(loadConfig({ TIKTOK_WEBHOOK_TOLERANCE_SEC: '60' }).webhookToleranceSec).toBe(60);
  });

  // Nothing is the default, and nothing is what an unusable value falls back to. A deployment that
  // forgot the variable serves no browser; a deployment that mistyped it serves no browser either.
  it('allows no browser origin until one is configured', () => {
    expect(loadConfig({}).corsAllowedOrigins).toEqual([]);
    expect(loadConfig({ CORS_ALLOWED_ORIGINS: '' }).corsAllowedOrigins).toEqual([]);
  });

  it('reads the allowlist from the environment', () => {
    const config = loadConfig({
      CORS_ALLOWED_ORIGINS: 'https://a.example.com, http://localhost:5173',
    });

    expect(config.corsAllowedOrigins).toEqual(['https://a.example.com', 'http://localhost:5173']);
    expect(config.corsRejectedOrigins).toEqual([]);
  });

  // There is no value of this variable that means "any origin". `*` is the configuration a hurried
  // deployment reaches for, and on an API that reads an Authorization header it is account access
  // for every page on the internet.
  it('never turns a wildcard into an allowed origin', () => {
    const config = loadConfig({ CORS_ALLOWED_ORIGINS: '*' });

    expect(config.corsAllowedOrigins).toEqual([]);
    expect(config.corsRejectedOrigins).toEqual([{ value: '*', reason: 'WILDCARD' }]);
  });

  it('reports the entries it discarded so a typo is visible', () => {
    const config = loadConfig({ CORS_ALLOWED_ORIGINS: 'https://good.example.com,not-an-origin' });

    expect(config.corsAllowedOrigins).toEqual(['https://good.example.com']);
    expect(config.corsRejectedOrigins).toEqual([
      { value: 'not-an-origin', reason: 'NOT_AN_ABSOLUTE_URL' },
    ]);
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
