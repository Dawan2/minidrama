import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { FIXTURE_NOW_MS, createFixtureEntitlementFactsPort } from '../entitlement/fixtures.js';
import { TEST_LOGIN_ENABLE_VALUE, mockAuthCode } from '../identity/test-login.js';
import { COIN_ORDERS_PATH } from './routes.js';
import { TIKTOK_WEBHOOK_PATH } from '../platform-tiktok/routes.js';
import { buildApp } from '../../app.js';
import { computeWebhookSignature } from '../platform-tiktok/webhook-signature.js';
import { createCountingTradeOrderPort } from './fixtures.js';
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { createInMemorySessionStore } from '../identity/session-store.js';
import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';
import { loadConfig } from '../../config.js';
import type { CountingTradeOrderPort } from './fixtures.js';
import type { SessionStore } from '../identity/session-store.js';
import type { UnlockOrderStore } from './order-store.js';

/**
 * Coin orders bought by a viewer the server actually recognises.
 *
 * `routes.test.ts` proves what the endpoints do, and it does so through `createFixtureViewerResolver`
 * — `fxt_<userId>` in, a viewer id out, no session anywhere. That is the right seam for the order
 * rules and the wrong one for the question this file asks, because an app whose login route writes to
 * one session store while its coin-order routes read another passes every assertion in that file.
 * The client presents a bearer token (`docs/handoff/w7-work-auth-header.md`); until something
 * resolves it against the store that issued it, every purchase is a `401`.
 *
 * So nothing here injects a `ViewerResolver`. The app resolves sessions the way a deployment does,
 * and the session store is injected only so a test can mint a token for a known fixture viewer
 * without a platform exchange — the supported flagless login (`docs/handoff/w3-work-l.md` §6).
 *
 * Three properties are separated deliberately:
 *
 *   - an order belongs to the **account** the session names, not to the session, so it survives a
 *     re-login and stays invisible to everyone else;
 *   - a token this server did not issue buys nothing, and — because the refusal happens before any
 *     side effect — leaves no order and no payment open on the platform;
 *   - the account id a session carries is the same identifier the payment callback correlates on, so
 *     the money and the order meet.
 */

const SECRET = 'client-secret-for-tests';
const CLIENT_KEY = 'awtest';
const SESSION_TTL_SEC = 3600;

/** A viewer who owns nothing, and a live subscriber, so the two answers are visibly different. */
const BUYER = 'usr_fx_newcomer';
const SUBSCRIBER = 'usr_fx_vip_active';
const COIN_OR_VIP_EPISODE = 'ep_fx_s2e01';
const COIN_ONLY_EPISODE = 'ep_fx_s2e07';

let app: FastifyInstance;
let sessionStore: SessionStore;
let orderStore: UnlockOrderStore;
let tradeOrders: CountingTradeOrderPort;
let nowMs: number;

async function startApp(env: NodeJS.ProcessEnv = {}): Promise<void> {
  nowMs = FIXTURE_NOW_MS;
  sessionStore = createInMemorySessionStore({ ttlSec: SESSION_TTL_SEC, now: () => nowMs });
  orderStore = createInMemoryUnlockOrderStore();
  tradeOrders = createCountingTradeOrderPort();

  app = await buildApp(
    { ...loadConfig(env), logLevel: 'silent' },
    {
      platformCredentials: createPlatformCredentials(CLIENT_KEY, SECRET),
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      sessionStore,
      unlockOrderStore: orderStore,
      tradeOrderPort: tradeOrders,
      now: () => nowMs,
    },
  );
  await app.ready();
}

/** The flagless login: a token bound to a known account, minted without a platform exchange. */
function signIn(userId: string): string {
  return sessionStore.issue(userId).accessToken;
}

interface CreateOptions {
  readonly token?: string;
  readonly authorization?: string;
  readonly idempotencyKey?: string;
}

function createOrder(episodeId: string, options: CreateOptions = {}) {
  const authorization =
    options.authorization ?? (options.token === undefined ? undefined : `Bearer ${options.token}`);

  return app.inject({
    method: 'POST',
    url: COIN_ORDERS_PATH,
    headers: {
      ...(authorization === undefined ? {} : { authorization }),
      'idempotency-key': options.idempotencyKey ?? `idem-${episodeId}`,
    },
    payload: { episodeId },
  });
}

function readOrder(orderId: string, token?: string) {
  return app.inject({
    method: 'GET',
    url: `${COIN_ORDERS_PATH}/${orderId}`,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function episodeAccess(episodeId: string, token: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/entitlement/episode-access',
    headers: { authorization: `Bearer ${token}` },
    payload: { episodeId },
  });
}

interface OrderBody {
  readonly orderId: string;
  readonly status: string;
  readonly episodeId: string;
  readonly priceCoins: number;
  readonly unlockGranted: boolean;
  readonly paidAt: string | null;
  readonly payment: { readonly provider: string; readonly tradeOrderId: string };
}

function body(response: LightMyRequestResponse): OrderBody {
  return response.json<OrderBody>();
}

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

/** Opens an order for a session, failing loudly rather than asserting on a refusal by accident. */
async function openOrder(token: string, episodeId = COIN_OR_VIP_EPISODE): Promise<OrderBody> {
  const response = await createOrder(episodeId, { token });
  expect(response.statusCode).toBe(201);

  return body(response);
}

/** A verified redeem-success callback, signed with the deployment's real key. */
function callback(tradeOrderId: string, payerOpenId: string) {
  const timestampSec = Math.floor(nowMs / 1000);
  const raw = JSON.stringify({
    client_key: CLIENT_KEY,
    event: 'minis.trade_order.redeem.success',
    create_time: timestampSec,
    user_openid: payerOpenId,
    content: JSON.stringify({ trade_order_id: tradeOrderId, is_sandbox: false }),
  });
  const signature = computeWebhookSignature(Buffer.from(raw, 'utf8'), SECRET, timestampSec);

  return app.inject({
    method: 'POST',
    url: TIKTOK_WEBHOOK_PATH,
    headers: {
      'content-type': 'application/json',
      'tiktok-signature': `t=${timestampSec},s=${signature}`,
    },
    payload: raw,
  });
}

afterEach(async () => {
  await app.close();
});

describe('a coin order is opened for the account the session names', () => {
  beforeEach(async () => {
    await startApp();
  });

  it('quotes the price to the viewer the token was issued to', async () => {
    const response = await createOrder(COIN_OR_VIP_EPISODE, { token: signIn(BUYER) });

    expect(response.statusCode).toBe(201);
    expect(body(response)).toMatchObject({ status: 'PENDING', priceCoins: 300 });
    expect(tradeOrders.requests).toEqual([
      {
        orderId: expect.stringMatching(/^uord_/) as unknown as string,
        userId: BUYER,
        episodeId: COIN_OR_VIP_EPISODE,
        priceCoins: 300,
      },
    ]);
  });

  // The same request, byte for byte, twice: only the session differs, and it is what decides whether
  // there is anything to sell. A resolver that answered "anonymous" — or answered with a fixed id —
  // would make these two responses the same.
  it('answers the same request differently for two accounts', async () => {
    const bought = await createOrder(COIN_OR_VIP_EPISODE, { token: signIn(BUYER) });
    const covered = await createOrder(COIN_OR_VIP_EPISODE, { token: signIn(SUBSCRIBER) });

    expect(bought.statusCode).toBe(201);
    expect(covered.statusCode).toBe(422);
    expect(errorCode(covered)).toBe('UNLOCK_POLICY_NOT_ALLOWED');
  });

  // An order is attributed to the account, not to the credential that opened it. A viewer whose
  // session expired mid-purchase re-runs silent login and must find their order where they left it.
  it('reports the order to a later session of the same account', async () => {
    const order = await openOrder(signIn(BUYER));

    const response = await readOrder(order.orderId, signIn(BUYER));

    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual(order);
  });

  it('reports it as absent to another account\u2019s session', async () => {
    const order = await openOrder(signIn(BUYER));

    const response = await readOrder(order.orderId, signIn(SUBSCRIBER));

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('PAYMENT_ORDER_NOT_FOUND');
  });

  it('never echoes the session token back in the order', async () => {
    const token = signIn(BUYER);
    const created = await createOrder(COIN_OR_VIP_EPISODE, { token });

    expect(created.body).not.toContain(token);
    expect((await readOrder(body(created).orderId, token)).body).not.toContain(token);
  });
});

describe('a session this server did not issue buys nothing', () => {
  beforeEach(async () => {
    await startApp();
  });

  async function expectRefused(response: LightMyRequestResponse): Promise<void> {
    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
    // The refusal happens before the platform is asked to open a payment. A payment left open for a
    // request we refused is one the viewer can still pay, for an order that does not exist.
    expect(tradeOrders.requests).toEqual([]);
    expect(await orderStore.list()).toEqual([]);
  }

  it('refuses a request that carries no credential', async () => {
    await expectRefused(await createOrder(COIN_OR_VIP_EPISODE));
  });

  it.each([
    ['a token nothing ever issued', 'not-a-session-we-issued'],
    ['a token shaped like ours', 'a'.repeat(43)],
  ])('refuses %s', async (_case, token) => {
    await expectRefused(await createOrder(COIN_OR_VIP_EPISODE, { token }));
  });

  // The token is real, was issued for a real fixture viewer, and belongs to a different store — a
  // second replica, a restart, or another deployment. The only thing that can tell is asking the
  // store this app was built with, which is the wiring under test.
  it('refuses a token issued by another store', async () => {
    const elsewhere = createInMemorySessionStore({ now: () => nowMs });

    await expectRefused(
      await createOrder(COIN_OR_VIP_EPISODE, { token: elsewhere.issue(BUYER).accessToken }),
    );
  });

  it.each([
    ['a credential that is not a bearer token', 'Basic dXNyOnB3'],
    ['an empty bearer', 'Bearer '],
  ])('refuses %s', async (_case, authorization) => {
    await expectRefused(await createOrder(COIN_OR_VIP_EPISODE, { authorization }));
  });

  it('refuses an expired session', async () => {
    const token = signIn(BUYER);
    nowMs += SESSION_TTL_SEC * 1000 + 1;

    await expectRefused(await createOrder(COIN_OR_VIP_EPISODE, { token }));
  });

  it('refuses a revoked session', async () => {
    const token = signIn(BUYER);
    sessionStore.revoke(token);

    await expectRefused(await createOrder(COIN_OR_VIP_EPISODE, { token }));
  });

  // A `404` here would say the order is gone. It is not: the caller is, and the remedy is silent
  // login rather than opening a second order for an episode they may already have paid for.
  it('refuses to report an order once the session that opened it has expired', async () => {
    const order = await openOrder(signIn(BUYER));
    nowMs += SESSION_TTL_SEC * 1000 + 1;

    const response = await readOrder(order.orderId, 'stale');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });
});

describe('the idempotency key spans the account, not the session', () => {
  beforeEach(async () => {
    await startApp();
  });

  // The client drops a refused token and runs silent login again; the viewer presses "Unlock" once.
  // If the new session did not see the first order, that one press would become two payments.
  it('returns the first order to a retry made with a new session', async () => {
    const first = await createOrder(COIN_ONLY_EPISODE, {
      token: signIn(BUYER),
      idempotencyKey: 'k',
    });

    const retry = await createOrder(COIN_ONLY_EPISODE, {
      token: signIn(BUYER),
      idempotencyKey: 'k',
    });

    expect(retry.statusCode).toBe(201);
    expect(body(retry)).toEqual(body(first));
    expect(tradeOrders.requests).toHaveLength(1);
    expect(await orderStore.list()).toHaveLength(1);
  });

  it('does not let one account\u2019s key answer another\u2019s request', async () => {
    const mine = await createOrder(COIN_ONLY_EPISODE, {
      token: signIn(BUYER),
      idempotencyKey: 'k',
    });

    const theirs = await createOrder(COIN_ONLY_EPISODE, {
      token: signIn(SUBSCRIBER),
      idempotencyKey: 'k',
    });

    expect(theirs.statusCode).toBe(201);
    expect(body(theirs).orderId).not.toBe(body(mine).orderId);
    expect(await orderStore.list()).toHaveLength(2);
  });
});

/**
 * The whole funnel over HTTP, with no store handed to a test: log in at the endpoint, open an order
 * with what it issued, and pay it with a signed callback.
 *
 * The last step is what ties this slot to the payment sink. A session is bound to the platform's
 * `open_id` (`docs/handoff/w3-work-l.md` S57) and the callback correlates a payment by comparing
 * `user_openid` to the account that placed the order, so the two must name the same thing. If a later
 * slot mints a local `usr_` id at login without telling the sink, every real payment starts being
 * dropped as a payer mismatch — silently, with a `200`, while every unit test still passes.
 */
describe('login, order, pay', () => {
  const enabled = { MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE, NODE_ENV: 'test' };

  beforeEach(async () => {
    await startApp(enabled);
  });

  async function login(userId: string): Promise<{ accessToken: string; openId: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { provider: 'TIKTOK', authCode: mockAuthCode(userId) },
    });
    expect(response.statusCode).toBe(200);

    return response.json<{ accessToken: string; openId: string }>();
  }

  it('opens an order with the token the login endpoint issued', async () => {
    const { accessToken, openId } = await login(BUYER);

    const response = await createOrder(COIN_OR_VIP_EPISODE, { token: accessToken });

    expect(response.statusCode).toBe(201);
    expect(tradeOrders.requests[0]).toMatchObject({ userId: openId });
  });

  it('records the payment against the order the session opened', async () => {
    const { accessToken, openId } = await login(BUYER);
    const order = await openOrder(accessToken);

    const delivered = await callback(order.payment.tradeOrderId, openId);

    expect(delivered.statusCode).toBe(200);
    expect(body(await readOrder(order.orderId, accessToken))).toMatchObject({
      status: 'PAID',
      paidAt: '2026-08-27T10:00:00.000Z',
    });
  });

  // Paid is not unlocked. The `Unlock` row is a later slot's, and until it exists the episode stays
  // locked — which is the only direction a half-built payment path may fail in.
  it('grants nothing by being paid', async () => {
    const { accessToken, openId } = await login(BUYER);
    const order = await openOrder(accessToken);
    await callback(order.payment.tradeOrderId, openId);

    expect(body(await readOrder(order.orderId, accessToken)).unlockGranted).toBe(false);
    const access = await episodeAccess(COIN_OR_VIP_EPISODE, accessToken);
    expect(access.json<{ viewerAccess: { reason: string } }>().viewerAccess.reason).toBe(
      'NEED_UNLOCK',
    );
  });

  it('leaves the order pending when the payer is not the account that opened it', async () => {
    const { accessToken } = await login(BUYER);
    const order = await openOrder(accessToken);

    const delivered = await callback(order.payment.tradeOrderId, SUBSCRIBER);

    // Authentic delivery, so it is answered `200` and not retried for 72 hours — and it still does
    // not pay this order.
    expect(delivered.statusCode).toBe(200);
    expect(body(await readOrder(order.orderId, accessToken)).status).toBe('PENDING');
  });
});

/**
 * Production is unchanged by any of this. The real code exchange still does not exist, so the only
 * deployment that can issue a session is one that asked for the mock path twice, in two variables.
 */
describe('a deployment without the mock path has no session to sell against', () => {
  beforeEach(async () => {
    await startApp();
  });

  it.each([
    ['a real-looking authorization code', 'act.example12345'],
    ['a mock code', mockAuthCode(BUYER)],
  ])('refuses to exchange %s, and issues nothing', async (_case, authCode) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { provider: 'TIKTOK', authCode },
    });

    expect(response.statusCode).toBe(502);
    expect(errorCode(response)).toBe('AUTH_PROVIDER_ERROR');
    expect(sessionStore.liveSessions).toBe(0);
  });

  it('so the coin-order endpoint has nothing to authenticate, and sells nothing', async () => {
    const response = await createOrder(COIN_OR_VIP_EPISODE, { token: 'invented' });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
    expect(tradeOrders.requests).toEqual([]);
    expect(await orderStore.list()).toEqual([]);
  });
});
