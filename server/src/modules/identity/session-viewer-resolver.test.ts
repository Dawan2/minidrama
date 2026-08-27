import { describe, expect, it } from 'vitest';

import { createInMemorySessionStore } from './session-store.js';
import { createSessionViewerResolver } from './session-viewer-resolver.js';

/**
 * The adapter that turns an `Authorization` header into a viewer id. Three outcomes, never two:
 * anonymous, a viewer, or a refusal. The outcome that must not exist is "a token we could not read,
 * answered as anonymous" — that one tells a paying subscriber they own nothing, with a `200` and
 * nothing in the logs.
 */

const HOUR_MS = 60 * 60 * 1000;

describe('the session-backed viewer resolver', () => {
  it('resolves a session the store issued', () => {
    const store = createInMemorySessionStore();
    const session = store.issue('usr_fx_vip_active');
    const resolver = createSessionViewerResolver(store);

    expect(resolver.resolve(`Bearer ${session.accessToken}`)).toEqual({
      ok: true,
      value: 'usr_fx_vip_active',
    });
  });

  it('accepts the scheme in any casing, as HTTP does', () => {
    const store = createInMemorySessionStore();
    const session = store.issue('usr_abc');
    const resolver = createSessionViewerResolver(store);

    expect(resolver.resolve(`bearer ${session.accessToken}`)).toEqual({
      ok: true,
      value: 'usr_abc',
    });
  });

  it.each([undefined, '', '   '])('reads %j as an anonymous request', (authorization) => {
    const resolver = createSessionViewerResolver(createInMemorySessionStore());

    expect(resolver.resolve(authorization)).toEqual({ ok: true, value: null });
  });

  // A token the store does not hold is the caller's problem, not ours: a `401` the client answers by
  // running silent login again. It is not a 503 — the store answered.
  it('refuses a token it never issued', () => {
    const resolver = createSessionViewerResolver(createInMemorySessionStore());

    expect(resolver.resolve('Bearer opaque-token')).toEqual({
      ok: false,
      error: 'SESSION_REJECTED',
    });
  });

  it('refuses an expired session', () => {
    let nowMs = Date.parse('2026-08-27T10:00:00.000Z');
    const store = createInMemorySessionStore({ ttlSec: 3600, now: () => nowMs });
    const session = store.issue('usr_abc');
    const resolver = createSessionViewerResolver(store);

    nowMs += HOUR_MS + 1;

    expect(resolver.resolve(`Bearer ${session.accessToken}`)).toEqual({
      ok: false,
      error: 'SESSION_REJECTED',
    });
  });

  it('refuses a revoked session', () => {
    const store = createInMemorySessionStore();
    const session = store.issue('usr_abc');
    const resolver = createSessionViewerResolver(store);

    store.revoke(session.accessToken);

    expect(resolver.resolve(`Bearer ${session.accessToken}`)).toEqual({
      ok: false,
      error: 'SESSION_REJECTED',
    });
  });

  // The silent downgrade this whole path exists to prevent.
  it.each(['Basic dXNlcjpwYXNz', 'abc123', 'Bearer', 'Bearer   '])(
    'refuses %j rather than reading it as anonymous',
    (authorization) => {
      const resolver = createSessionViewerResolver(createInMemorySessionStore());

      expect(resolver.resolve(authorization)).toEqual({ ok: false, error: 'SESSION_REJECTED' });
    },
  );

  // One store per app, so a token from a different store is a token from nowhere.
  it('does not resolve a session issued by another store', () => {
    const other = createInMemorySessionStore();
    const session = other.issue('usr_abc');
    const resolver = createSessionViewerResolver(createInMemorySessionStore());

    expect(resolver.resolve(`Bearer ${session.accessToken}`)).toEqual({
      ok: false,
      error: 'SESSION_REJECTED',
    });
  });

  it('tolerates the whitespace a client may leave around the token', () => {
    const store = createInMemorySessionStore();
    const session = store.issue('usr_abc');
    const resolver = createSessionViewerResolver(store);

    expect(resolver.resolve(`Bearer  ${session.accessToken} `)).toEqual({
      ok: true,
      value: 'usr_abc',
    });
  });
});
