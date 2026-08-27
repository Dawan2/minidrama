import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { err } from '@minidrama/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

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
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { createFixtureTradeOrderPort } from './fixtures.js';
import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createInMemoryUnlockStore } from './unlock-store.js';
import { loadConfig } from '../../config.js';
import { createPlatformCredentials } from '../platform-tiktok/credentials.js';
import type { UnlockOrderStore } from './order-store.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * What a verified payment leaves behind, and what a second delivery of it does not.
 *
 * `routes.test.ts` owns the claim that a payment cannot be faked, and `session-orders.test.ts` owns
 * the claim that the purchase belongs to the account the session names. This file is about the
 * record itself. It injects the unlock store, so the assertions are on the rows that exist rather
 * than on a response that describes them, and it is built around the two things a payment path is
 * always asked to survive:
 *
 *   - **at-least-once delivery.** TikTok redelivers for 72 hours, and the recovery path for anything
 *     that went wrong in between is a replay of the stored event (`platform-tiktok/event-store.ts`).
 *     A replay is modelled here the way it actually happens: the same signed bytes, delivered to an
 *     app that shares the durable stores and has never seen the event before — a restart, a second
 *     replica, or an operator replaying by hand. Every one of them must end with one receipt;
 *   - **a grant that did not land.** The payment is recorded before the receipt is written, so the
 *     failure leaves an order that says the viewer was charged and an episode that is still locked.
 *     That is the direction it must fail in, and the replay is what finishes it.
 */

const SECRET = 'client-secret-for-tests';
const CLIENT_KEY = 'awtest';
const NOW_SEC = FIXTURE_NOW_MS / 1000;

const BUYER = 'usr_fx_newcomer';
const OTHER_VIEWER = 'usr_fx_lapsed_grant';
const COIN_OR_VIP_EPISODE = 'ep_fx_s2e01';
const COIN_ONLY_EPISODE = 'ep_fx_s2e07';

let app: FastifyInstance;
let orderStore: UnlockOrderStore;
let unlockStore: UnlockStore;

interface StartOptions {
  /** Replaces the unlock store, for the deployment whose grant cannot be written. */
  readonly unlocks?: UnlockStore;
  /** Keeps the orders and receipts of the app that is being replaced. */
  readonly keepStores?: boolean;
}

/**
 * Builds the app. Called a second time in the replay blocks, which is what a restart looks like from
 * the outside: the durable stores are handed over and the webhook event store is not, so the
 * redelivered event is new to this process and reaches the sink again.
 */
async function startApp(options: StartOptions = {}): Promise<void> {
  if (options.keepStores !== true) {
    orderStore = createInMemoryUnlockOrderStore();
    unlockStore = createInMemoryUnlockStore();
  }

  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      platformCredentials: createPlatformCredentials(CLIENT_KEY, SECRET),
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      unlockOrderStore: orderStore,
      unlockStore: options.unlocks ?? unlockStore,
      tradeOrderPort: createFixtureTradeOrderPort(),
      now: () => FIXTURE_NOW_MS,
    },
  );
  await app.ready();
}

/** Restarts the process around the same orders and receipts. */
async function restart(options: Omit<StartOptions, 'keepStores'> = {}): Promise<void> {
  await app.close();
  await startApp({ ...options, keepStores: true });
}

interface OrderBody {
  readonly orderId: string;
  readonly status: string;
  readonly unlockGranted: boolean;
  readonly paidAt: string | null;
  readonly payment: { readonly tradeOrderId: string };
}

function body(response: LightMyRequestResponse): OrderBody {
  return response.json<OrderBody>();
}

async function openOrder(episodeId = COIN_OR_VIP_EPISODE, viewer = BUYER): Promise<OrderBody> {
  const response = await app.inject({
    method: 'POST',
    url: COIN_ORDERS_PATH,
    headers: {
      authorization: `Bearer ${fixtureViewerToken(viewer)}`,
      'idempotency-key': `idem-${viewer}-${episodeId}`,
    },
    payload: { episodeId },
  });
  expect(response.statusCode).toBe(201);

  return body(response);
}

function readOrder(orderId: string, viewer = BUYER) {
  return app.inject({
    method: 'GET',
    url: `${COIN_ORDERS_PATH}/${orderId}`,
    headers: { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
  });
}

interface CallbackOptions {
  readonly payerOpenId?: string;
  readonly event?: string;
  readonly secret?: string;
  readonly signatureHeader?: string | null;
}

/** A redeem-success callback signed with the deployment's key, byte-identical on every call. */
function callback(tradeOrderId: string, options: CallbackOptions = {}) {
  const raw = JSON.stringify({
    client_key: CLIENT_KEY,
    event: options.event ?? 'minis.trade_order.redeem.success',
    create_time: NOW_SEC,
    user_openid: options.payerOpenId ?? BUYER,
    content: JSON.stringify({ trade_order_id: tradeOrderId, is_sandbox: false }),
  });

  const signed = computeWebhookSignature(
    Buffer.from(raw, 'utf8'),
    options.secret ?? SECRET,
    NOW_SEC,
  );
  const header =
    options.signatureHeader === undefined ? `t=${NOW_SEC},s=${signed}` : options.signatureHeader;

  return app.inject({
    method: 'POST',
    url: TIKTOK_WEBHOOK_PATH,
    headers: {
      'content-type': 'application/json',
      ...(header === null ? {} : { 'tiktok-signature': header }),
    },
    payload: raw,
  });
}

function playbackAttempt(episodeId: string, viewer = BUYER) {
  return app.inject({
    method: 'POST',
    url: '/v1/playback/sessions',
    headers: { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
    payload: { episodeId },
  });
}

function episodeAccess(episodeId: string, viewer = BUYER) {
  return app.inject({
    method: 'POST',
    url: '/v1/entitlement/episode-access',
    headers: { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
    payload: { episodeId },
  });
}

function accessReason(response: LightMyRequestResponse): string {
  return response.json<{ viewerAccess: { reason: string } }>().viewerAccess.reason;
}

/** An unlock store that refuses to write, and reports it rather than raising. */
function unwritableUnlockStore(): UnlockStore {
  return { ...createInMemoryUnlockStore(), record: async () => err('UNLOCK_NOT_RECORDED') };
}

beforeEach(async () => {
  await startApp();
});

afterEach(async () => {
  await app.close();
});

describe('a verified payment writes one unlock record', () => {
  it('records the receipt from the order, with the price the order froze', async () => {
    const order = await openOrder(COIN_ONLY_EPISODE);

    await callback(order.payment.tradeOrderId);

    expect(await unlockStore.list()).toEqual([
      {
        id: expect.stringMatching(/^ulk_[0-9a-f]{32}$/) as unknown as string,
        userId: BUYER,
        episodeId: COIN_ONLY_EPISODE,
        dramaId: 'drm_fx_revenge',
        method: 'COIN',
        costCoins: 500,
        orderId: order.orderId,
        grantedAtMs: FIXTURE_NOW_MS,
        expiresAtMs: null,
      },
    ]);
  });

  it('lets the viewer play the episode they paid for', async () => {
    const order = await openOrder();

    await callback(order.payment.tradeOrderId);

    const attempt = await playbackAttempt(COIN_OR_VIP_EPISODE);
    expect(attempt.statusCode).toBe(201);
    expect(attempt.json<{ albumId: string; episodeId: string }>()).toMatchObject({
      albumId: 'drm_fx_revenge',
      episodeId: COIN_OR_VIP_EPISODE,
    });
  });

  // A purchase outranks a subscription (DM-3), so the reason has to name the receipt. Reporting
  // `VIP` for a bought episode is what makes a lapsed subscription look like a revoked purchase.
  it('reports it as a purchase', async () => {
    const order = await openOrder();

    await callback(order.payment.tradeOrderId);

    expect(
      (await episodeAccess(COIN_OR_VIP_EPISODE)).json<{
        viewerAccess: { reason: string; unlockedBy: string };
      }>().viewerAccess,
    ).toEqual({ playable: true, reason: 'UNLOCKED', unlockedBy: 'COIN' });
  });

  it('grants nothing to a viewer who did not buy it', async () => {
    const order = await openOrder();

    await callback(order.payment.tradeOrderId);

    expect(accessReason(await episodeAccess(COIN_OR_VIP_EPISODE, OTHER_VIEWER))).toBe(
      'NEED_UNLOCK',
    );
    expect((await playbackAttempt(COIN_OR_VIP_EPISODE, OTHER_VIEWER)).statusCode).toBe(403);
  });
});

/**
 * Everything that is not a verified payment for this order, stated against the unlock table.
 *
 * `routes.test.ts` enumerates the ways a signature can fail and asserts the order stays `PENDING`.
 * The order is a proxy: what an episode is played from is the receipt, and these are the cases where
 * there must not be one. The assertion is that the table is *empty* — not that the response withheld
 * something, and not that a status was left alone — because a grant written beside an order nobody
 * advanced is still an episode given away.
 */
describe('a delivery that is not a verified payment for this order grants nothing', () => {
  it.each([
    ['no signature at all', { signatureHeader: null }],
    ['a signature from another secret', { secret: 'attacker-secret' }],
    ['a header that is not a signature', { signatureHeader: 'garbage' }],
    ['an authentic payment by another account', { payerOpenId: OTHER_VIEWER }],
    ['a refund rather than a redeem', { event: 'minis.trade_order.redeem.refund_success' }],
  ])('writes no receipt for %s', async (_case, options: CallbackOptions) => {
    const order = await openOrder();

    await callback(order.payment.tradeOrderId, options);

    expect(await unlockStore.list()).toEqual([]);
    expect(body(await readOrder(order.orderId))).toMatchObject({
      status: 'PENDING',
      unlockGranted: false,
    });
    expect(accessReason(await episodeAccess(COIN_OR_VIP_EPISODE))).toBe('NEED_UNLOCK');
    expect((await playbackAttempt(COIN_OR_VIP_EPISODE)).statusCode).toBe(403);
  });

  // A payment for a trade order this deployment never issued has no order to grant against, and
  // inventing one from the open id on the envelope would grant an episode nobody bought.
  it('writes no receipt for a trade order it never issued', async () => {
    await openOrder();

    await callback('tto_never_issued');

    expect(await unlockStore.list()).toEqual([]);
    expect((await playbackAttempt(COIN_OR_VIP_EPISODE)).statusCode).toBe(403);
  });

  // The order the payment names, and not the viewer's other open orders. A grant that widened to
  // everything pending for the account would hand over episodes on one payment.
  it('grants only the episode whose order was paid', async () => {
    const paid = await openOrder(COIN_ONLY_EPISODE);
    await openOrder(COIN_OR_VIP_EPISODE);

    await callback(paid.payment.tradeOrderId);

    expect(await unlockStore.list()).toHaveLength(1);
    expect((await unlockStore.list())[0]).toMatchObject({ episodeId: COIN_ONLY_EPISODE });
    expect((await playbackAttempt(COIN_OR_VIP_EPISODE)).statusCode).toBe(403);
  });
});

describe('the same payment delivered again', () => {
  it('is answered as a duplicate and writes nothing further', async () => {
    const order = await openOrder();

    const deliveries = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      deliveries.push(await callback(order.payment.tradeOrderId));
    }

    expect(deliveries.map((delivery) => delivery.json<{ duplicate: boolean }>().duplicate)).toEqual(
      [false, true, true, true, true],
    );
    expect(await unlockStore.list()).toHaveLength(1);
  });

  /**
   * The replay that matters: an app that has never seen this event, sharing the orders and receipts
   * of the one that has. The webhook's own idempotency key is process-local here, so this is the
   * only way the sink is reached twice — and it is exactly what a restart, a second replica or an
   * operator replaying a stored payload looks like.
   */
  it('grants once across a restart', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);
    const receipt = (await unlockStore.list())[0];

    await restart();
    const replayed = await callback(order.payment.tradeOrderId);

    expect(replayed.statusCode).toBe(200);
    expect(replayed.json<{ duplicate: boolean }>().duplicate).toBe(false);
    expect(await unlockStore.list()).toEqual([receipt]);
  });

  it('does not restamp the payment or the receipt on a replay', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);

    await restart();
    await callback(order.payment.tradeOrderId);

    expect(body(await readOrder(order.orderId))).toMatchObject({
      status: 'FULFILLED',
      unlockGranted: true,
      paidAt: '2026-08-27T10:00:00.000Z',
    });
    expect(await unlockStore.list()).toHaveLength(1);
  });

  it('leaves the episode playable after the replay, not doubly so', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);

    await restart();
    await callback(order.payment.tradeOrderId);

    expect((await playbackAttempt(COIN_OR_VIP_EPISODE)).statusCode).toBe(201);
    expect(accessReason(await episodeAccess(COIN_OR_VIP_EPISODE))).toBe('UNLOCKED');
  });
});

/**
 * A deployment that records payments and cannot write receipts.
 *
 * It is the failure the ordering of the two writes was chosen for. The viewer is charged, the order
 * says so, and the episode stays locked — so the loss is recoverable from what was stored, which is
 * the only direction a payment path may fail in.
 */
describe('a grant that did not land', () => {
  beforeEach(async () => {
    await restart({ unlocks: unwritableUnlockStore() });
  });

  it('still records the payment, and does not claim the unlock', async () => {
    const order = await openOrder();

    const delivered = await callback(order.payment.tradeOrderId);

    // Authentic delivery, so it is answered `200` rather than retried for 72 hours over a failure a
    // retry cannot fix. The log line is how anyone learns a replay is owed.
    expect(delivered.statusCode).toBe(200);
    expect(body(await readOrder(order.orderId))).toMatchObject({
      status: 'PAID',
      unlockGranted: false,
      paidAt: '2026-08-27T10:00:00.000Z',
    });
  });

  it('leaves the episode locked rather than half-granted', async () => {
    const order = await openOrder();

    await callback(order.payment.tradeOrderId);

    expect(accessReason(await episodeAccess(COIN_OR_VIP_EPISODE))).toBe('NEED_UNLOCK');
    expect((await playbackAttempt(COIN_OR_VIP_EPISODE)).statusCode).toBe(403);
  });

  // The recovery. Nothing about the order had to be repaired by hand: it was left `PAID`, and the
  // replay of the stored payment finished it.
  it('is completed by a replay once the receipts can be written', async () => {
    const order = await openOrder();
    await callback(order.payment.tradeOrderId);

    await restart();
    await callback(order.payment.tradeOrderId);

    expect(body(await readOrder(order.orderId))).toMatchObject({
      status: 'FULFILLED',
      unlockGranted: true,
      // The payment is still the one that happened, not the one the replay arrived at.
      paidAt: '2026-08-27T10:00:00.000Z',
    });
    expect((await playbackAttempt(COIN_OR_VIP_EPISODE)).statusCode).toBe(201);
    expect(await unlockStore.list()).toHaveLength(1);
  });
});

/**
 * Two orders, one episode, both paid.
 *
 * The front door refuses to sell an episode the viewer already owns, so this needs both orders open
 * before either is paid — two devices, or a client that regenerated its idempotency key. The viewer
 * is charged twice and owns the episode once, and the second charge is a refund decision rather than
 * a second entitlement.
 */
describe('two paid orders for one episode', () => {
  async function openTwo(): Promise<readonly [OrderBody, OrderBody]> {
    const first = await openOrder();
    const second = await app.inject({
      method: 'POST',
      url: COIN_ORDERS_PATH,
      headers: {
        authorization: `Bearer ${fixtureViewerToken(BUYER)}`,
        'idempotency-key': 'a-second-key-for-the-same-episode',
      },
      payload: { episodeId: COIN_OR_VIP_EPISODE },
    });
    expect(second.statusCode).toBe(201);

    return [first, body(second)];
  }

  it('leaves one receipt', async () => {
    const [first, second] = await openTwo();

    await callback(first.payment.tradeOrderId);
    await callback(second.payment.tradeOrderId);

    expect(await unlockStore.list()).toHaveLength(1);
    expect((await unlockStore.list())[0]).toMatchObject({ orderId: first.orderId });
  });

  // Both orders are paid, so both report what happened to them. Leaving the second one `PAID`
  // forever would be a viewer polling an order that never completes for an episode they can watch.
  it('fulfils both orders against that one receipt', async () => {
    const [first, second] = await openTwo();

    await callback(first.payment.tradeOrderId);
    await callback(second.payment.tradeOrderId);

    expect(body(await readOrder(first.orderId))).toMatchObject({
      status: 'FULFILLED',
      unlockGranted: true,
    });
    expect(body(await readOrder(second.orderId))).toMatchObject({
      status: 'FULFILLED',
      unlockGranted: true,
    });
  });
});
