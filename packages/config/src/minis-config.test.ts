import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TRUSTED_DOMAINS } from './domains.js';
import { DomainRegistryError, buildMinisConfig, serializeMinisConfig } from './minis-config.js';
import { minisConfigPath } from './paths.js';
import type { TrustedDomain } from './domains.js';

describe('minis.config.json generation', () => {
  it('emits both domain lists from the one registry', () => {
    const config = buildMinisConfig();
    expect(config.domain.trustedDomains).toEqual(config.domain.allowList);
    expect(config.domain.trustedDomains).toContain('https://api.example.invalid');
  });

  it('carries every image host, since an <img src> is checked against the same list', () => {
    const { trustedDomains } = buildMinisConfig().domain;
    for (const entry of TRUSTED_DOMAINS.filter((domain) => domain.usage === 'image')) {
      expect(trustedDomains).toContain(entry.url);
    }
  });

  it('refuses to emit a config from an invalid registry', () => {
    const bad: TrustedDomain[] = [{ url: 'http://oops.invalid', usage: 'api', reason: 'test' }];
    expect(() => buildMinisConfig(bad)).toThrow(DomainRegistryError);
  });

  it('passes unknown fields through untouched', () => {
    const config = buildMinisConfig(undefined, { appName: 'minidrama' });
    expect(config.appName).toBe('minidrama');
  });

  // The committed file is what gets packaged into the ZIP. If it can drift from the registry,
  // the Portal list and the bundle disagree and requests fail on device only.
  it('matches the committed app/minis.config.json byte for byte', () => {
    const committed = readFileSync(minisConfigPath, 'utf8');
    expect(committed).toBe(serializeMinisConfig(buildMinisConfig()));
  });
});
