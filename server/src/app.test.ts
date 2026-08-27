import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  FIXTURE_NOW_MS,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
} from './modules/entitlement/fixtures.js';
import { buildApp } from './app.js';
import { createFixturePlaybackMediaPort } from './modules/playback/fixtures.js';
import { loadConfig } from './config.js';

/**
 * `app` is the assembled application with nothing injected — what a deployment gets. Every port
 * that reads content or viewer state defaults to refusing, so the endpoints that depend on them
 * answer `503` here. `wiredApp` supplies the fixture world so the success paths are still asserted
 * at the app level; the exhaustive per-endpoint cases live with their modules.
 */

let app: FastifyInstance;
let wiredApp: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  wiredApp = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      now: () => FIXTURE_NOW_MS,
    },
  );

  await Promise.all([app.ready(), wiredApp.ready()]);
});

afterAll(async () => {
  await Promise.all([app.close(), wiredApp.close()]);
});

describe('GET /health', () => {
  it('reports the service as healthy', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'minidrama-api' });
  });
});

describe('unknown routes', () => {
  it('answers with the standard error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ error: { code: string; traceId: string } }>();
    expect(body.error.code).toBe('COMMON_RESOURCE_NOT_FOUND');
    expect(body.error.traceId).toMatch(/^req_/);
  });
});

describe('POST /v1/playback/sessions', () => {
  it('rejects a request without an episodeId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  // With no data layer the entitlement facts port refuses, and playback denies rather than
  // guessing. Both guesses cost money: one gives paid episodes away, the other tells paying
  // viewers they own nothing.
  it('denies rather than guessing when nothing is wired', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_fx_s1e01' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_SERVICE_UNAVAILABLE',
    );
  });

  it('issues a playback descriptor for an entitled episode', async () => {
    const response = await wiredApp.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_fx_s1e01' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      albumId: 'drm_fx_revenge',
      episodeId: 'ep_fx_s1e01',
      vid: 'vid_fx_0001',
      resumePositionSec: 0,
    });
  });

  // Correction A4: playback authorization is identifier-based. A media URL in this response
  // would mean we had quietly rebuilt the self-hosted delivery path the platform forbids.
  it('never returns a media URL or a quality ladder', async () => {
    const response = await wiredApp.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_fx_s1e01' },
    });

    expect(response.body).not.toMatch(/https?:\/\//);
    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|definitions?"/i);
  });

  it('denies a locked episode with unlock context rather than a generic error', async () => {
    const response = await wiredApp.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      headers: { authorization: 'Bearer fxt_usr_fx_newcomer' },
      payload: { episodeId: 'ep_fx_s2e01' },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json<{ error: { code: string; details: { unlockOptions: string[] } } }>();
    expect(body.error.code).toBe('EPISODE_LOCKED');
    expect(body.error.details.unlockOptions).toContain('COINS');
  });
});

describe('POST /v1/unlock/coin-orders', () => {
  it('rejects a request without an episodeId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/unlock/coin-orders',
      headers: { 'idempotency-key': 'idem-1' },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  // Nothing is wired: the entitlement facts refuse, so no price can be quoted, and the trade-order
  // port refuses, so no payment could be attached to an order even if one could be priced.
  it('refuses to open an order when nothing is wired', async () => {
    const response = await wiredApp.inject({
      method: 'POST',
      url: '/v1/unlock/coin-orders',
      headers: { authorization: 'Bearer fxt_usr_fx_newcomer', 'idempotency-key': 'idem-1' },
      payload: { episodeId: 'ep_fx_s2e01' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CHANNEL_UNAVAILABLE',
    );
  });

  it('has no order to report for an id it never issued', async () => {
    const response = await wiredApp.inject({
      method: 'GET',
      url: '/v1/unlock/coin-orders/uord_nothing',
      headers: { authorization: 'Bearer fxt_usr_fx_newcomer' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('PAYMENT_ORDER_NOT_FOUND');
  });

  // The default app resolves coin orders against the store its own login route writes to, exactly as
  // the entitlement and playback endpoints do. A token nothing issued is the caller's problem — a
  // `401` answered by running silent login — and is never read as an anonymous browse that then gets
  // quoted a price. `modules/unlock/session-orders.test.ts` covers the resolved side.
  it.each([
    ['opening an order', 'POST' as const, '/v1/unlock/coin-orders'],
    ['reading one', 'GET' as const, '/v1/unlock/coin-orders/uord_nothing'],
  ])(
    'refuses a presented session when %s, rather than downgrading it',
    async (_case, method, url) => {
      const response = await app.inject({
        method,
        url,
        headers: { authorization: 'Bearer some-opaque-session-token', 'idempotency-key': 'idem-1' },
        ...(method === 'POST' ? { payload: { episodeId: 'ep_fx_s2e01' } } : {}),
      });

      expect(response.statusCode).toBe(401);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_REQUIRED');
    },
  );
});
