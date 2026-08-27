import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  FIXTURE_NOW_MS,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../entitlement/fixtures.js';
import { TIKTOK_WEBHOOK_PATH } from '../platform-tiktok/routes.js';
import { buildApp } from '../../app.js';
import { computeWebhookSignature } from '../platform-tiktok/webhook-signature.js';
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { createFixtureTradeOrderPort } from './fixtures.js';
import { COIN_ORDERS_PATH } from './routes.js';
import { loadConfig } from '../../config.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';

/**
 * C3-06 acceptance item 4, for the one store this slice durably implements: an unlock granted, a
 * process restart, the episode still playable. The order store stays in memory, so it is new
 * after restart — the receipt is not, and playback reads the receipt.
 */

const SECRET = 'client-secret-for-tests';
const CLIENT_KEY = 'awtest';
const NOW_SEC = FIXTURE_NOW_MS / 1000;
const BUYER = 'usr_fx_newcomer';
const EPISODE = 'ep_fx_s2e01';

const dirs: string[] = [];
let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app !== undefined) {
    await app.close();
    app = undefined;
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

async function start(sqlitePath: string): Promise<FastifyInstance> {
  const instance = await buildApp(
    { ...loadConfig({ DATABASE_URL: `sqlite:${sqlitePath}` }), logLevel: 'silent' },
    {
      platformCredentials: createPlatformCredentials(CLIENT_KEY, SECRET),
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      tradeOrderPort: createFixtureTradeOrderPort(),
      now: () => FIXTURE_NOW_MS,
    },
  );
  await instance.ready();
  app = instance;
  return instance;
}

describe('a sqlite unlock store survives a process restart', () => {
  it('lets the viewer play an episode they paid for after the process is replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-'));
    dirs.push(dir);
    const sqlitePath = join(dir, 'unlocks.sqlite');

    const first = await start(sqlitePath);
    const opened = await first.inject({
      method: 'POST',
      url: COIN_ORDERS_PATH,
      headers: {
        authorization: `Bearer ${fixtureViewerToken(BUYER)}`,
        'idempotency-key': `idem-${BUYER}-${EPISODE}`,
      },
      payload: { episodeId: EPISODE },
    });
    expect(opened.statusCode).toBe(201);
    const tradeOrderId = opened.json<{ payment: { tradeOrderId: string } }>().payment.tradeOrderId;

    const raw = JSON.stringify({
      client_key: CLIENT_KEY,
      event: 'minis.trade_order.redeem.success',
      create_time: NOW_SEC,
      user_openid: BUYER,
      content: JSON.stringify({ trade_order_id: tradeOrderId, is_sandbox: false }),
    });
    const signed = computeWebhookSignature(Buffer.from(raw, 'utf8'), SECRET, NOW_SEC);
    const paid = await first.inject({
      method: 'POST',
      url: TIKTOK_WEBHOOK_PATH,
      headers: {
        'content-type': 'application/json',
        'tiktok-signature': `t=${NOW_SEC},s=${signed}`,
      },
      payload: raw,
    });
    expect(paid.statusCode).toBe(200);

    const before = await first.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
      payload: { episodeId: EPISODE },
    });
    expect(before.statusCode).toBe(201);

    await first.close();
    app = undefined;

    const second = await start(sqlitePath);
    const after = await second.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
      payload: { episodeId: EPISODE },
    });
    expect(after.statusCode).toBe(201);
    expect(after.json()).toMatchObject({ albumId: 'drm_fx_revenge', episodeId: EPISODE });

    const access = await second.inject({
      method: 'POST',
      url: '/v1/entitlement/episode-access',
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
      payload: { episodeId: EPISODE },
    });
    expect(
      access.json<{ viewerAccess: { reason: string; unlockedBy: string } }>().viewerAccess,
    ).toEqual({ playable: true, reason: 'UNLOCKED', unlockedBy: 'COIN' });
  });

  it('refuses to start behind a postgres URL rather than serving a file', async () => {
    await expect(
      buildApp({
        ...loadConfig({ DATABASE_URL: 'postgres://localhost/minidrama' }),
        logLevel: 'silent',
      }),
    ).rejects.toThrow(/scheme "postgres"/);
  });
});
