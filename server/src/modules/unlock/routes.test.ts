import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';

import {
  FIXTURE_NOW_MS,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../entitlement/fixtures.js';
import { COIN_ORDERS_PATH } from './routes.js';
import { TIKTOK_WEBHOOK_PATH } from '../platform-tiktok/routes.js';
import { buildApp } from '../../app.js';
import { computeWebhookSignature } from '../platform-tiktok/webhook-signature.js';
import { createCountingTradeOrderPort, createRefusingTradeOrderPort } from './fixtures.js';
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';
import { loadConfig } from '../../config.js';
import type { CountingTradeOrderPort } from './fixtures.js';
import type { PlatformTradeOrderPort } from './trade-order-port.js';
import type { UnlockOrderStore } from './order-store.js';

/**
 * The coin unlock order endpoints, through the real Fastify stack.
 *
 * Most of this file is about one claim: **an order cannot become an unlock without a signed
 * callback from TikTok.** It is asserted the only way that means anything — by trying to skip the
 * signature. Unsigned, wrongly signed, tampered, replayed, addressed to another client key, sent to
 * a deployment holding no key, sent for another viewer's payment, sent as a refund instead of a
 * redeem: every one of them is followed by a re-read of the order, which must still say `PENDING`.
 *
 * The second claim is the converse, and it is why the first one has to be exhaustive: a callback
 * that *does* verify now grants the episode. It moves the order to `FULFILLED`, writes the unlock
 * record, and the assertions that follow it are that the episode reports `UNLOCKED` at
 * `POST /v1/entitlement/episode-access` and is issued a session at `POST /v1/playback/sessions`.
 * Opening the order still grants nothing on its own — that block is unchanged — so the signature is
 * the only thing between a request and paid content, and every way of skipping it is enumerated
 * above.
 */

const SECRET = 'client-secret-for-tests';
const CLIENT_KEY = 'awtest';
const NOW_SEC = FIXTURE_NOW_MS / 1000;

/** A viewer who owns nothing, and two episodes past the drama's free window. */
const BUYER = 'usr_fx_newcomer';
const COIN_OR_VIP_EPISODE = 'ep_fx_s2e01';
const COIN_ONLY_EPISODE = 'ep_fx_s2e07';

let app: FastifyInstance;
let orderStore: UnlockOrderStore;
let tradeOrders: CountingTradeOrderPort;

interface StartOptions {
  readonly secret?: string;
  readonly tradeOrderPort?: PlatformTradeOrderPort;
}

async function startApp(options: StartOptions = {}): Promise<void> {
  orderStore = createInMemoryUnlockOrderStore();
  tradeOrders = createCountingTradeOrderPort(options.tradeOrderPort);

  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      platformCredentials: createPlatformCredentials(CLIENT_KEY, options.secret ?? SECRET),
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      unlockOrderStore: orderStore,
      tradeOrderPort: tradeOrders,
      now: () => FIXTURE_NOW_MS,
    },
  );
  await app.ready();
}

interface CreateOptions {
  readonly viewer?: string | null;
  readonly authorization?: string;
  readonly idempotencyKey?: string | string[] | null;
  readonly body?: Record<string, unknown>;
}

function createOrder(episodeId: string, options: CreateOptions = {}) {
  const viewer = options.viewer === undefined ? BUYER : options.viewer;
  const authorization =
    options.authorization ?? (viewer === null ? undefined : `Bearer ${fixtureViewerToken(viewer)}`);
  const key = options.idempotencyKey === undefined ? `idem-${episodeId}` : options.idempotencyKey;

  return app.inject({
    method: 'POST',
    url: COIN_ORDERS_PATH,
    headers: {
      ...(authorization === undefined ? {} : { authorization }),
      ...(key === null ? {} : { 'idempotency-key': key }),
    },
    payload: options.body ?? { episodeId },
  });
}

function readOrder(orderId: string, viewer: string | null = BUYER) {
  return app.inject({
    method: 'GET',
    url: `${COIN_ORDERS_PATH}/${orderId}`,
    headers: viewer === null ? {} : { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
  });
}

function episodeAccess(episodeId: string, viewer: string = BUYER) {
  return app.inject({
    method: 'POST',
    url: '/v1/entitlement/episode-access',
    headers: { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
    payload: { episodeId },
  });
}

function playbackAttempt(episodeId: string, viewer: string = BUYER) {
  return app.inject({
    method: 'POST',
    url: '/v1/playback/sessions',
    headers: { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
    payload: { episodeId },
  });
}

interface OrderBody {
  readonly orderId: string;
  readonly status: string;
  readonly episodeId: string;
  readonly priceCoins: number;
  readonly unlockGranted: boolean;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly payment: { readonly provider: string; readonly tradeOrderId: string };
}

function body(response: LightMyRequestResponse): OrderBody {
  return response.json<OrderBody>();
}

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

/** Opens an order and returns it, failing loudly rather than asserting on a refusal by accident. */
async function openOrder(episodeId = COIN_OR_VIP_EPISODE, viewer = BUYER): Promise<OrderBody> {
  const response = await createOrder(episodeId, { viewer, idempotencyKey: `idem-${episodeId}` });
  expect(response.statusCode).toBe(201);

  return body(response);
}

interface CallbackOptions {
  readonly event?: string;
  readonly payerOpenId?: string;
  readonly timestampSec?: number;
  readonly secret?: string;
  readonly clientKey?: string;
  /** Omit the header entirely, or send something that is not a signature at all. */
  readonly signatureHeader?: string | null;
  readonly tamper?: (raw: string) => string;
}

/** A redeem-success callback for a trade order, signed however the test asks for. */
function callback(tradeOrderId: string, options: CallbackOptions = {}) {
  const raw = JSON.stringify({
    client_key: options.clientKey ?? CLIENT_KEY,
    event: options.event ?? 'minis.trade_order.redeem.success',
    create_time: NOW_SEC,
    user_openid: options.payerOpenId ?? BUYER,
    content: JSON.stringify({ trade_order_id: tradeOrderId, is_sandbox: false }),
  });

  const sent = options.tamper === undefined ? raw : options.tamper(raw);
  const timestampSec = options.timestampSec ?? NOW_SEC;
  const signed = computeWebhookSignature(
    Buffer.from(raw, 'utf8'),
    options.secret ?? SECRET,
    timestampSec,
  );

  const header =
    options.signatureHeader === undefined
      ? `t=${timestampSec},s=${signed}`
      : options.signatureHeader;

  return app.inject({
    method: 'POST',
    url: TIKTOK_WEBHOOK_PATH,
    headers: {
      'content-type': 'application/json',
      ...(header === null ? {} : { 'tiktok-signature': header }),
    },
    payload: sent,
  });
}

beforeEach(async () => {
  await startApp();
});

afterEach(async () => {
  await app.close();
});

describe('POST /v1/unlock/coin-orders — opening an order', () => {
  it('creates a pending order for an episode the viewer must pay for', async () => {
    const response = await createOrder(COIN_OR_VIP_EPISODE);

    expect(response.statusCode).toBe(201);
    expect(body(response)).toEqual({
      orderId: expect.stringMatching(/^uord_[0-9a-f]{32}$/) as unknown as string,
      status: 'PENDING',
      episodeId: COIN_OR_VIP_EPISODE,
      priceCoins: 300,
      unlockGranted: false,
      createdAt: '2026-08-27T10:00:00.000Z',
      paidAt: null,
      payment: { provider: 'TIKTOK', tradeOrderId: 'tto_fx_0001' },
    });
  });

  it('opens the platform trade order with the server-quoted price and the buyer', async () => {
    await createOrder(COIN_ONLY_EPISODE);

    expect(tradeOrders.requests).toEqual([
      {
        orderId: expect.stringMatching(/^uord_/) as unknown as string,
        userId: BUYER,
        episodeId: COIN_ONLY_EPISODE,
        priceCoins: 500,
      },
    ]);
  });

  // The client never proposes what it pays. A body that names a price is answered with the price
  // the entitlement decision quoted, which is the same number the unlock panel was rendered from.
  it.each([
    ['a cheaper price', { priceCoins: 1 }],
    ['a free one', { priceCoins: 0 }],
    ['a negative one', { priceCoins: -300 }],
    ['the same field under other names', { coins: 1, amountCents: 0, price: 1 }],
    ['a price for a different episode', { episodeId: COIN_ONLY_EPISODE, priceCoins: 500 }],
  ])('ignores %s supplied by the client', async (_case, proposed) => {
    const response = await createOrder(COIN_OR_VIP_EPISODE, {
      body: { ...proposed, episodeId: COIN_OR_VIP_EPISODE },
    });

    expect(response.statusCode).toBe(201);
    expect(body(response).priceCoins).toBe(300);
    expect(tradeOrders.requests[0]).toMatchObject({
      episodeId: COIN_OR_VIP_EPISODE,
      priceCoins: 300,
    });
  });

  it('sells a coin-only episode to a live subscriber, whose subscription does not cover it', async () => {
    const response = await createOrder(COIN_ONLY_EPISODE, { viewer: 'usr_fx_vip_active' });

    expect(response.statusCode).toBe(201);
    expect(body(response).priceCoins).toBe(500);
  });

  it('returns no media identifier of any kind', async () => {
    const response = await createOrder(COIN_OR_VIP_EPISODE);

    expect(response.body).not.toMatch(/https?:\/\//);
    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|\bvid\b/i);
  });
});

describe('POST /v1/unlock/coin-orders — the order grants nothing', () => {
  it('leaves the episode locked at the decision endpoint', async () => {
    await openOrder();
    const access = await episodeAccess(COIN_OR_VIP_EPISODE);

    expect(access.statusCode).toBe(200);
    expect(
      access.json<{ viewerAccess: { playable: boolean; reason: string } }>().viewerAccess,
    ).toEqual({ playable: false, reason: 'NEED_UNLOCK', unlockedBy: null });
  });

  it('leaves the episode refused at the enforcement point', async () => {
    await openOrder();
    const attempt = await playbackAttempt(COIN_OR_VIP_EPISODE);

    expect(attempt.statusCode).toBe(403);
    expect(errorCode(attempt)).toBe('EPISODE_LOCKED');
  });

  it('says so in the order itself, rather than leaving it to be inferred from the status', async () => {
    expect((await openOrder()).unlockGranted).toBe(false);
  });
});

describe('POST /v1/unlock/coin-orders — there is nothing to sell', () => {
  it.each([
    ['a free episode inside the drama-level window', 'ep_fx_s1e01', BUYER, 422],
    ['an episode the viewer already bought', 'ep_fx_s2e03', 'usr_fx_vip_expired', 409],
    [
      'an episode the live subscription already covers',
      COIN_OR_VIP_EPISODE,
      'usr_fx_vip_active',
      422,
    ],
    ['a VIP-only episode, which no quantity of coins opens', 'ep_fx_s2e05', BUYER, 422],
  ])('refuses %s', async (_case, episodeId, viewer, status) => {
    const response = await createOrder(episodeId, { viewer });

    expect(response.statusCode).toBe(status);
    expect(errorCode(response)).toBe(
      status === 409 ? 'UNLOCK_ALREADY_UNLOCKED' : 'UNLOCK_POLICY_NOT_ALLOWED',
    );
  });

  it('carries the policy and the reason, so the client can say which refusal it was', async () => {
    const response = await createOrder('ep_fx_s2e05');

    expect(response.json<{ error: { details: Record<string, unknown> } }>().error.details).toEqual({
      episodeId: 'ep_fx_s2e05',
      unlockPolicy: 'VIP_ONLY',
      reason: 'NEED_VIP',
    });
  });

  it.each([
    ['an episode that does not exist', 'ep_missing', 404, 'CONTENT_NOT_FOUND'],
    ['a draft episode, reported as absent', 'ep_fx_s2e09_draft', 404, 'CONTENT_NOT_FOUND'],
    ['a withdrawn episode', 'ep_fx_s2e10_offline', 410, 'CONTENT_OFFLINE'],
    ['a free episode of a withdrawn drama', 'ep_fx_w1e01', 410, 'CONTENT_OFFLINE'],
    // Quoting `0` here would let the order charge nothing and still expect an unlock.
    [
      'a paid episode with no usable price',
      'ep_fx_s2e08_unpriced',
      503,
      'COMMON_SERVICE_UNAVAILABLE',
    ],
  ])('refuses %s', async (_case, episodeId, status, code) => {
    const response = await createOrder(episodeId);

    expect(response.statusCode).toBe(status);
    expect(errorCode(response)).toBe(code);
  });

  // The response body proves no order was returned. It does not prove TikTok was never asked to
  // open a payment — and a payment left open on the platform for an episode we declined to sell is
  // one the viewer can still pay.
  it('never opens a platform payment for a request it refuses', async () => {
    for (const [episodeId, viewer] of [
      ['ep_fx_s1e01', BUYER],
      ['ep_fx_s2e03', 'usr_fx_vip_expired'],
      ['ep_fx_s2e05', BUYER],
      ['ep_missing', BUYER],
      ['ep_fx_s2e09_draft', BUYER],
      ['ep_fx_s2e10_offline', BUYER],
      ['ep_fx_s2e08_unpriced', BUYER],
    ] as const) {
      await createOrder(episodeId, { viewer });
    }

    expect(tradeOrders.requests).toEqual([]);
    expect(await orderStore.list()).toEqual([]);
  });
});

describe('POST /v1/unlock/coin-orders — who is asking', () => {
  it('asks an anonymous viewer to sign in rather than quoting a price', async () => {
    const response = await createOrder(COIN_OR_VIP_EPISODE, { viewer: null });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
    expect(tradeOrders.requests).toEqual([]);
  });

  it.each([
    ['a credential that is not a bearer token', 'Basic abc123'],
    ['a bearer token the session store rejects', 'Bearer not-a-fixture-token'],
  ])('refuses %s', async (_case, authorization) => {
    const response = await createOrder(COIN_OR_VIP_EPISODE, { authorization });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('refuses a session naming a viewer that does not exist', async () => {
    const response = await createOrder(COIN_OR_VIP_EPISODE, { viewer: 'usr_fx_ghost' });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });
});

describe('POST /v1/unlock/coin-orders — idempotency', () => {
  it.each([
    ['no key at all', null],
    ['a blank key', '   '],
    // Node joins a repeated header into `key-a, key-b`. Deduplicating on the join would key two
    // requests on a value neither of them sent.
    ['a duplicated header', ['key-a', 'key-b']],
    ['a key that is two tokens', 'key-a key-b'],
    ['an over-long key', 'k'.repeat(201)],
  ])('refuses a creation with %s', async (_case, idempotencyKey) => {
    const response = await createOrder(COIN_OR_VIP_EPISODE, { idempotencyKey });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_IDEMPOTENCY_KEY_REQUIRED');
    expect(tradeOrders.requests).toEqual([]);
  });

  it('returns the first order for a retry, and opens no second payment', async () => {
    const first = await createOrder(COIN_OR_VIP_EPISODE, { idempotencyKey: 'retry-1' });
    const second = await createOrder(COIN_OR_VIP_EPISODE, { idempotencyKey: 'retry-1' });

    expect(second.statusCode).toBe(201);
    expect(body(second)).toEqual(body(first));
    expect(tradeOrders.requests).toHaveLength(1);
    expect(await orderStore.list()).toHaveLength(1);
  });

  it('refuses the same key for a different episode', async () => {
    await createOrder(COIN_OR_VIP_EPISODE, { idempotencyKey: 'retry-1' });
    const other = await createOrder(COIN_ONLY_EPISODE, { idempotencyKey: 'retry-1' });

    expect(other.statusCode).toBe(409);
    expect(errorCode(other)).toBe('COMMON_IDEMPOTENCY_CONFLICT');
    expect(tradeOrders.requests).toHaveLength(1);
  });

  it('does not let one viewer\u2019s key block another\u2019s order', async () => {
    await createOrder(COIN_ONLY_EPISODE, { idempotencyKey: 'shared' });
    const other = await createOrder(COIN_ONLY_EPISODE, {
      viewer: 'usr_fx_vip_active',
      idempotencyKey: 'shared',
    });

    expect(other.statusCode).toBe(201);
    expect(body(other).payment.tradeOrderId).toBe('tto_fx_0002');
  });

  // A replay returns the order as it stands, and a replayed creation is not a way to reset one.
  it('replays a paid order without moving it back to pending', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);

    const replay = await createOrder(COIN_OR_VIP_EPISODE, {
      idempotencyKey: `idem-${COIN_OR_VIP_EPISODE}`,
    });

    expect(body(replay).status).toBe('FULFILLED');
    expect(body(replay).unlockGranted).toBe(true);
  });

  /**
   * And a *new* key is not a way to buy the same episode twice. The order was paid and the episode
   * is now owned, so the decision function reports it as unlocked and the front door has nothing to
   * sell — which is the only thing standing between a client that regenerates its idempotency key
   * and a second charge for content the viewer already holds.
   */
  it('refuses a fresh order for an episode the payment already unlocked', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);

    const second = await createOrder(COIN_OR_VIP_EPISODE, { idempotencyKey: 'a-different-key' });

    expect(second.statusCode).toBe(409);
    expect(errorCode(second)).toBe('UNLOCK_ALREADY_UNLOCKED');
    expect(tradeOrders.requests).toHaveLength(1);
    expect(await orderStore.list()).toHaveLength(1);
  });
});

describe('POST /v1/unlock/coin-orders — no payment channel', () => {
  beforeEach(async () => {
    await app.close();
    await startApp({ tradeOrderPort: createRefusingTradeOrderPort() });
  });

  // An order carrying an identifier no callback will ever mention is an order nobody can pay and
  // support cannot reconcile. Refusing to open one is the fail-closed direction.
  it('refuses to record an order it cannot attach a payment to', async () => {
    const response = await createOrder(COIN_OR_VIP_EPISODE);

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('PAYMENT_CHANNEL_UNAVAILABLE');
    expect(await orderStore.list()).toEqual([]);
  });
});

describe('GET /v1/unlock/coin-orders/{orderId}', () => {
  it('reports the order to the viewer who opened it', async () => {
    const order = await openOrder();
    const response = await readOrder(order.orderId);

    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual(order);
  });

  // Absent, not forbidden: a `403` confirms that an id exists and is somebody else's, which is
  // enough to enumerate orders.
  it('reports another viewer\u2019s order as absent', async () => {
    const order = await openOrder();
    const response = await readOrder(order.orderId, 'usr_fx_vip_active');

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('PAYMENT_ORDER_NOT_FOUND');
  });

  it('reports an unknown order the same way', async () => {
    const response = await readOrder('uord_nothing');

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('PAYMENT_ORDER_NOT_FOUND');
  });

  it('refuses an anonymous read', async () => {
    const order = await openOrder();
    const response = await readOrder(order.orderId, null);

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('does not advance the order by being read', async () => {
    const order = await openOrder();
    for (let attempt = 0; attempt < 5; attempt += 1) await readOrder(order.orderId);

    expect(body(await readOrder(order.orderId)).status).toBe('PENDING');
  });

  // There is no verb on this resource that confirms a payment. If one is ever added, it will be
  // because somebody wrote it deliberately, not because the router already answered it.
  it.each(['PUT', 'PATCH', 'DELETE'] as const)(
    'has no %s handler to confirm an order',
    async (method) => {
      const order = await openOrder();
      const response = await app.inject({
        method,
        url: `${COIN_ORDERS_PATH}/${order.orderId}`,
        headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
        payload: { status: 'FULFILLED' },
      });

      expect(response.statusCode).toBe(404);
      expect(body(await readOrder(order.orderId)).status).toBe('PENDING');
    },
  );
});

describe('fulfilment — the signature cannot be skipped', () => {
  it.each([
    ['no signature header', { signatureHeader: null }],
    ['a signature header that is not one', { signatureHeader: 'garbage' }],
    [
      'a header with a plausible shape and no key behind it',
      { signatureHeader: `t=${NOW_SEC},s=${'a'.repeat(64)}` },
    ],
    ['a body signed with somebody else\u2019s secret', { secret: 'attacker-secret' }],
    // The altered field is one we never read, so the signature is the only thing that can catch
    // it. A tamper we would have rejected on its content would pass this test for the wrong reason.
    [
      'a signature over a body that was then altered',
      { tamper: (raw: string) => raw.replace('is_sandbox', 'is_sandBox') },
    ],
    ['a replayed capture whose timestamp has gone stale', { timestampSec: NOW_SEC - 301 }],
    ['a timestamp in the future', { timestampSec: NOW_SEC + 301 }],
    ['an envelope addressed to another client key', { clientKey: 'awsomeoneelse' }],
  ])('leaves the order pending for %s', async (_case, options: CallbackOptions) => {
    const order = await openOrder();

    const response = await callback(order.payment.tradeOrderId, options);

    expect(response.statusCode).toBe(400);
    expect(body(await readOrder(order.orderId))).toMatchObject({
      status: 'PENDING',
      paidAt: null,
      unlockGranted: false,
    });
  });

  it('leaves the order pending when the callback pays somebody else\u2019s order', async () => {
    const order = await openOrder();

    const response = await callback(order.payment.tradeOrderId, {
      payerOpenId: 'usr_fx_vip_active',
    });

    // The delivery is authentic, so it is answered `200` and not retried for 72 hours — and it
    // still does not pay this order, because the payer is not the account that opened it.
    expect(response.statusCode).toBe(200);
    expect(body(await readOrder(order.orderId)).status).toBe('PENDING');
  });

  it('leaves the order pending for an event that is not a redeem success', async () => {
    const order = await openOrder();

    const response = await callback(order.payment.tradeOrderId, {
      event: 'minis.trade_order.redeem.refund_success',
    });

    expect(response.statusCode).toBe(200);
    expect(body(await readOrder(order.orderId)).status).toBe('PENDING');
  });

  it('does not invent an order for a trade order it never issued', async () => {
    const order = await openOrder();

    const response = await callback('tto_never_issued');

    expect(response.statusCode).toBe(200);
    expect(await orderStore.list()).toHaveLength(1);
    expect(body(await readOrder(order.orderId)).status).toBe('PENDING');
  });
});

describe('fulfilment — a deployment holding no signing key', () => {
  beforeEach(async () => {
    await app.close();
    await startApp({ secret: '' });
  });

  // A missing key is the misconfiguration that stops revenue quietly, and the one place it must
  // never be read as "verification passed".
  it('cannot be talked into paying an order', async () => {
    const order = await openOrder();

    const response = await callback(order.payment.tradeOrderId, { secret: '' });

    expect(response.statusCode).toBe(400);
    expect(body(await readOrder(order.orderId)).status).toBe('PENDING');
  });
});

describe('fulfilment — a verified callback', () => {
  it('records the payment against the order', async () => {
    const order = await openOrder();

    const response = await callback(order.payment.tradeOrderId);

    expect(response.statusCode).toBe(200);
    expect(body(await readOrder(order.orderId))).toMatchObject({
      status: 'FULFILLED',
      paidAt: '2026-08-27T10:00:00.000Z',
    });
  });

  // The other half of the slot's claim. Everything above is about a payment that did not happen;
  // this is the one that did, and being charged has to end in being able to watch.
  it('grants the unlock, and says so where the client reads it', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);

    expect(body(await readOrder(order.orderId)).unlockGranted).toBe(true);

    const access = await episodeAccess(COIN_OR_VIP_EPISODE);
    expect(
      access.json<{ viewerAccess: { playable: boolean; reason: string; unlockedBy: string } }>()
        .viewerAccess,
    ).toEqual({ playable: true, reason: 'UNLOCKED', unlockedBy: 'COIN' });

    const attempt = await playbackAttempt(COIN_OR_VIP_EPISODE);
    expect(attempt.statusCode).toBe(201);
  });

  // Only the episode that was bought. A grant that widened to the drama, the season or the viewer's
  // other open orders would be the same defect as a missing signature check, in the other direction.
  it('grants nothing but the episode the order named', async () => {
    const order = await openOrder(COIN_OR_VIP_EPISODE);
    await openOrder(COIN_ONLY_EPISODE);

    await callback(order.payment.tradeOrderId);

    expect((await playbackAttempt(COIN_ONLY_EPISODE)).statusCode).toBe(403);
    expect((await playbackAttempt('ep_fx_s2e05')).statusCode).toBe(403);
  });

  it('grants nothing to another viewer', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);

    const access = await episodeAccess(COIN_OR_VIP_EPISODE, 'usr_fx_lapsed_grant');

    expect(access.json<{ viewerAccess: { reason: string } }>().viewerAccess.reason).toBe(
      'NEED_UNLOCK',
    );
  });

  it('pays exactly the order the trade order belongs to', async () => {
    const first = await openOrder(COIN_OR_VIP_EPISODE);
    const second = await openOrder(COIN_ONLY_EPISODE);

    await callback(second.payment.tradeOrderId);

    expect(body(await readOrder(first.orderId)).status).toBe('PENDING');
    expect(body(await readOrder(second.orderId)).status).toBe('FULFILLED');
  });

  it('treats a redelivery as a duplicate and does not restamp the payment', async () => {
    const order = await openOrder();

    const first = await callback(order.payment.tradeOrderId);
    const second = await callback(order.payment.tradeOrderId, { timestampSec: NOW_SEC - 30 });

    expect(first.json<{ duplicate: boolean }>().duplicate).toBe(false);
    expect(second.statusCode).toBe(200);
    expect(second.json<{ duplicate: boolean }>().duplicate).toBe(true);
    expect(body(await readOrder(order.orderId)).paidAt).toBe('2026-08-27T10:00:00.000Z');
  });
});
