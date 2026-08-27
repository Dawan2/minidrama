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
import { createFixtureTradeOrderPort } from './fixtures.js';
import { COIN_ORDERS_PATH } from './routes.js';
import { loadConfig } from '../../config.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';

/**
 * C3-06, the remaining payment store: a pending order, a process restart, the same order still
 * there so a late callback can still be matched. Unlock receipts, sessions, and webhook events
 * already survive this bounce on the same file.
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
      tradeOrderPort: createFixtureTradeOrderPort(),
      now: () => FIXTURE_NOW_MS,
    },
  );
  await instance.ready();
  app = instance;
  return instance;
}

function pay(instance: FastifyInstance, tradeOrderId: string) {
  const raw = JSON.stringify({
    client_key: CLIENT_KEY,
    event: 'minis.trade_order.redeem.success',
    create_time: NOW_SEC,
    user_openid: BUYER,
    content: JSON.stringify({ trade_order_id: tradeOrderId, is_sandbox: false }),
  });
  const signed = computeWebhookSignature(Buffer.from(raw, 'utf8'), SECRET, NOW_SEC);
  return instance.inject({
    method: 'POST',
    url: TIKTOK_WEBHOOK_PATH,
    headers: {
      'content-type': 'application/json',
      'tiktok-signature': `t=${NOW_SEC},s=${signed}`,
    },
    payload: raw,
  });
}

describe('a sqlite unlock order store survives a process restart', () => {
  it('keeps a pending order, and still matches a payment after the process is replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-order-'));
    dirs.push(dir);
    const sqlitePath = join(dir, 'app.sqlite');

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
    const created = opened.json<{
      orderId: string;
      status: string;
      payment: { tradeOrderId: string };
    }>();
    expect(created.status).toBe('PENDING');
    const { orderId, payment } = created;

    await first.close();
    app = undefined;

    const second = await start(sqlitePath);
    const pending = await second.inject({
      method: 'GET',
      url: `${COIN_ORDERS_PATH}/${orderId}`,
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toMatchObject({
      orderId,
      status: 'PENDING',
      payment: { provider: 'TIKTOK', tradeOrderId: payment.tradeOrderId },
      paidAt: null,
      unlockGranted: false,
    });

    const paid = await pay(second, payment.tradeOrderId);
    expect(paid.statusCode).toBe(200);

    const afterPay = await second.inject({
      method: 'GET',
      url: `${COIN_ORDERS_PATH}/${orderId}`,
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
    });
    expect(afterPay.statusCode).toBe(200);
    expect(afterPay.json()).toMatchObject({
      orderId,
      paidAt: new Date(FIXTURE_NOW_MS).toISOString(),
      unlockGranted: true,
    });
    expect(['PAID', 'FULFILLED']).toContain(afterPay.json<{ status: string }>().status);

    await second.close();
    app = undefined;

    const third = await start(sqlitePath);
    const afterBounce = await third.inject({
      method: 'GET',
      url: `${COIN_ORDERS_PATH}/${orderId}`,
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
    });
    expect(afterBounce.statusCode).toBe(200);
    expect(afterBounce.json()).toMatchObject({
      orderId,
      paidAt: new Date(FIXTURE_NOW_MS).toISOString(),
      unlockGranted: true,
    });
    expect(['PAID', 'FULFILLED']).toContain(afterBounce.json<{ status: string }>().status);
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
