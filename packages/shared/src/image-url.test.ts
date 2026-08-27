import { describe, expect, it } from 'vitest';

import { checkImageUrl, isTrustedImageUrl, normalizeImageHost } from './image-url.js';

const HOSTS = ['cdn.example.invalid', 'img.example.invalid'];

/**
 * The two schemes this suite exists to refuse. `no-script-url` forbids writing the first one as a
 * string literal anywhere in this repository, and that rule is right — a `javascript:` URL has no
 * legitimate place in the source either. The value is therefore assembled from parts, and what it
 * assembles to is exactly what a hostile content field would carry.
 */
const SCRIPT_URL = 'java' + 'script:alert(document.domain)';
const DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const reject = (raw: unknown, hosts: readonly string[] = HOSTS): string => {
  const result = checkImageUrl(raw, hosts);
  expect(result.ok).toBe(false);
  return result.ok ? '<accepted>' : result.error;
};

const accept = (raw: unknown, hosts: readonly string[] = HOSTS): string => {
  const result = checkImageUrl(raw, hosts);
  expect(result.ok).toBe(true);
  return result.ok ? result.value : '<rejected>';
};

describe('image URL trust', () => {
  it('accepts a URL on a listed host', () => {
    expect(accept('https://cdn.example.invalid/covers/drm_0001.jpg')).toBe(
      'https://cdn.example.invalid/covers/drm_0001.jpg',
    );
    expect(accept('https://img.example.invalid/covers/drm_0001.jpg')).toBe(
      'https://img.example.invalid/covers/drm_0001.jpg',
    );
  });

  it('accepts the query string a CDN resize uses', () => {
    expect(accept('https://cdn.example.invalid/c/1.jpg?w=360&fmt=webp')).toBe(
      'https://cdn.example.invalid/c/1.jpg?w=360&fmt=webp',
    );
  });

  it('returns the URL as parsed, so the caller renders what was checked', () => {
    expect(accept('HTTPS://CDN.Example.Invalid/Covers/A.jpg')).toBe(
      'https://cdn.example.invalid/Covers/A.jpg',
    );
  });

  it('accepts the default port written out, which the parser removes', () => {
    expect(accept('https://cdn.example.invalid:443/c/1.jpg')).toBe(
      'https://cdn.example.invalid/c/1.jpg',
    );
  });

  it('rejects an arbitrary host', () => {
    expect(reject('https://evil.example/covers/drm_0001.jpg')).toBe('HOST_NOT_TRUSTED');
    expect(reject('https://s3.amazonaws.com/bucket/cover.jpg')).toBe('HOST_NOT_TRUSTED');
    expect(reject('https://localhost/cover.jpg')).toBe('HOST_NOT_TRUSTED');
  });

  // Each of these is what one plausible "nearly exact" comparison would have allowed.
  it.each([
    ['https://cdn.example.invalid.evil.example/c.jpg', 'a prefix match'],
    ['https://evilcdn.example.invalid/c.jpg', 'a suffix match'],
    ['https://sub.cdn.example.invalid/c.jpg', 'a domain-suffix match'],
    ['https://cdn.example.invalid./c.jpg', 'a match that ignored the root label'],
  ])('rejects %s, which only %s would have allowed', (url) => {
    expect(reject(url)).toBe('HOST_NOT_TRUSTED');
  });

  it('rejects a homoglyph host, which is punycode by the time it is compared', () => {
    // `cdn.exаmple.invalid` with a Cyrillic а. On a screen it is the listed host; to the parser it
    // is `cdn.xn--exmple-4nf.invalid`, and comparing the parsed form is what catches it.
    expect(reject('https://cdn.ex\u0430mple.invalid/c.jpg')).toBe('HOST_NOT_TRUSTED');
  });

  it('rejects a javascript: URL', () => {
    expect(reject(SCRIPT_URL)).toBe('SCHEME_NOT_ALLOWED');
  });

  it('rejects a javascript: URL hidden behind leading whitespace and control characters', () => {
    // The URL parser strips these before reading the scheme, which is why the scheme is judged
    // after parsing rather than by looking at the string.
    expect(reject(`\n\t ${SCRIPT_URL}`)).toBe('SCHEME_NOT_ALLOWED');
    expect(reject(`\u0000${SCRIPT_URL}`)).toBe('SCHEME_NOT_ALLOWED');
  });

  it('rejects a data: URL, however small and however valid the image in it is', () => {
    expect(reject(DATA_URL)).toBe('SCHEME_NOT_ALLOWED');
  });

  it.each(['blob:https://cdn.example.invalid/1-2-3', 'about:blank', 'file:///etc/passwd'])(
    'rejects %s, which a javascript-and-data denylist would have admitted',
    (url) => {
      expect(reject(url)).toBe('SCHEME_NOT_ALLOWED');
    },
  );

  it('rejects plain http on a listed host rather than upgrading it', () => {
    expect(reject('http://cdn.example.invalid/c.jpg')).toBe('SCHEME_NOT_ALLOWED');
  });

  it('rejects credentials, which are how a listed host is used to misread an unlisted one', () => {
    // The host here *is* listed — that is the point. Read quickly, this URL looks like a request
    // to `evil.example`; read by the parser it is one to `cdn.example.invalid`. A field where the
    // two readings differ is not a field we pass on.
    expect(reject('https://evil.example@cdn.example.invalid/c.jpg')).toBe('CREDENTIALS_PRESENT');
    expect(reject('https://user:pass@cdn.example.invalid/c.jpg')).toBe('CREDENTIALS_PRESENT');
  });

  it('rejects a listed host on a port nobody registered', () => {
    expect(reject('https://cdn.example.invalid:8443/c.jpg')).toBe('PORT_NOT_ALLOWED');
  });

  it('rejects a relative or protocol-relative reference instead of resolving it', () => {
    expect(reject('/covers/drm_0001.jpg')).toBe('NOT_AN_ABSOLUTE_URL');
    expect(reject('covers/drm_0001.jpg')).toBe('NOT_AN_ABSOLUTE_URL');
    expect(reject('//cdn.example.invalid/c.jpg')).toBe('NOT_AN_ABSOLUTE_URL');
  });

  it('rejects an absent value without pretending it is a URL', () => {
    expect(reject(null)).toBe('MISSING');
    expect(reject(undefined)).toBe('MISSING');
    expect(reject('')).toBe('MISSING');
    expect(reject('   ')).toBe('MISSING');
  });

  it('rejects a non-string, because a JSON field can hold anything', () => {
    expect(reject(42)).toBe('NOT_A_STRING');
    expect(reject({ href: 'https://cdn.example.invalid/c.jpg' })).toBe('NOT_A_STRING');
    expect(reject(['https://cdn.example.invalid/c.jpg'])).toBe('NOT_A_STRING');
  });

  it('refuses everything when no host is listed, including a URL it would otherwise accept', () => {
    expect(reject('https://cdn.example.invalid/c.jpg', [])).toBe('NO_TRUSTED_HOSTS');
    expect(reject(SCRIPT_URL, [])).toBe('NO_TRUSTED_HOSTS');
  });

  it('refuses everything when the listed hosts are all unusable', () => {
    const junk = ['', '   ', '*', 'https://cdn.example.invalid', 'cdn.example.invalid/covers'];
    expect(reject('https://cdn.example.invalid/c.jpg', junk)).toBe('NO_TRUSTED_HOSTS');
  });

  it('never lets a wildcard entry stand for a host', () => {
    const wildcard = ['*.example.invalid'];
    expect(reject('https://cdn.example.invalid/c.jpg', wildcard)).toBe('NO_TRUSTED_HOSTS');
    // Not even the name the entry literally spells, which a URL is allowed to carry.
    expect(reject('https://*.example.invalid/c.jpg', wildcard)).toBe('NO_TRUSTED_HOSTS');
  });

  it('reads a listed host the way the parser will, so an entry cannot be almost right', () => {
    expect(accept('https://cdn.example.invalid/c.jpg', ['  CDN.Example.Invalid  '])).toBe(
      'https://cdn.example.invalid/c.jpg',
    );
  });

  it('compares an internationalised host as the punycode a URL carries', () => {
    expect(accept('https://köln.example.invalid/c.jpg', ['köln.example.invalid'])).toBe(
      'https://xn--kln-sna.example.invalid/c.jpg',
    );
  });

  it('answers the yes/no form the same way', () => {
    expect(isTrustedImageUrl('https://cdn.example.invalid/c.jpg', HOSTS)).toBe(true);
    expect(isTrustedImageUrl('https://evil.example/c.jpg', HOSTS)).toBe(false);
    expect(isTrustedImageUrl(SCRIPT_URL, HOSTS)).toBe(false);
    expect(isTrustedImageUrl(DATA_URL, HOSTS)).toBe(false);
    expect(isTrustedImageUrl('https://cdn.example.invalid/c.jpg', [])).toBe(false);
  });
});

describe('allowlist entries', () => {
  it('accepts a bare host and normalises it', () => {
    expect(normalizeImageHost('cdn.example.invalid')).toBe('cdn.example.invalid');
    expect(normalizeImageHost('  CDN.Example.Invalid ')).toBe('cdn.example.invalid');
    expect(normalizeImageHost('köln.example.invalid')).toBe('xn--kln-sna.example.invalid');
  });

  it.each([
    '',
    '   ',
    '*',
    '*.example.invalid',
    'https://cdn.example.invalid',
    'cdn.example.invalid/covers',
    'cdn.example.invalid:8443',
    'user@cdn.example.invalid',
    'cdn.example.invalid?k=v',
    'cdn.example.invalid#x',
    'cdn example invalid',
  ])('discards %j rather than repairing it', (entry) => {
    expect(normalizeImageHost(entry)).toBeNull();
  });
});
