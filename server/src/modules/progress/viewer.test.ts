import { describe, expect, it } from 'vitest';

import {
  createSessionViewerResolver,
  createUnverifiableSessionResolver,
  parseBearerToken,
} from './viewer.js';

describe('parseBearerToken', () => {
  it('reads the token out of a bearer credential', () => {
    expect(parseBearerToken('Bearer tok_abc')).toEqual({ ok: true, value: 'tok_abc' });
  });

  // RFC 7235 makes the scheme case-insensitive, and a client sending `bearer` is not an attack.
  it('accepts the scheme in any case', () => {
    expect(parseBearerToken('bearer tok_abc')).toEqual({ ok: true, value: 'tok_abc' });
    expect(parseBearerToken('BEARER tok_abc')).toEqual({ ok: true, value: 'tok_abc' });
  });

  it.each([
    undefined,
    '',
    'tok_abc',
    'Basic dXNlcjpwYXNz',
    'Bearer',
    'Bearer ',
    'Bearer a b',
    'Bearertok_abc',
  ])('reports no credential for %j', (header) => {
    expect(parseBearerToken(header)).toEqual({ ok: false, error: 'NO_CREDENTIAL' });
  });

  // Trimming or normalising a credential is how an exact comparison stops being one.
  it('takes the token verbatim', () => {
    expect(parseBearerToken('Bearer ToK_AbC==')).toEqual({ ok: true, value: 'ToK_AbC==' });
  });
});

describe('createSessionViewerResolver', () => {
  const resolver = createSessionViewerResolver((token) =>
    token === 'tok_a' ? 'user_a' : undefined,
  );

  it('resolves a known token to its viewer', () => {
    expect(resolver.resolve('Bearer tok_a')).toEqual({ ok: true, value: { userId: 'user_a' } });
  });

  it('separates an unknown token from a missing one', () => {
    expect(resolver.resolve('Bearer tok_b')).toEqual({ ok: false, error: 'SESSION_REJECTED' });
    expect(resolver.resolve(undefined)).toEqual({ ok: false, error: 'NO_CREDENTIAL' });
  });

  it('treats an empty user id from the lookup as a rejection', () => {
    const empty = createSessionViewerResolver(() => '');

    expect(empty.resolve('Bearer tok_a')).toEqual({ ok: false, error: 'SESSION_REJECTED' });
  });
});

/**
 * The default resolver, and the reason it exists. No session in this deployment is verifiable —
 * `createSessionIssuer` keeps no token-to-user mapping and the platform code exchange refuses every
 * request — so accepting anything here would be accepting a user identifier the caller chose.
 */
describe('createUnverifiableSessionResolver', () => {
  const resolver = createUnverifiableSessionResolver();

  it('refuses every token, and says why to the operator', () => {
    for (const token of ['tok_a', 'x'.repeat(500), 'null', 'undefined']) {
      expect(resolver.resolve(`Bearer ${token}`)).toEqual({
        ok: false,
        error: 'SESSION_UNVERIFIABLE',
      });
    }
  });

  it('still reports a missing credential as such', () => {
    expect(resolver.resolve(undefined)).toEqual({ ok: false, error: 'NO_CREDENTIAL' });
  });
});
