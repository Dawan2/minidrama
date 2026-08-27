import { describe, expect, it } from 'vitest';

import {
  MAX_TRUSTED_DOMAINS,
  TRUSTED_DOMAINS,
  portalDomainList,
  validateDomainRegistry,
} from './domains.js';
import type { TrustedDomain } from './domains.js';

const domain = (url: string): TrustedDomain => ({ url, usage: 'api', reason: 'test' });

describe('trusted domain registry', () => {
  it('accepts the registry that ships in this repository', () => {
    expect(validateDomainRegistry()).toEqual([]);
  });

  it('stays within the platform budget', () => {
    expect(TRUSTED_DOMAINS.length).toBeLessThanOrEqual(MAX_TRUSTED_DOMAINS);
  });

  it('gives every domain a stated reason', () => {
    for (const entry of TRUSTED_DOMAINS) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects a scheme other than https or wss', () => {
    expect(validateDomainRegistry([domain('http://api.example.invalid')])).toContainEqual({
      url: 'http://api.example.invalid',
      rule: 'scheme must be https: or wss:',
    });
  });

  it('accepts wss for the websocket case', () => {
    expect(validateDomainRegistry([domain('wss://rt.example.invalid')])).toEqual([]);
  });

  it('rejects wildcards', () => {
    const violations = validateDomainRegistry([domain('https://*.example.invalid')]);
    expect(violations.map((v) => v.rule)).toContain('no wildcards');
  });

  it('rejects a path component', () => {
    const violations = validateDomainRegistry([domain('https://api.example.invalid/v1')]);
    expect(violations.map((v) => v.rule)).toContain('no path component');
  });

  it('rejects a trailing slash', () => {
    const violations = validateDomainRegistry([domain('https://api.example.invalid/')]);
    expect(violations.map((v) => v.rule)).toContain(
      'no trailing slash (the Portal stores bare origins)',
    );
  });

  it('rejects query and fragment components', () => {
    const violations = validateDomainRegistry([domain('https://api.example.invalid?k=v')]);
    expect(violations.map((v) => v.rule)).toContain('no query or fragment component');
  });

  it('rejects duplicates', () => {
    const violations = validateDomainRegistry([
      domain('https://api.example.invalid'),
      domain('https://api.example.invalid'),
    ]);
    expect(violations.map((v) => v.rule)).toContain('no duplicate entries');
  });

  it('rejects a registry over the budget', () => {
    const oversized = Array.from({ length: MAX_TRUSTED_DOMAINS + 1 }, (_unused, index) =>
      domain(`https://host-${String(index)}.example.invalid`),
    );
    const violations = validateDomainRegistry(oversized);
    expect(violations.map((v) => v.rule)).toContain(
      `at most ${String(MAX_TRUSTED_DOMAINS)} trusted domains`,
    );
  });

  it('produces a stable, sorted portal list', () => {
    const list = portalDomainList([
      domain('https://b.example.invalid'),
      domain('https://a.example.invalid'),
    ]);
    expect(list).toEqual(['https://a.example.invalid', 'https://b.example.invalid']);
  });
});
