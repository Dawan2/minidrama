import { describe, expect, it } from 'vitest';

import {
  ALLOWED_METHODS,
  ALLOWED_REQUEST_HEADERS,
  createCorsPolicy,
  decideCors,
  parseOriginAllowlist,
  readRequestOrigin,
} from './origin-policy.js';
import type { CorsRequest, CorsVerdict } from './origin-policy.js';

/**
 * The allowlist and the decision, with no server around them. Everything that costs something to
 * get wrong is decided here, so it can be asserted exhaustively rather than through a status code.
 */

const APP_ORIGIN = 'https://webview.example.invalid';
const policy = createCorsPolicy([APP_ORIGIN]);

function request(overrides: Partial<CorsRequest> = {}): CorsRequest {
  return {
    method: 'GET',
    origin: undefined,
    requestMethod: undefined,
    requestHeaders: undefined,
    selfOrigin: 'https://api.example.invalid',
    ...overrides,
  };
}

function preflight(overrides: Partial<CorsRequest> = {}): CorsRequest {
  return request({
    method: 'OPTIONS',
    requestMethod: 'POST',
    requestHeaders: 'content-type',
    ...overrides,
  });
}

describe('parseOriginAllowlist', () => {
  it('reads nothing out of an unset variable, which allows nobody', () => {
    expect(parseOriginAllowlist(undefined).allowed).toEqual([]);
    expect(parseOriginAllowlist('').allowed).toEqual([]);
  });

  it('reads a comma-separated list and tolerates the whitespace around it', () => {
    const { allowed } = parseOriginAllowlist(' https://a.example.com , https://b.example.com ');

    expect(allowed).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  // The headline rule. There is no spelling of "everyone" that this accepts, because the API reads
  // an Authorization header and a wildcard hands it to whoever asks.
  it.each(['*', ' * ', 'https://*.example.com', 'https://example.*'])(
    'refuses the wildcard entry %o rather than honouring it',
    (raw) => {
      const { allowed, rejected } = parseOriginAllowlist(raw);

      expect(allowed).toEqual([]);
      expect(rejected).toEqual([{ value: raw.trim(), reason: 'WILDCARD' }]);
    },
  );

  it('keeps the usable entries when one in the middle is not', () => {
    const { allowed, rejected } = parseOriginAllowlist(
      'https://a.example.com,*,https://b.example.com',
    );

    expect(allowed).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(rejected).toEqual([{ value: '*', reason: 'WILDCARD' }]);
  });

  it.each([
    ['example.com', 'NOT_AN_ABSOLUTE_URL'],
    ['//example.com', 'NOT_AN_ABSOLUTE_URL'],
    ['http://example.com', 'SCHEME_NOT_ALLOWED'],
    ['ftp://example.com', 'SCHEME_NOT_ALLOWED'],
    // These serialise to the opaque origin — the literal string "null", which is also what a
    // sandboxed iframe sends. An entry that normalised to it would allow every one of them.
    ['about:blank', 'NOT_A_BARE_ORIGIN'],
    ['mailto:ops@example.com', 'NOT_A_BARE_ORIGIN'],
    ['blob:https://example.com/x', 'SCHEME_NOT_ALLOWED'],
    ['https://user:pass@example.com', 'NOT_A_BARE_ORIGIN'],
    ['https://example.com/app', 'NOT_A_BARE_ORIGIN'],
    ['https://example.com?a=1', 'NOT_A_BARE_ORIGIN'],
    ['https://example.com#f', 'NOT_A_BARE_ORIGIN'],
  ])('refuses %o as %s', (raw, reason) => {
    const { allowed, rejected } = parseOriginAllowlist(raw);

    expect(allowed).toEqual([]);
    expect(rejected).toEqual([{ value: raw, reason }]);
  });

  // Plain HTTP on loopback is not a downgrade — there is no wire — and refusing it would push
  // local development towards disabling the whole check.
  it.each(['http://localhost:5173', 'http://127.0.0.1:8080', 'http://[::1]:3000'])(
    'accepts the loopback development origin %o',
    (raw) => {
      expect(parseOriginAllowlist(raw).allowed).toEqual([raw]);
    },
  );

  it('normalises to the serialisation a browser sends', () => {
    const { allowed } = parseOriginAllowlist('https://API.Example.COM:443/');

    expect(allowed).toEqual(['https://api.example.com']);
  });

  it('reports a repeated entry instead of holding it twice', () => {
    const { allowed, rejected } = parseOriginAllowlist(
      'https://a.example.com,https://a.example.com/',
    );

    expect(allowed).toEqual(['https://a.example.com']);
    expect(rejected).toEqual([{ value: 'https://a.example.com/', reason: 'DUPLICATE' }]);
  });

  it('keeps a port as part of the identity of an origin', () => {
    const { allowed } = parseOriginAllowlist('https://example.com:8443');

    expect(allowed).toEqual(['https://example.com:8443']);
    expect(allowed).not.toContain('https://example.com');
  });
});

describe('readRequestOrigin', () => {
  it('reads the exact serialisation a browser sends', () => {
    expect(readRequestOrigin('https://example.com')).toBe('https://example.com');
    expect(readRequestOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });

  // Everything below is something a browser never sends. A value we cannot reason about is not a
  // value we match — `null` above all, which is what a sandboxed iframe and a `file://` page send.
  it.each([
    'null',
    'https://example.com/',
    'https://example.com/path',
    'https://example.com:443',
    'HTTPS://EXAMPLE.COM',
    'https://example.com, https://evil.example',
    ' https://example.com',
    'example.com',
    '',
  ])('refuses to read %o as an origin', (raw) => {
    expect(readRequestOrigin(raw)).toBeNull();
  });

  it('refuses a repeated header, however Node presents it', () => {
    expect(readRequestOrigin(['https://example.com', 'https://evil.example'])).toBeNull();
    expect(readRequestOrigin('https://example.com,https://evil.example')).toBeNull();
    expect(readRequestOrigin(undefined)).toBeNull();
  });
});

describe('decideCors', () => {
  it('leaves a request with no Origin header alone', () => {
    const verdict = decideCors(policy, request({ method: 'POST' }));

    expect(verdict).toEqual({ kind: 'NOT_CROSS_ORIGIN', reason: 'NO_ORIGIN' });
  });

  it('leaves a same-origin request alone', () => {
    const verdict = decideCors(
      policy,
      request({ method: 'POST', origin: 'https://api.example.invalid' }),
    );

    expect(verdict).toEqual({ kind: 'NOT_CROSS_ORIGIN', reason: 'SAME_ORIGIN' });
  });

  it('allows an allowlisted origin and names it in the header', () => {
    const verdict = decideCors(policy, request({ origin: APP_ORIGIN }));

    expect(verdict).toMatchObject({ kind: 'ALLOWED', origin: APP_ORIGIN });
  });

  it('denies an origin that is not on the list', () => {
    const verdict = decideCors(policy, request({ origin: 'https://evil.example' }));

    expect(verdict).toMatchObject({
      kind: 'DENIED',
      reason: 'ORIGIN_NOT_ALLOWED',
      preflight: false,
    });
  });

  it('denies everything when the allowlist is empty', () => {
    const verdict = decideCors(createCorsPolicy([]), request({ origin: APP_ORIGIN }));

    expect(verdict).toMatchObject({ kind: 'DENIED', reason: 'NO_ALLOWLIST_CONFIGURED' });
  });

  it('denies an unreadable Origin header', () => {
    const verdict = decideCors(policy, request({ origin: 'null' }));

    expect(verdict).toMatchObject({ kind: 'DENIED', reason: 'ORIGIN_MALFORMED', origin: null });
  });

  // A prefix match would allow `https://webview.example.invalid.evil.example`, and a suffix match
  // would allow `https://evil-webview.example.invalid`.
  it.each([
    'https://webview.example.invalid.evil.example',
    'https://evilwebview.example.invalid',
    'http://webview.example.invalid',
    'https://webview.example.invalid:8443',
  ])('denies %o, which only looks like the allowed origin', (origin) => {
    expect(decideCors(policy, request({ origin }))).toMatchObject({ kind: 'DENIED' });
  });
});

describe('decideCors, preflight', () => {
  it('answers an allowed preflight with the methods and headers it may use', () => {
    const verdict = decideCors(policy, preflight({ origin: APP_ORIGIN }));

    expect(verdict).toMatchObject({ kind: 'PREFLIGHT_ALLOWED', origin: APP_ORIGIN });
    expect(headersOf(verdict)).toEqual({
      'access-control-allow-origin': APP_ORIGIN,
      'access-control-allow-methods': ALLOWED_METHODS.join(', '),
      'access-control-allow-headers': ALLOWED_REQUEST_HEADERS.join(', '),
      'access-control-max-age': '600',
    });
  });

  it('allows the headers the client actually sends on an unlock write', () => {
    const verdict = decideCors(
      policy,
      preflight({
        origin: APP_ORIGIN,
        requestHeaders: 'Authorization, Content-Type, Idempotency-Key',
      }),
    );

    expect(verdict).toMatchObject({ kind: 'PREFLIGHT_ALLOWED' });
  });

  it('denies a preflight from an origin that is not on the list', () => {
    const verdict = decideCors(policy, preflight({ origin: 'https://evil.example' }));

    expect(verdict).toMatchObject({
      kind: 'DENIED',
      reason: 'ORIGIN_NOT_ALLOWED',
      preflight: true,
    });
  });

  // The origin is checked first on purpose: a stranger asking for DELETE learns that it was
  // refused, not which methods an allowed origin would have been offered.
  it('denies a preflight for a method no route implements', () => {
    expect(
      decideCors(policy, preflight({ origin: APP_ORIGIN, requestMethod: 'DELETE' })),
    ).toMatchObject({
      kind: 'DENIED',
      reason: 'METHOD_NOT_ALLOWED',
    });
  });

  it('denies a preflight asking to send a header this API does not accept', () => {
    const verdict = decideCors(
      policy,
      preflight({ origin: APP_ORIGIN, requestHeaders: 'content-type, x-admin-override' }),
    );

    expect(verdict).toMatchObject({ kind: 'DENIED', reason: 'REQUEST_HEADER_NOT_ALLOWED' });
  });

  it('reads the requested method and headers case-insensitively, as the browser writes them', () => {
    const verdict = decideCors(
      policy,
      preflight({ origin: APP_ORIGIN, requestMethod: 'post', requestHeaders: 'CONTENT-TYPE' }),
    );

    expect(verdict).toMatchObject({ kind: 'PREFLIGHT_ALLOWED' });
  });

  it('treats an OPTIONS request with no requested method as an ordinary request', () => {
    const verdict = decideCors(
      policy,
      request({ method: 'OPTIONS', origin: APP_ORIGIN, requestHeaders: 'content-type' }),
    );

    expect(verdict).toMatchObject({ kind: 'ALLOWED' });
  });

  it('never offers credentials, on any verdict', () => {
    const verdicts = [
      decideCors(policy, request({ origin: APP_ORIGIN })),
      decideCors(policy, preflight({ origin: APP_ORIGIN })),
    ];

    for (const verdict of verdicts) {
      expect(Object.keys(headersOf(verdict))).not.toContain('access-control-allow-credentials');
    }
  });
});

function headersOf(verdict: CorsVerdict): Readonly<Record<string, string>> {
  return verdict.kind === 'ALLOWED' || verdict.kind === 'PREFLIGHT_ALLOWED' ? verdict.headers : {};
}
