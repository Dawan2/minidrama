import { afterEach, describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';
import { createTiktokIdentityPort } from '../platform-tiktok/identity-port.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';
import type { PlatformIdentityPort } from '../platform-tiktok/identity-port.js';

/**
 * Silent login: the contract, the validation, and the deny path.
 *
 * The exchange itself is not implemented in this slot, and the first test below is the one that
 * matters — an unimplemented credential exchange must refuse, because a stub that synthesised an
 * `open_id` would be an authentication bypass with a green test suite above it.
 */

let app: FastifyInstance;

async function startApp(dependencies: AppDependencies = {}): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, dependencies);
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
