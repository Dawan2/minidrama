import { describe, expect, it, vi } from 'vitest';

import { createLoginTransport, createSessionTransport } from './transports';
import { createSessionRecovery } from '../session/session-recovery';
import { createSessionStore } from '../session/session-store';
import type { FetchLike, HttpResponseLike } from './http';
import type { SessionRecovery } from '../session/session-recovery';
import type { SessionStore } from '../session/session-store';
import type { SilentLogin, SilentLoginResult } from '../session/silent-login';

const BASE_URL = 'https://api.example.invalid';
const GRANT = { accessToken: 'tok_abc', expiresInSec: 3_600, openId: 'open_abc' };
const NEXT_GRANT = { accessToken: 'tok_next', expiresInSec: 3_600, openId: 'open_abc' };

function jsonResponse(status: number, body: unknown = {}): HttpResponseLike {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

/** A login that does what the real one does to the store, without a bridge or a server. */
function loginAdopting(store: SessionStore, grant = NEXT_GRANT): SilentLogin {
  return vi.fn<SilentLogin>(() => {
    const adopted = store.adopt(grant);
    return Promise.resolve({
      outcome: adopted.ok ? ('SIGNED_IN' as const) : ('SESSION_UNUSABLE' as const),
      failure: null,
      rejection: null,
    });
  });
}

/** A login that never produces a session, so a drop is observable without a re-acquire. */
function loginFailing(): SilentLogin {
  return vi.fn<SilentLogin>(() =>
    Promise.resolve({ outcome: 'UNREACHABLE', failure: null, rejection: null }),
  );
}

function transports(
  fetchImpl: FetchLike,
  overrides: {
    readonly session?: SessionStore;
    readonly signIn?: SilentLogin;
    readonly recovery?: SessionRecovery;
    readonly loginTimeoutMs?: number;
  } = {},
) {
  const session = overrides.session ?? createSessionStore();
  const signIn = overrides.signIn ?? loginAdopting(session);
  const recovery = overrides.recovery ?? createSessionRecovery({ signIn });

  return {
    session,
    signIn,
    recovery,
    http: createSessionTransport({ baseUrl: BASE_URL, fetch: fetchImpl, session, recovery }),
    login: createLoginTransport({
      baseUrl: BASE_URL,
      fetch: fetchImpl,
      ...(overrides.loginTimeoutMs === undefined ? {} : { timeoutMs: overrides.loginTimeoutMs }),
    }),
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

  it('gives the login exchange a shorter budget than a read', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    const wired = transports(hang, { loginTimeoutMs: 5 });

    const result = await wired.login.postJson('/v1/auth/login', {});

    expect(result.ok ? null : result.error.kind).toBe('TIMEOUT');
  });
});

/**
 * The two halves of a refused token, in the order they happen: the dead one is dropped, and a new
 * one is acquired for the requests *after* the refused one. The refused request itself is never
 * repeated — the only `POST` this client makes opens a payment (`http.ts` rule 4).
 */
describe('the transports answering a refused token', () => {
  it('drops the session the server refused', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const session = createSessionStore();
    const wired = transports(fetchImpl, { session, signIn: loginFailing() });
    session.adopt(GRANT);

    await wired.http.postJson('/v1/unlock/coin-orders', {});

    expect(wired.session.bearerToken()).toBeNull();
  });

  it('runs a silent login for it', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.http.getJson('/v1/users/me/favorites');
    // The login is not awaited by the transport, so the assertion waits for the microtask it left.
    await Promise.resolve();

    expect(wired.signIn).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole point of re-acquiring: this is what C3 could not do — the request after a mid-visit
   * expiry travels with a session again instead of being anonymous until the next cold start.
   */
  it('sends the re-acquired session on the next request', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValue(jsonResponse(200));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.http.getJson('/v1/users/me/favorites');
    await Promise.resolve();
    await wired.http.getJson('/v1/users/me/favorites');

    expect(fetchImpl.mock.calls[0]![1].headers['Authorization']).toBe('Bearer tok_abc');
    expect(fetchImpl.mock.calls[1]![1].headers['Authorization']).toBe('Bearer tok_next');
  });

  // The refused request is answered, not retried. A replay of a coin order is a second charge.
  it('does not repeat the request that was refused', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    const result = await wired.http.postJson('/v1/unlock/coin-orders', { episodeId: 'ep_1' });
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok ? null : result.error).toMatchObject({ kind: 'HTTP', status: 401 });
  });

  it('reports the refusal to the caller rather than waiting for the login', async () => {
    let release = (): void => {};
    const wired = transports(() => Promise.resolve(jsonResponse(401)), {
      signIn: vi.fn<SilentLogin>(
        () =>
          new Promise<SilentLoginResult>((resolve) => {
            release = () => {
              resolve({ outcome: 'SIGNED_IN', failure: null, rejection: null });
            };
          }),
      ),
    });
    wired.session.adopt(GRANT);

    // Resolves while the login is still in flight, which is the property being asserted: awaiting
    // it here would be the refresh-and-replay interceptor this deliberately is not.
    const result = await wired.http.getJson('/v1/users/me/favorites');
    release();

    expect(result.ok).toBe(false);
  });

  /**
   * A `401` from the login endpoint is a rejected `authCode`, not a rejected session — and it
   * arrives on a transport that presented nothing. Signing the viewer out over it would end a
   * perfectly good session because a *different* credential was refused, and re-logging in over it
   * would answer a failed login with another login.
   */
  it('keeps a held session, and runs no login, when the login exchange itself is refused', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const wired = transports(fetchImpl);
    wired.session.adopt(GRANT);

    await wired.login.postJson('/v1/auth/login', { provider: 'TIKTOK', authCode: 'code_1' });
    await Promise.resolve();

    expect(wired.session.bearerToken()).toBe('tok_abc');
    expect(wired.signIn).not.toHaveBeenCalled();
  });

  /**
   * A `401` on an anonymous read is the server declining a stranger. There is no credential to drop
   * and nothing to re-acquire — a login provoked by one would be a login provoked by a catalogue
   * request that never claimed to be anybody.
   */
  it('runs no login for a 401 on a request that carried no token', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(401)));
    const wired = transports(fetchImpl);

    await wired.http.getJson('/v1/dramas/drm_1');
    await Promise.resolve();

    expect(wired.signIn).not.toHaveBeenCalled();
  });
});

/**
 * The refill side of the bound. Without it the budget is a lifetime cap, and a long visit with three
 * expiries in it would end with a client that has stopped trying.
 */
describe('the transports reporting a credential that worked', () => {
  it('refills the re-acquire budget when an authenticated request is accepted', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValue(jsonResponse(200));
    const session = createSessionStore();
    const recovery = createSessionRecovery({ signIn: loginAdopting(session), maxAttempts: 2 });
    const wired = transports(fetchImpl, { session, recovery });
    session.adopt(GRANT);

    await wired.http.getJson('/v1/users/me/favorites');
    await Promise.resolve();
    expect(recovery.attemptsLeft()).toBe(1);

    await wired.http.getJson('/v1/users/me/favorites');

    expect(recovery.attemptsLeft()).toBe(2);
  });

  it('says nothing about a successful request that carried no token', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200)));
    const recovery = createSessionRecovery({ signIn: loginFailing(), maxAttempts: 1 });
    const wired = transports(fetchImpl, { recovery });

    await recovery.credentialRefused();
    await wired.http.getJson('/v1/dramas/drm_1');

    expect(recovery.attemptsLeft()).toBe(0);
  });
});
