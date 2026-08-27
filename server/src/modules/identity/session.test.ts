import { describe, expect, it } from 'vitest';

import { createSessionIssuer } from './session.js';

describe('createSessionIssuer', () => {
  it('issues an opaque token with a lifetime', () => {
    const session = createSessionIssuer({ ttlSec: 900 }).issue('open_abc');

    expect(session.expiresInSec).toBe(900);
    expect(session.accessToken.length).toBeGreaterThanOrEqual(32);
  });

  // A token that carries the user identifier without a signature is a token an attacker can build.
  it('does not derive the token from the open_id', () => {
    const session = createSessionIssuer().issue('open_abc');

    expect(session.accessToken).not.toContain('open_abc');
    expect(Buffer.from(session.accessToken, 'base64url').toString('utf8')).not.toContain(
      'open_abc',
    );
  });

  it('issues a different token every time, including for the same user', () => {
    const issuer = createSessionIssuer();
    const tokens = new Set([1, 2, 3, 4, 5].map(() => issuer.issue('open_abc').accessToken));

    expect(tokens.size).toBe(5);
  });

  it('emits a url-safe token, since it travels in headers', () => {
    expect(createSessionIssuer().issue('open_abc').accessToken).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // Minis keeps the access token in memory and re-runs silent login when it expires, so there is no
  // refresh token to hand out and no long-lived credential on the client.
  it('issues no refresh token', () => {
    expect(Object.keys(createSessionIssuer().issue('open_abc'))).toEqual([
      'accessToken',
      'expiresInSec',
    ]);
  });
});
