import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  FIXTURE_NOW_MS,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../entitlement/fixtures.js';
import { COIN_ORDERS_PATH } from './routes.js';
import { buildApp } from '../../app.js';
import { createTiktokTradeOrderPort } from '../platform-tiktok/trade-order-create.js';
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';
import { createUnavailableTradeOrderPort } from './trade-order-port.js';
import { loadConfig } from '../../config.js';
import type { PlatformTradeOrderPort, TradeOrderRequest } from './trade-order-port.js';
import type { UnlockOrderStore } from './order-store.js';

/**
 * The coin-order route through the stubbed `POST /v2/minis/trade_order/create/` adapter (C4-06).
 *
 * The route still does not populate `tokenAmount`: Q-G-7 has no observation, so a wired TikTok
 * port must refuse the same way the default refusing port does. A wrapper that supplies an
 * observed integer is how the field enters later — not a rate in this file.
 */

const SECRET = 'client-secret-for-tests';
const CLIENT_KEY = 'awtest';
const BUYER = 'usr_fx_newcomer';
const COIN_OR_VIP_EPISODE = 'ep_fx_s2e01';
const PLATFORM_TRADE_ORDER_ID = 'tto_platform_9f3a';
const OBSERVED_TOKEN_AMOUNT = 7;
const ACCESS_TOKEN = 'act.platform_user_token';

let app: FastifyInstance;
let orderStore: UnlockOrderStore;

async function startApp(tradeOrderPort: PlatformTradeOrderPort): Promise<void> {
  orderStore = createInMemoryUnlockOrderStore();
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      platformCredentials: createPlatformCredentials(CLIENT_KEY, SECRET),
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      unlockOrderStore: orderStore,
      tradeOrderPort,
      now: () => FIXTURE_NOW_MS,
    },
  );
  await app.ready();
}

function createOrder() {
  return app.inject({
    method: 'POST',
    url: COIN_ORDERS_PATH,
    headers: {
      authorization: `Bearer ${fixtureViewerToken(BUYER)}`,
      'idempotency-key': 'idem-tiktok-create',
    },
    payload: { episodeId: COIN_OR_VIP_EPISODE },
  });
}

afterEach(async () => {
  await app.close();
});

describe('POST /v1/unlock/coin-orders — TikTok create adapter', () => {
  it('still answers 503 when the default refusing port is wired', async () => {
    await startApp(createUnavailableTradeOrderPort());

    const response = await createOrder();

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CHANNEL_UNAVAILABLE',
    );
    expect(await orderStore.list()).toEqual([]);
  });

  it('still answers 503 when the TikTok port is wired but the route has no observed token_amount', async () => {
    let calls = 0;
    await startApp(
      createTiktokTradeOrderPort({
        http: async () => {
          calls += 1;
          return {
            status: 200,
            bodyText: JSON.stringify({ trade_order_id: PLATFORM_TRADE_ORDER_ID }),
          };
        },
        accessTokenForUser: () => ACCESS_TOKEN,
      }),
    );

    const response = await createOrder();

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'PAYMENT_CHANNEL_UNAVAILABLE',
    );
    expect(calls).toBe(0);
    expect(await orderStore.list()).toEqual([]);
  });

  it('returns the platform trade_order_id when an observed token_amount is supplied, not a fixture id', async () => {
    const inner = createTiktokTradeOrderPort({
      http: async () => ({
        status: 200,
        bodyText: JSON.stringify({ trade_order_id: PLATFORM_TRADE_ORDER_ID }),
      }),
      accessTokenForUser: () => ACCESS_TOKEN,
    });
    const seen: TradeOrderRequest[] = [];

    await startApp({
      createTradeOrder: async (request) => {
        seen.push(request);
        return inner.createTradeOrder({ ...request, tokenAmount: OBSERVED_TOKEN_AMOUNT });
      },
    });

    const response = await createOrder();
    const body = response.json<{
      payment: { tradeOrderId: string };
      priceCoins: number;
    }>();

    expect(response.statusCode).toBe(201);
    expect(body.payment.tradeOrderId).toBe(PLATFORM_TRADE_ORDER_ID);
    expect(body.payment.tradeOrderId).not.toMatch(/^tto_fx_/);
    expect(body.priceCoins).toBe(300);
    expect(seen[0]?.tokenAmount).toBeUndefined();
    expect(seen[0]?.priceCoins).toBe(300);
  });
});
