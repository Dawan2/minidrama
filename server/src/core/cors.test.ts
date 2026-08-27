import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  FIXTURE_NOW_MS,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../modules/entitlement/fixtures.js';
import { COIN_ORDERS_PATH } from '../modules/unlock/routes.js';
import { TIKTOK_WEBHOOK_PATH } from '../modules/platform-tiktok/routes.js';
import { buildApp } from '../app.js';
import { createCountingTradeOrderPort } from '../modules/unlock/fixtures.js';
import { loadConfig } from '../config.js';
import type { CountingTradeOrderPort } from '../modules/unlock/fixtures.js';

/**
 * Cross-origin access control through the real stack.
 *
 * The unit tests decide the policy; these say what a browser and a refused caller actually get from
 * the assembled server. Three of them are the reason the file exists:
 *
 *   - a refused cross-origin `POST` must not reach the handler. The browser withholding the
 *     *response* is not protection for a request that has already opened a payment, so the
 *     assertion is `tradeOrders.requests` being empty, not the shape of the body;
 *   - the payment callback carries no `Origin`, and must still be answered. A CORS rule that
 *     refuses server-to-server traffic is a payment outage with a security rationale;
 *   - `CORS_ALLOWED_ORIGINS=*` must not produce a working wildcard. It is the configuration a
 *     hurried deployment reaches for when the client cannot connect.
 */

const APP_ORIGIN = 'https://webview.example.invalid';
const OTHER_ORIGIN = 'https://ops.example.invalid';
const HOSTILE_ORIGIN = 'https://evil.example';
const BUYER = 'usr_fx_newcomer';
const COIN_EPISODE = 'ep_fx_s2e07';

let app: FastifyInstance;
let tradeOrders: CountingTradeOrderPort;

async function startApp(allowedOrigins: string): Promise<FastifyInstance> {
  tradeOrders = createCountingTradeOrderPort();

  app = await buildApp(
    { ...loadConfig({ CORS_ALLOWED_ORIGINS: allowedOrigins }), logLevel: 'silent' },
    {
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      tradeOrderPort: tradeOrders,
      now: () => FIXTURE_NOW_MS,
    },
  );
  await app.ready();

  return app;
}

afterEach(async () => {
  await app.close();
});

function createOrder(origin: string | undefined) {
  return app.inject({
    method: 'POST',
    url: COIN_ORDERS_PATH,
    headers: {
      ...(origin === undefined ? {} : { origin }),
      authorization: `Bearer ${fixtureViewerToken(BUYER)}`,
      'idempotency-key': 'idem-cors-1',
    },
    payload: { episodeId: COIN_EPISODE },
  });
}

describe('an allowed origin', () => {
  it('is named back to the browser, one origin at a time', async () => {
    await startApp(`${APP_ORIGIN},${OTHER_ORIGIN}`);

    for (const origin of [APP_ORIGIN, OTHER_ORIGIN]) {
      const response = await app.inject({ method: 'GET', url: '/health', headers: { origin } });

      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('reaches the handler and gets the real answer', async () => {
    await startApp(APP_ORIGIN);

    const response = await createOrder(APP_ORIGIN);

    expect(response.statusCode).toBe(201);
    expect(response.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(tradeOrders.requests).toHaveLength(1);
  });

  // A denial the client cannot read is a support ticket. The error envelope carries the trace id,
  // and it is only useful if the browser is allowed to hand it to the app.
  it('is allowed to read a failure, not only a success', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'POST',
      url: COIN_ORDERS_PATH,
      headers: { origin: APP_ORIGIN, 'idempotency-key': 'idem-cors-2' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
  });

  it('is never offered credentials', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: APP_ORIGIN },
    });

    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('a denied origin', () => {
  it('is refused with the standard envelope and no CORS header', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: HOSTILE_ORIGIN },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    const body = response.json<{ error: { code: string; traceId: string } }>();
    expect(body.error.code).toBe('COMMON_ORIGIN_NOT_ALLOWED');
    expect(body.error.traceId).toMatch(/^req_/);
  });

  // The whole point of refusing rather than staying silent: a "simple" cross-origin POST is sent
  // before the browser checks anything, so a policy that only omits headers has already let the
  // payment be opened by the time it takes effect.
  it('opens no payment, because the handler never runs', async () => {
    await startApp(APP_ORIGIN);

    const response = await createOrder(HOSTILE_ORIGIN);

    expect(response.statusCode).toBe(403);
    expect(tradeOrders.requests).toEqual([]);
  });

  it('cannot tell a real path from an absent one', async () => {
    await startApp(APP_ORIGIN);

    const [known, unknown] = await Promise.all([
      app.inject({ method: 'GET', url: '/health', headers: { origin: HOSTILE_ORIGIN } }),
      app.inject({ method: 'GET', url: '/nope', headers: { origin: HOSTILE_ORIGIN } }),
    ]);

    expect(known.statusCode).toBe(403);
    expect(unknown.statusCode).toBe(403);
    expect(unknown.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_ORIGIN_NOT_ALLOWED',
    );
  });

  it('is refused when no allowlist is configured at all', async () => {
    await startApp('');

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: APP_ORIGIN },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each(['*', 'https://*.example.invalid'])(
    'is not rescued by the wildcard configuration %o',
    async (configured) => {
      await startApp(configured);

      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: APP_ORIGIN },
      });

      expect(response.statusCode).toBe(403);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    },
  );

  it('is refused when the header is not an origin the server can read', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'null' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('the OPTIONS preflight', () => {
  it('is answered by the server, since no route declares OPTIONS', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'OPTIONS',
      url: COIN_ORDERS_PATH,
      headers: {
        origin: APP_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,idempotency-key',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(response.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(response.headers['access-control-allow-headers']).toContain('idempotency-key');
    expect(response.headers['access-control-max-age']).toBe('600');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('opens no payment of its own', async () => {
    await startApp(APP_ORIGIN);

    await app.inject({
      method: 'OPTIONS',
      url: COIN_ORDERS_PATH,
      headers: { origin: APP_ORIGIN, 'access-control-request-method': 'POST' },
    });

    expect(tradeOrders.requests).toEqual([]);
  });

  it('is refused from an origin that is not allowed', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'OPTIONS',
      url: COIN_ORDERS_PATH,
      headers: {
        origin: HOSTILE_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('is refused for a method no route implements', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'OPTIONS',
      url: COIN_ORDERS_PATH,
      headers: { origin: APP_ORIGIN, 'access-control-request-method': 'DELETE' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('is refused for a request header this API does not accept', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'OPTIONS',
      url: COIN_ORDERS_PATH,
      headers: {
        origin: APP_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-internal-actor',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-headers']).toBeUndefined();
  });

  // It answers for a path that does not exist, and that is deliberate: routing has not happened
  // yet. The browser learns nothing from it — the request it then sends gets the 404 it deserves.
  it('answers for an unknown path without confirming anything about it', async () => {
    await startApp(APP_ORIGIN);

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/does-not-exist',
      headers: { origin: APP_ORIGIN, 'access-control-request-method': 'POST' },
    });
    const actual = await app.inject({
      method: 'POST',
      url: '/v1/does-not-exist',
      headers: { origin: APP_ORIGIN },
      payload: {},
    });

    expect(preflight.statusCode).toBe(204);
    expect(actual.statusCode).toBe(404);
  });
});

describe('requests no browser sent', () => {
  // The TikTok payment callback is server-to-server and carries no Origin. It must be answered on
  // its own terms — here, refused for its missing signature, which is a different refusal.
  it('lets the payment callback through to its signature check', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'POST',
      url: TIKTOK_WEBHOOK_PATH,
      payload: JSON.stringify({ event: 'redeem.success' }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CALLBACK_INVALID_SIGN',
    );
  });

  it('answers a request with no Origin header without CORS headers', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('lets the API call itself, without needing to be on its own allowlist', async () => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'api.internal.test', origin: 'http://api.internal.test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('caching', () => {
  // Every response here depends on the Origin header, including the ones that carried none. A
  // shared cache that does not know that will hand one origin's response to another.
  it.each([
    ['an allowed origin', APP_ORIGIN],
    ['a refused origin', HOSTILE_ORIGIN],
    ['no origin at all', undefined],
  ])('varies on Origin for %s', async (_label, origin) => {
    await startApp(APP_ORIGIN);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: origin === undefined ? {} : { origin },
    });

    expect(String(response.headers['vary'])).toMatch(/\bOrigin\b/);
  });
});
