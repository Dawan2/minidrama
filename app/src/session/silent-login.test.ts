import { describe, expect, it, vi } from 'vitest';
import { bridgeError, err, ok } from '@minidrama/shared';
import type { BridgeErrorCode, Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import { createSessionStore } from './session-store';
import { createSilentLogin, runSilentLogin } from './silent-login';
import type { ApiFailure } from '../data/failure';
import type { SessionApi } from '../data/session-api';
import type { SessionGrant, SessionStore } from './session-store';
import type { SilentLoginDeps } from './silent-login';

const GRANT: SessionGrant = { accessToken: 'tok_abc', expiresInSec: 3_600, openId: 'open_abc' };

/** A bridge narrowed to what silent login is allowed to touch. */
function bridgeAnswering(
  login: () => Promise<Result<{ readonly authCode: string }, ReturnType<typeof bridgeError>>>,
  canIUse = true,
): SilentLoginDeps['bridge'] {
  return { canIUse: () => canIUse, login };
}

function bridgeSigningIn(authCode = 'code_123'): SilentLoginDeps['bridge'] {
  return bridgeAnswering(() => Promise.resolve(ok({ authCode })));
}

function apiAnswering(result: Result<SessionGrant, ApiFailure>): SessionApi {
  return { exchangeAuthCode: vi.fn(() => Promise.resolve(result)) };
}

function refusedApi(failure: ApiFailure): SessionApi {
  return apiAnswering(err(failure));
}

function deps(overrides: Partial<SilentLoginDeps> = {}): SilentLoginDeps & { store: SessionStore } {
  return {
    bridge: bridgeSigningIn(),
    api: apiAnswering(ok(GRANT)),
    store: createSessionStore(),
    ...overrides,
  };
}

describe('silent login succeeding', () => {
  it('exchanges the bridge code and puts the session in the store', async () => {
    const scope = deps();

    const result = await runSilentLogin(scope);

    expect(result.outcome).toBe('SIGNED_IN');
    expect(scope.api.exchangeAuthCode).toHaveBeenCalledWith('code_123');
    expect(scope.store.bearerToken()).toBe('tok_abc');
  });

  // The code is single-use and the store already holds a live token: spending another one to learn
  // what we know would also invite the second exchange to fail and be reported as a rejection.
  it('does not spend a code when a session is already held', async () => {
    const scope = deps();
    scope.store.adopt(GRANT);

    const result = await runSilentLogin(scope);

    expect(result.outcome).toBe('ALREADY_SIGNED_IN');
    expect(scope.api.exchangeAuthCode).not.toHaveBeenCalled();
  });
});

/**
 * Every one of these ends signed out, which is the point. There is no fallback identity, no cached
 * `openId` and no locally minted token — a request that should carry a session and cannot goes out
 * anonymous and is answered `401`, which the unlock panel renders as `SIGN_IN_REQUIRED`.
 */
describe('silent login failing', () => {
  it('does not call login on a client that lacks the capability', async () => {
    const login = vi.fn(() => Promise.resolve(ok({ authCode: 'code_123' })));
    const scope = deps({ bridge: bridgeAnswering(login, false) });

    const result = await runSilentLogin(scope);

    expect(result.outcome).toBe('PLATFORM_UNAVAILABLE');
    expect(login).not.toHaveBeenCalled();
    expect(scope.store.bearerToken()).toBeNull();
  });

  it('separates a platform that cannot log in from one that would not', async () => {
    const cases: readonly [BridgeErrorCode, string][] = [
      ['BRIDGE_UNSUPPORTED', 'PLATFORM_UNAVAILABLE'],
      ['BRIDGE_NOT_READY', 'PLATFORM_UNAVAILABLE'],
      ['BRIDGE_USER_CANCELLED', 'PLATFORM_REFUSED'],
      ['BRIDGE_TIMEOUT', 'PLATFORM_REFUSED'],
      ['BRIDGE_UNKNOWN', 'PLATFORM_REFUSED'],
    ];

    for (const [code, outcome] of cases) {
      const scope = deps({
        bridge: bridgeAnswering(() => Promise.resolve(err(bridgeError(code, 'no')))),
      });
      const result = await runSilentLogin(scope);

      expect(result.outcome, code).toBe(outcome);
      expect(scope.store.bearerToken(), code).toBeNull();
    }
  });

  it('reports a code the server refused', async () => {
    const scope = deps({
      api: refusedApi(
        apiFailure({ kind: 'HTTP', status: 401, code: 'AUTH_REQUIRED', message: 'rejected' }),
      ),
    });

    const result = await runSilentLogin(scope);

    expect(result.outcome).toBe('CODE_REJECTED');
    // The failure travels for the log, not for a screen: it carries the status and the trace id.
    expect(result.failure).toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
    expect(scope.store.bearerToken()).toBeNull();
  });

  /**
   * `502 AUTH_PROVIDER_ERROR` is ours to fix, and to the viewer it is indistinguishable from a dead
   * network: neither is their fault and neither is answered by asking them to do anything.
   */
  it('groups a provider fault and a dead network as unreachable', async () => {
    const cases: readonly [ApiFailure, string][] = [
      [apiFailure({ kind: 'OFFLINE', message: 'no network' }), 'UNREACHABLE'],
      [apiFailure({ kind: 'TIMEOUT', message: 'too slow' }), 'UNREACHABLE'],
      [
        apiFailure({
          kind: 'HTTP',
          status: 502,
          code: 'AUTH_PROVIDER_ERROR',
          message: 'provider down',
        }),
        'UNREACHABLE',
      ],
      [apiFailure({ kind: 'HTTP', status: 503, message: 'unavailable' }), 'UNREACHABLE'],
      [apiFailure({ kind: 'MALFORMED', message: 'not json' }), 'UNREACHABLE'],
      [apiFailure({ kind: 'HTTP', status: 400, message: 'bad provider' }), 'CODE_REJECTED'],
    ];

    for (const [failure, outcome] of cases) {
      const result = await runSilentLogin(deps({ api: refusedApi(failure) }));
      expect(result.outcome, failure.message).toBe(outcome);
    }
  });

  /**
   * The one case where the client is the last line of defence: the mock bridge hands out a
   * placeholder code in browser development, and the answer must still come from the server. A
   * refused exchange leaves the app signed out rather than pretending in dev what it cannot do in
   * production.
   */
  it('never synthesises a session when the exchange fails', async () => {
    const scope = deps({
      bridge: bridgeSigningIn('mock-auth-code'),
      api: refusedApi(apiFailure({ kind: 'HTTP', status: 502, message: 'not configured' })),
    });

    await runSilentLogin(scope);

    expect(scope.store.bearerToken()).toBeNull();
    expect(scope.store.session()).toBeNull();
  });

  it('reports a grant the store would not accept', async () => {
    const scope = deps({ api: apiAnswering(ok({ ...GRANT, accessToken: 'two words' })) });

    const result = await runSilentLogin(scope);

    expect(result).toMatchObject({ outcome: 'SESSION_UNUSABLE', rejection: 'UNUSABLE_TOKEN' });
    expect(scope.store.bearerToken()).toBeNull();
  });
});

/**
 * The `authCode` is single-use, so two concurrent logins spend two codes and the second exchange
 * fails — which would then be reported as "the platform rejected you". Callers share one attempt
 * instead.
 */
describe('the single-flight wrapper', () => {
  it('runs one exchange for concurrent callers', async () => {
    const scope = deps();
    const signIn = createSilentLogin(scope);

    const results = await Promise.all([signIn(), signIn(), signIn()]);

    expect(scope.api.exchangeAuthCode).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.outcome)).toEqual([
      'SIGNED_IN',
      'SIGNED_IN',
      'SIGNED_IN',
    ]);
  });

  it('lets a later caller try again once the first attempt has settled', async () => {
    const scope = deps({
      api: refusedApi(apiFailure({ kind: 'OFFLINE', message: 'no network' })),
    });
    const signIn = createSilentLogin(scope);

    expect((await signIn()).outcome).toBe('UNREACHABLE');
    expect((await signIn()).outcome).toBe('UNREACHABLE');
    expect(scope.api.exchangeAuthCode).toHaveBeenCalledTimes(2);
  });

  it('answers from the store once signed in, without another exchange', async () => {
    const scope = deps();
    const signIn = createSilentLogin(scope);

    await signIn();
    expect((await signIn()).outcome).toBe('ALREADY_SIGNED_IN');
    expect(scope.api.exchangeAuthCode).toHaveBeenCalledTimes(1);
  });
});
