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
});
