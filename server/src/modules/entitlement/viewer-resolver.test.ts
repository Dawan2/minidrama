import { describe, expect, it } from 'vitest';

import { createUnresolvedViewerResolver, readBearerToken } from './viewer-resolver.js';

describe('readBearerToken', () => {
  it('reads a bearer token', () => {
    expect(readBearerToken('Bearer abc123')).toEqual({ ok: true, value: 'abc123' });
  });

  it('accepts the scheme in any casing, as HTTP does', () => {
    expect(readBearerToken('bearer abc123')).toEqual({ ok: true, value: 'abc123' });
  });

  it.each([undefined, '', '   '])('reads %j as no credential offered', (authorization) => {
    expect(readBearerToken(authorization)).toEqual({ ok: true, value: null });
  });

  // The silent downgrade this module exists to prevent: a credential we cannot read is a refusal,
  // never an anonymous viewer.
  it.each(['Basic dXNlcjpwYXNz', 'abc123', 'Bearer', 'Bearer   '])(
    'refuses %j rather than reading it as anonymous',
    (authorization) => {
      expect(readBearerToken(authorization)).toEqual({ ok: false, error: 'SESSION_REJECTED' });
    },
  );
});

describe('the default viewer resolver', () => {
  const resolver = createUnresolvedViewerResolver();

  it('resolves an anonymous request', () => {
    expect(resolver.resolve(undefined)).toEqual({ ok: true, value: null });
  });

  // Sessions are opaque random tokens with no store behind them yet. Until one exists, a presented
  // token cannot be resolved, and saying so is the only honest answer.
  it('refuses a token it cannot resolve', () => {
    expect(resolver.resolve('Bearer opaque-token')).toEqual({
      ok: false,
      error: 'SESSION_UNRESOLVABLE',
    });
  });

  it('distinguishes a malformed credential from one it merely cannot resolve', () => {
    expect(resolver.resolve('Basic dXNlcjpwYXNz')).toEqual({
      ok: false,
      error: 'SESSION_REJECTED',
    });
  });
});
