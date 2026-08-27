import { describe, expect, it, vi } from 'vitest';

import { createSessionStore } from '../session/session-store';
import { createTransports } from './transports';
import type { FetchLike, HttpResponseLike } from './http';

const GRANT = { accessToken: 'tok_abc', expiresInSec: 3_600, openId: 'open_abc' };

function jsonResponse(status: number, body: unknown = {}): HttpResponseLike {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function transports(fetchImpl: FetchLike, session = createSessionStore()) {
  return {
    session,
    ...createTransports({ baseUrl: 'https://api.example.invalid', fetch: fetchImpl, session }),
  };
}

describe('the transports', () => {
  it('sends the session on a business read and on a business write', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.http.getJson('/v1/dramas/drm_1');
    await wired.http.postJson('/v1/unlock/coin-orders', { episodeId: 'ep_1' });

    for (const call of fetchImpl.mock.calls) {
      expect(call[1].headers['Authorization']).toBe('Bearer tok_abc');
    }
  });

  /**
   * The rule this module exists to make assertable: a session cannot be created by presenting one.
   * The header is absent even when a perfectly good session is held, because the login transport has
   * no way to reach it.
   */
  it('never sends a session on the login exchange, even when one is held', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.login.postJson('/v1/auth/login', { provider: 'TIKTOK', authCode: 'code_1' });

    expect(fetchImpl.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
  });

  it('reads the catalogue anonymously while there is no session', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200)));
    await transports(fetchImpl).http.getJson('/v1/recommendations/feed');

    expect(fetchImpl.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
  });

  it('drops a session the server refused', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.http.postJson('/v1/unlock/coin-orders', {});

    expect(wired.session.bearerToken()).toBeNull();
  });

  // The next request is honestly anonymous rather than a replay of a credential already refused.
  it('sends no header on the request after a refusal', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.http.getJson('/v1/x');
    await wired.http.getJson('/v1/x');

    expect(fetchImpl.mock.calls[0]![1].headers['Authorization']).toBe('Bearer tok_abc');
    expect(fetchImpl.mock.calls[1]![1].headers).not.toHaveProperty('Authorization');
  });

  /**
   * A `401` from the login endpoint is a rejected `authCode`, not a rejected session — and it
   * arrives on a transport that presented nothing. Signing the viewer out over it would end a
   * perfectly good session because a *different* credential was refused.
   */
  it('keeps a held session when the login exchange itself is refused', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.login.postJson('/v1/auth/login', { provider: 'TIKTOK', authCode: 'code_1' });

    expect(wired.session.bearerToken()).toBe('tok_abc');
  });

  it('gives the login exchange a shorter budget than a read', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    const session = createSessionStore();
    const wired = createTransports({
      baseUrl: 'https://api.example.invalid',
      fetch: hang,
      session,
      loginTimeoutMs: 5,
    });

    const result = await wired.login.postJson('/v1/auth/login', {});

    expect(result.ok ? null : result.error.kind).toBe('TIMEOUT');
  });
});
