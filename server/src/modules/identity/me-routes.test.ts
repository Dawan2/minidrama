import { afterEach, describe, expect, it } from 'vitest';
import { ok } from '@minidrama/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { MeView } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createFakeSessionResolver } from '../progress/test-sessions.js';
import { createUnresolvedViewerResolver } from '../entitlement/viewer-resolver.js';
import { createInMemorySessionStore } from './session-store.js';
import { loadConfig } from '../../config.js';
import { ME_PATH } from './me-routes.js';
import { ME_VIEW_KEYS } from './me-view.js';
import type { AppDependencies } from '../../app.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * `GET /v1/users/me` over HTTP.
 *
 * The default deployment has no users table and no nickname store, so the assembled app answers
 * `200` with `{ id }` taken from the session and nothing else. That is the property the profile
 * card rests on: a missing nickname is not the id, and a missing VIP object is not "not subscribed".
 */

let app: FastifyInstance;

async function startApp(dependencies: AppDependencies = {}): Promise<void> {
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      viewerResolver: createFakeSessionResolver(),
      ...dependencies,
    },
  );
  await app.ready();
}

async function startDeployedApp(dependencies: AppDependencies = {}): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, dependencies);
  await app.ready();
}

function get(token?: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: ME_PATH,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

function bodyKeys(response: LightMyRequestResponse): readonly string[] {
  return Object.keys(response.json<Record<string, unknown>>());
}

afterEach(async () => {
  await app.close();
});

describe('GET /v1/users/me — without a resolvable viewer', () => {
  it('refuses with the app as deployed today, which issues no session to this token', async () => {
    await startDeployedApp();

    const response = await get('tok_a');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('refuses a request that carries no credential', async () => {
    await startApp();

    const response = await get();

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
    expect(response.body).not.toMatch(/"id"|nickname|avatarUrl|vip/);
  });

  it('refuses a forged token the same way, and does not say which problem it hit', async () => {
    await startApp();

    const noToken = await get();
    const badToken = await get('tok_forged');

    expect(badToken.statusCode).toBe(401);
    expect(errorCode(noToken)).toBe(errorCode(badToken));
    for (const body of [noToken.body, badToken.body]) {
      expect(body).not.toMatch(/NO_CREDENTIAL|SESSION_REJECTED|SESSION_UNRESOLVABLE/);
    }
  });

  it('answers 503 when sessions cannot be resolved, not a guessed profile', async () => {
    await startApp({ viewerResolver: createUnresolvedViewerResolver() });

    const response = await get('tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/"id"|nickname|vip|beansAmount/);
  });

  it('answers 503 when a resolver hands back an empty user id, not a guest profile', async () => {
    const emptyId: ViewerResolver = {
      resolve: (authorization) => {
        if (authorization === undefined) return ok(null);
        return ok('');
      },
    };
    await startApp({ viewerResolver: emptyId });

    const response = await get('tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/"id":""/);
  });
});

describe('GET /v1/users/me — signed in, session identity only', () => {
  it('answers 200 with the session user id and the profile fields omitted', async () => {
    await startApp();

    const response = await get('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<MeView>()).toEqual({ id: 'user_a' });
    expect(response.json<MeView>().nickname).toBeUndefined();
    expect(response.json<MeView>().avatarUrl).toBeUndefined();
  });

  it('takes the id from the session the login route issued, not from a second identifier space', async () => {
    const sessionStore = createInMemorySessionStore();
    await startDeployedApp({
      sessionStore,
      identityPort: { exchangeAuthCode: async () => ok({ openId: 'open_abc' }) },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { provider: 'TIKTOK', authCode: 'code_abc' },
    });
    const { accessToken, openId } = login.json<{ accessToken: string; openId: string }>();

    const response = await app.inject({
      method: 'GET',
      url: ME_PATH,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(login.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.json<MeView>()).toEqual({ id: openId });
    expect(openId).toBe('open_abc');
  });

  it('sends Cache-Control: private, no-store, including on the refusal', async () => {
    await startApp();

    expect((await get('tok_a')).headers['cache-control']).toBe('private, no-store');
    expect((await get()).headers['cache-control']).toBe('private, no-store');
  });

  it("does not leak one viewer's id to another", async () => {
    await startApp();

    expect((await get('tok_a')).json<MeView>().id).toBe('user_a');
    expect((await get('tok_b')).json<MeView>().id).toBe('user_b');
  });
});

describe('GET /v1/users/me — the body is identity, not VIP or Beans', () => {
  it('carries only MeView keys', async () => {
    await startApp();

    const response = await get('tok_a');
    const keys = bodyKeys(response);

    expect(keys.every((key) => (ME_VIEW_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(keys).toEqual(['id']);
    expect(JSON.stringify(response.json())).not.toMatch(
      /vip|expiresAt|expiry|beans|amountCents|currency|USD|fiat|phoneMasked|phone/i,
    );
  });

  /**
   * A source scan, not a typecheck. Adding `vip: { active: false }` to the route would still
   * typecheck against a widened send; this is the check that fails when somebody writes the
   * subscription C4-07 forbids, or the rate C3-09 forbids.
   */
  it('names no VIP, expiry, Beans rate or phone in the me module, outside comments', () => {
    const moduleDir = fileURLToPath(new URL('.', import.meta.url));
    const files = ['me-routes.ts', 'me-view.ts'];
    const forbidden =
      /\b(vipActive|expiresAt|beansPerCoin|coinToBeans|BEANS_RATE|beansRate|phoneMasked)\b/;
    const offenders: string[] = [];

    for (const file of files) {
      readFileSync(join(moduleDir, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const trimmed = line.trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return;
          }
          if (forbidden.test(line)) {
            offenders.push(`${file}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
