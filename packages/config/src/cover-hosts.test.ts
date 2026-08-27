import { describe, expect, it } from 'vitest';

import {
  TRUSTED_COVER_HOSTS,
  checkCoverUrl,
  coverHostList,
  isTrustedCoverUrl,
  validateCoverHostRegistry,
} from './cover-hosts.js';
import { TRUSTED_DOMAINS } from './domains.js';
import type { TrustedCoverHost } from './cover-hosts.js';
import type { TrustedDomain } from './domains.js';

const coverHost = (host: string): TrustedCoverHost => ({ host, reason: 'test' });
const imageDomain = (url: string): TrustedDomain => ({ url, usage: 'image', reason: 'test' });

/** The same host in both lists, which is the only arrangement the registry considers valid. */
const registered = {
  hosts: [coverHost('cdn.example.invalid')],
  domains: [imageDomain('https://cdn.example.invalid')],
};

/** `no-script-url` forbids the literal, and the rule is right; see `image-url.test.ts`. */
const SCRIPT_URL = 'java' + 'script:alert(document.domain)';
const DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const rejectionFor = (raw: unknown, hosts?: readonly TrustedCoverHost[]): string => {
  const result = hosts === undefined ? checkCoverUrl(raw) : checkCoverUrl(raw, hosts);
  expect(result.ok).toBe(false);
  return result.ok ? '<accepted>' : result.error;
};

describe('trusted cover host registry', () => {
  it('accepts the registry that ships in this repository', () => {
    expect(validateCoverHostRegistry()).toEqual([]);
  });

  it('gives every host a stated reason', () => {
    for (const entry of TRUSTED_COVER_HOSTS) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('names at least one host, or no cover could ever be rendered', () => {
    expect(TRUSTED_COVER_HOSTS.length).toBeGreaterThan(0);
  });

  it('agrees with the trusted domains it ships beside', () => {
    // Stated here as well as inside the validator, because this is the property that cannot be
    // observed anywhere but a real device: a cover host the Portal has not been told about
    // produces a broken image there and a working one in every environment we can test.
    const imageDomains = TRUSTED_DOMAINS.filter((domain) => domain.usage === 'image').map(
      (domain) => new URL(domain.url).hostname,
    );
    expect([...imageDomains].sort((a, b) => a.localeCompare(b))).toEqual(coverHostList());
  });

  it('produces a stable, sorted host list', () => {
    expect(coverHostList([coverHost('b.example.invalid'), coverHost('a.example.invalid')])).toEqual(
      ['a.example.invalid', 'b.example.invalid'],
    );
  });

  it.each([
    ['https://cdn.example.invalid', 'a scheme'],
    ['cdn.example.invalid/covers', 'a path'],
    ['cdn.example.invalid:8443', 'a port'],
    ['*.example.invalid', 'a wildcard'],
    ['user@cdn.example.invalid', 'credentials'],
  ])('refuses the entry %j, which is a hostname with %s', (host) => {
    const violations = validateCoverHostRegistry([coverHost(host)], registered.domains);
    expect(violations.map((violation) => violation.rule)).toContain(
      'must be a bare hostname (no scheme, path, port or wildcard)',
    );
  });

  it('refuses an entry that is not already in the form it is compared as', () => {
    const violations = validateCoverHostRegistry(
      [coverHost('CDN.Example.Invalid')],
      registered.domains,
    );
    expect(violations.map((violation) => violation.rule)).toContain(
      'must be written as it is compared (cdn.example.invalid)',
    );
  });

  it('refuses an internationalised entry written in the spelling a URL never carries', () => {
    const violations = validateCoverHostRegistry(
      [coverHost('köln.example.invalid')],
      [imageDomain('https://köln.example.invalid')],
    );
    expect(violations.map((violation) => violation.rule)).toContain(
      'must be written as it is compared (xn--kln-sna.example.invalid)',
    );
  });

  it('refuses a host with no stated reason', () => {
    const violations = validateCoverHostRegistry(
      [{ host: 'cdn.example.invalid', reason: '  ' }],
      registered.domains,
    );
    expect(violations.map((violation) => violation.rule)).toContain(
      'must state why images may come from this host',
    );
  });

  it('refuses duplicates', () => {
    const violations = validateCoverHostRegistry(
      [coverHost('cdn.example.invalid'), coverHost('cdn.example.invalid')],
      registered.domains,
    );
    expect(violations.map((violation) => violation.rule)).toContain('no duplicate entries');
  });

  it('refuses a cover host that no trusted domain covers', () => {
    const violations = validateCoverHostRegistry(
      [coverHost('img.other.invalid')],
      [imageDomain('https://cdn.example.invalid')],
    );
    expect(violations).toContainEqual({
      host: 'img.other.invalid',
      rule: 'must also be a trusted domain with usage image, or the image is blocked on device',
    });
  });

  it('refuses a cover host registered for some other usage', () => {
    // `api.example.invalid` is trusted for requests this repository writes. That is not the same
    // permission as "a content field may name it", and reading it as one is the mistake.
    const violations = validateCoverHostRegistry(
      [coverHost('api.example.invalid')],
      [{ url: 'https://api.example.invalid', usage: 'api', reason: 'test' }],
    );
    expect(violations.map((violation) => violation.rule)).toContain(
      'must also be a trusted domain with usage image, or the image is blocked on device',
    );
  });

  it('refuses an image domain that is not a cover host', () => {
    const violations = validateCoverHostRegistry(registered.hosts, [
      ...registered.domains,
      imageDomain('https://img.unused.invalid'),
    ]);
    expect(violations).toContainEqual({
      host: 'https://img.unused.invalid',
      rule: 'a trusted domain with usage image must be a trusted cover host, or it buys nothing',
    });
  });

  it('leaves a malformed trusted domain to the registry that owns it', () => {
    // One typo should look like one problem. `validateDomainRegistry` reports this entry.
    const violations = validateCoverHostRegistry(registered.hosts, [
      ...registered.domains,
      imageDomain('not-a-url'),
    ]);
    expect(violations).toEqual([]);
  });
});

describe('cover URL trust', () => {
  it('accepts a cover URL on the registered host', () => {
    const result = checkCoverUrl('https://cdn.example.invalid/covers/drm_fx_0001.jpg');
    expect(result).toEqual({
      ok: true,
      value: 'https://cdn.example.invalid/covers/drm_fx_0001.jpg',
    });
  });

  it('accepts every host in the registry, and only those', () => {
    for (const host of coverHostList()) {
      expect(isTrustedCoverUrl(`https://${host}/covers/a.jpg`)).toBe(true);
    }
    expect(isTrustedCoverUrl('https://evil.example/covers/a.jpg')).toBe(false);
  });

  it('rejects an arbitrary host', () => {
    expect(rejectionFor('https://evil.example/covers/a.jpg')).toBe('HOST_NOT_TRUSTED');
    expect(rejectionFor('https://cdn.example.invalid.evil.example/a.jpg')).toBe('HOST_NOT_TRUSTED');
  });

  it('rejects the API host, which is trusted for a different thing', () => {
    expect(rejectionFor('https://api.example.invalid/covers/a.jpg')).toBe('HOST_NOT_TRUSTED');
  });

  it('rejects a javascript: URL', () => {
    expect(rejectionFor(SCRIPT_URL)).toBe('SCHEME_NOT_ALLOWED');
  });

  it('rejects a data: URL', () => {
    expect(rejectionFor(DATA_URL)).toBe('SCHEME_NOT_ALLOWED');
  });

  it('rejects plain http on the registered host', () => {
    expect(rejectionFor('http://cdn.example.invalid/covers/a.jpg')).toBe('SCHEME_NOT_ALLOWED');
  });

  it('rejects an absent cover, since a missing image is not a trusted one', () => {
    expect(rejectionFor(null)).toBe('MISSING');
    expect(rejectionFor(undefined)).toBe('MISSING');
    expect(rejectionFor('')).toBe('MISSING');
  });

  it('refuses everything when the registry is empty', () => {
    expect(rejectionFor('https://cdn.example.invalid/covers/a.jpg', [])).toBe('NO_TRUSTED_HOSTS');
    expect(isTrustedCoverUrl('https://cdn.example.invalid/covers/a.jpg', [])).toBe(false);
  });
});
