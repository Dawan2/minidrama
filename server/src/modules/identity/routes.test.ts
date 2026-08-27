import { afterEach, describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { FIXTURE_NOW_MS, createFixtureEntitlementFactsPort } from '../entitlement/fixtures.js';
import { TEST_LOGIN_ENABLE_VALUE, mockAuthCode } from './test-login.js';
import { buildApp } from '../../app.js';
import { createInMemorySessionStore } from './session-store.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';
import { createTiktokIdentityPort } from '../platform-tiktok/identity-port.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';
import type { PlatformIdentityPort } from '../platform-tiktok/identity-port.js';

/**
 * Silent login: the contract, the validation, the deny path — and, since W3 slot L, what the issued
 * token is bound to.
 *
 * The real exchange is still not implemented, and the first test below is still the one that
 * matters: an unimplemented credential exchange must refuse, because a stub that synthesised an
 * `open_id` would be an authentication bypass with a green test suite above it. What the slot adds is
 * a session that can be resolved back to a user, and one gated non-production path that can produce
 * one — neither of which weakens that refusal, as the last block asserts.
 */

let app: FastifyInstance;

async function startApp(
  dependencies: AppDependencies = {},
  env: NodeJS.ProcessEnv = {},
): Promise<void> {
  app = await buildApp({ ...loadConfig(env), logLevel: 'silent' }, dependencies);
  await app.ready();
}

function login(payload: unknown) {
  return app.inject({ method: 'POST', url: '/v1/auth/login', payload: payload as object });
}

afterEach(async () => {
  await app.close();
});

describe('POST /v1/auth/login — with no working platform exchange', () => {
  it('refuses to issue a session when no credentials are configured', async () => {
    await startApp({ platformCredentials: createPlatformCredentials('', '') });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_PROVIDER_ERROR');
    expect(response.body).not.toContain('accessToken');
  });

  it('still refuses when credentials exist but the exchange is not built', async () => {
    await startApp({ platformCredentials: createPlatformCredentials('awtest', 'secret') });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_PROVIDER_ERROR');
  });

  it('does not tell the caller which of the two applies', async () => {
    await startApp({ platformCredentials: createPlatformCredentials('', '') });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.body).not.toContain('UNCONFIGURED');
    expect(response.body).not.toContain('UNAVAILABLE');
  });
});

describe('POST /v1/auth/login — validation', () => {
  it('rejects a request with no provider', async () => {
    await startApp();

    const response = await login({ authCode: 'code_abc' });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  // The contract reserves PHONE/WECHAT/DEVICE for other clients. Reserved is not enabled.
  it.each(['PHONE', 'WECHAT', 'DEVICE', 'tiktok'])('rejects the provider %s', async (provider) => {
    await startApp();

    const response = await login({ provider, authCode: 'code_abc' });

    expect(response.statusCode).toBe(400);
    expect(
      response.json<{ error: { details: { fields: { reason: string }[] } } }>().error.details
        .fields[0]?.reason,
    ).toBe('unsupported');
  });

  it('rejects a missing or empty authCode', async () => {
    await startApp();

    expect((await login({ provider: 'TIKTOK' })).statusCode).toBe(400);
    expect((await login({ provider: 'TIKTOK', authCode: '' })).statusCode).toBe(400);
    expect((await login({ provider: 'TIKTOK', authCode: 42 })).statusCode).toBe(400);
  });

  it('validates before it reaches the platform, so a bad request spends no exchange', async () => {
    let calls = 0;
    const countingPort: PlatformIdentityPort = {
      exchangeAuthCode: async () => {
        calls += 1;
        return err('AUTH_CODE_REJECTED');
      },
    };
    await startApp({ identityPort: countingPort });

    await login({ provider: 'PHONE', authCode: 'code_abc' });

    expect(calls).toBe(0);
  });
});

describe('POST /v1/auth/login — against a port that answers', () => {
  const succeedingPort: PlatformIdentityPort = {
    exchangeAuthCode: async () => ok({ openId: 'open_abc' }),
  };

  it('issues a session for an accepted code', async () => {
    await startApp({ identityPort: succeedingPort });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ openId: string; expiresInSec: number }>()).toMatchObject({
      openId: 'open_abc',
      expiresInSec: 3600,
    });
  });

  // The code is a single-use credential. Echoing it would put it in the client's logs and in any
  // proxy between us.
  it('never echoes the authorization code', async () => {
    await startApp({ identityPort: succeedingPort });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_secret_value' });

    expect(response.body).not.toContain('code_secret_value');
  });

  it('answers 401 when the platform rejects the code, so the client can retry silent login', async () => {
    await startApp({
      identityPort: { exchangeAuthCode: async () => err('AUTH_CODE_REJECTED') },
    });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_expired' });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_REQUIRED');
  });

  it('answers 502 when the platform itself is unavailable, so it is paged rather than retried', async () => {
    await startApp({
      identityPort: { exchangeAuthCode: async () => err('PROVIDER_UNAVAILABLE') },
    });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.statusCode).toBe(502);
  });

  it('returns no platform token of any kind to the client', async () => {
    await startApp({ identityPort: succeedingPort });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.body).not.toMatch(/refresh_token|refreshToken|access_token/);
    expect(Object.keys(response.json<Record<string, unknown>>()).sort()).toEqual([
      'accessToken',
      'expiresInSec',
      'openId',
    ]);
  });
});

describe('POST /v1/auth/login — the session it issues is bound to a user', () => {
  const succeedingPort: PlatformIdentityPort = {
    exchangeAuthCode: async () => ok({ openId: 'usr_fx_vip_active' }),
  };

  it('binds the issued token to the user the exchange named', async () => {
    const sessionStore = createInMemorySessionStore();
    await startApp({ identityPort: succeedingPort, sessionStore });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });
    const { accessToken } = response.json<{ accessToken: string }>();

    expect(sessionStore.resolve(accessToken)).toEqual({ ok: true, value: 'usr_fx_vip_active' });
  });

  it('issues one session per login rather than reusing one', async () => {
    const sessionStore = createInMemorySessionStore();
    await startApp({ identityPort: succeedingPort, sessionStore });

    const first = await login({ provider: 'TIKTOK', authCode: 'code_one' });
    const second = await login({ provider: 'TIKTOK', authCode: 'code_two' });

    expect(first.json<{ accessToken: string }>().accessToken).not.toBe(
      second.json<{ accessToken: string }>().accessToken,
    );
    expect(sessionStore.liveSessions).toBe(2);
  });

  // The token is a credential, and the store is keyed by a fingerprint of it. Neither the user id
  // nor anything else recoverable belongs inside the token itself.
  it('does not put the user id in the token', async () => {
    await startApp({ identityPort: succeedingPort });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.json<{ accessToken: string }>().accessToken).not.toContain('usr_fx_vip_active');
  });

  // An exchange that succeeds without naming a user is not a login. Binding a session to nobody
  // would give every such caller the same phantom account.
  it('refuses an exchange that returns an empty open_id, and stores nothing', async () => {
    const sessionStore = createInMemorySessionStore();
    await startApp({
      identityPort: { exchangeAuthCode: async () => ok({ openId: '' }) },
      sessionStore,
    });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });

    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_PROVIDER_ERROR');
    expect(sessionStore.liveSessions).toBe(0);
  });

  it('stores nothing for a rejected code', async () => {
    const sessionStore = createInMemorySessionStore();
    await startApp({
      identityPort: { exchangeAuthCode: async () => err('AUTH_CODE_REJECTED') },
      sessionStore,
    });

    await login({ provider: 'TIKTOK', authCode: 'code_expired' });

    expect(sessionStore.liveSessions).toBe(0);
  });

  it('stores nothing for a request that fails validation', async () => {
    const sessionStore = createInMemorySessionStore();
    await startApp({ identityPort: succeedingPort, sessionStore });

    await login({ provider: 'PHONE', authCode: 'code_abc' });
    await login({ provider: 'TIKTOK' });

    expect(sessionStore.liveSessions).toBe(0);
  });
});

/**
 * The point of the whole slot: a token this endpoint issued is a token the rest of the server can
 * resolve to a viewer. `POST /v1/entitlement/episode-access` is the endpoint used to prove it
 * because it exists today and answers differently for two known fixture viewers; watch progress and
 * favorites read the same `ViewerResolver` and inherit the behaviour.
 *
 * The viewer resolver is deliberately **not** injected here — the app under test resolves sessions
 * with the store its own login route wrote to, which is the wiring that was missing.
 */
describe('a session issued by login resolves a viewer at another endpoint', () => {
  async function startWiredApp(openId: string): Promise<string> {
    await startApp({
      identityPort: { exchangeAuthCode: async () => ok({ openId }) },
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      now: () => FIXTURE_NOW_MS,
    });

    const response = await login({ provider: 'TIKTOK', authCode: 'code_abc' });
    expect(response.statusCode).toBe(200);

    return response.json<{ accessToken: string }>().accessToken;
  }

  function askAccess(episodeId: string, accessToken?: string) {
    return app.inject({
      method: 'POST',
      url: '/v1/entitlement/episode-access',
      ...(accessToken === undefined ? {} : { headers: { authorization: `Bearer ${accessToken}` } }),
      payload: { episodeId },
    });
  }

  interface AccessBody {
    readonly viewerAccess: { readonly playable: boolean; readonly unlockedBy: string | null };
  }

  it('answers a live subscriber as the subscriber they are', async () => {
    const accessToken = await startWiredApp('usr_fx_vip_active');

    const response = await askAccess('ep_fx_s2e01', accessToken);

    expect(response.statusCode).toBe(200);
    expect(response.json<AccessBody>().viewerAccess).toMatchObject({
      playable: true,
      unlockedBy: 'VIP',
    });
  });

  // The same episode, the same request, a different session: the answer must follow the session.
  it('answers a newcomer as a newcomer', async () => {
    const accessToken = await startWiredApp('usr_fx_newcomer');

    const response = await askAccess('ep_fx_s2e01', accessToken);

    expect(response.statusCode).toBe(200);
    expect(response.json<AccessBody>().viewerAccess.playable).toBe(false);
  });

  it('still answers an anonymous caller as anonymous', async () => {
    await startWiredApp('usr_fx_vip_active');

    const response = await askAccess('ep_fx_s2e01');

    expect(response.statusCode).toBe(200);
    expect(response.json<AccessBody>().viewerAccess.playable).toBe(false);
  });

  // A token from another deployment, another restart, or an attacker's imagination is a 401 the
  // client answers by running silent login again — never an anonymous read.
  it('refuses a token it did not issue rather than reading it as anonymous', async () => {
    await startWiredApp('usr_fx_vip_active');

    const response = await askAccess('ep_fx_s2e01', 'not-a-session-we-issued');

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_REQUIRED');
  });

  it('stops resolving a viewer once the session has expired', async () => {
    let nowMs = FIXTURE_NOW_MS;
    const sessionStore = createInMemorySessionStore({ ttlSec: 3600, now: () => nowMs });
    await startApp({
      identityPort: { exchangeAuthCode: async () => ok({ openId: 'usr_fx_vip_active' }) },
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      sessionStore,
      now: () => FIXTURE_NOW_MS,
    });

    const { accessToken } = (await login({ provider: 'TIKTOK', authCode: 'code_abc' })).json<{
      accessToken: string;
    }>();
    expect((await askAccess('ep_fx_s2e01', accessToken)).statusCode).toBe(200);

    nowMs += 3600 * 1000 + 1;

    const response = await askAccess('ep_fx_s2e01', accessToken);
    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_REQUIRED');
  });
});

/**
 * The mock login path. Two things are asserted: that it works when it is deliberately enabled, and
 * that nothing short of deliberately enabling it turns it on.
 */
describe('POST /v1/auth/login — the mock path', () => {
  const enabled = { MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE, NODE_ENV: 'test' };

  it('issues a session bound to the user the mock code names', async () => {
    const sessionStore = createInMemorySessionStore();
    await startApp({ sessionStore }, enabled);

    const response = await login({
      provider: 'TIKTOK',
      authCode: mockAuthCode('usr_fx_vip_active'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ accessToken: string; openId: string }>();
    expect(body.openId).toBe('usr_fx_vip_active');
    expect(sessionStore.resolve(body.accessToken)).toEqual({
      ok: true,
      value: 'usr_fx_vip_active',
    });
  });

  it('goes through the same validation as the real path', async () => {
    await startApp({}, enabled);

    expect((await login({ provider: 'PHONE', authCode: mockAuthCode('usr_abc') })).statusCode).toBe(
      400,
    );
    expect((await login({ provider: 'TIKTOK', authCode: '' })).statusCode).toBe(400);
  });

  // Enabled is not the same as open. A real TikTok authorization code is still refused, so a client
  // pointed at a mock deployment by mistake does not silently log in.
  it('refuses a code that is not a mock code, even while enabled', async () => {
    await startApp({}, enabled);

    const response = await login({ provider: 'TIKTOK', authCode: 'act.real_looking_code' });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_REQUIRED');
  });

  it.each([
    ['nothing set', {}],
    ['the flag alone', { MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE }],
    [
      'the flag in production',
      { MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE, NODE_ENV: 'production' },
    ],
    ['a truthy flag value', { MINIDRAMA_TEST_LOGIN: 'true', NODE_ENV: 'test' }],
    ['a test environment alone', { NODE_ENV: 'test' }],
  ])('refuses a mock code with %s, and issues nothing', async (_label, env) => {
    const sessionStore = createInMemorySessionStore();
    await startApp(
      { sessionStore, platformCredentials: createPlatformCredentials('awtest', 'secret') },
      env,
    );

    const response = await login({
      provider: 'TIKTOK',
      authCode: mockAuthCode('usr_fx_vip_active'),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_PROVIDER_ERROR');
    expect(sessionStore.liveSessions).toBe(0);
  });
});

describe('createTiktokIdentityPort', () => {
  it('distinguishes a deployment with no credentials from an unbuilt exchange', async () => {
    const withoutSecret = createTiktokIdentityPort(createPlatformCredentials('awtest', ''));
    const withSecret = createTiktokIdentityPort(createPlatformCredentials('awtest', 'secret'));

    expect(await withoutSecret.exchangeAuthCode('code')).toEqual({
      ok: false,
      error: 'PROVIDER_UNCONFIGURED',
    });
    expect(await withSecret.exchangeAuthCode('code')).toEqual({
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('refuses every code, including an empty one, rather than inventing an open_id', async () => {
    const port = createTiktokIdentityPort(createPlatformCredentials('awtest', 'secret'));

    for (const code of ['', 'code_abc', 'x'.repeat(500)]) {
      expect((await port.exchangeAuthCode(code)).ok).toBe(false);
    }
  });
});
