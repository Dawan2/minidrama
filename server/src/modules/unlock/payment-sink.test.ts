import { beforeEach, describe, expect, it } from 'vitest';
import { err } from '@minidrama/shared';

import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createInMemoryUnlockStore } from './unlock-store.js';
import { createUnlockOrder } from './orders.js';
import { createUnlockOrderPaymentSink } from './payment-sink.js';
import type { PaidTradeOrder } from '../platform-tiktok/paid-trade-orders.js';
import type { PaidTradeOrderSink } from '../platform-tiktok/paid-trade-orders.js';
import type { UnlockOrder } from './orders.js';
import type { UnlockOrderStore } from './order-store.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * The one subscriber to verified payments, tested away from HTTP.
 *
 * `routes.test.ts` proves nothing reaches this without a valid signature. What is proved here is
 * what it does once something does: it correlates on the trade order id, it refuses a payer who is
 * not the account that placed the order, it writes the unlock record that makes the episode
 * playable — and every outcome other than a recorded payment leaves the order, and the unlock table,
 * exactly as they were.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

let orderStore: UnlockOrderStore;
let unlockStore: UnlockStore;

function sink(stores: Partial<{ orderStore: UnlockOrderStore; unlockStore: UnlockStore }> = {}) {
  return createUnlockOrderPaymentSink({
    orderStore: stores.orderStore ?? orderStore,
    unlockStore: stores.unlockStore ?? unlockStore,
  });
}

function pendingOrder(userId = 'usr_1', tradeOrderId = 'tto_1'): UnlockOrder {
  return createUnlockOrder({
    id: `uord_${tradeOrderId}`,
    userId,
    episodeId: 'ep_1',
    dramaId: 'drm_1',
    priceCoins: 300,
    tradeOrderId,
    idempotencyKey: `key-${tradeOrderId}`,
    createdAtMs: NOW,
  });
}

async function seedOrder(userId = 'usr_1', tradeOrderId = 'tto_1'): Promise<string> {
  const order = pendingOrder(userId, tradeOrderId);
  await orderStore.create(order);

  return order.id;
}

function paid(overrides: Partial<PaidTradeOrder> = {}): PaidTradeOrder {
  return {
    tradeOrderId: 'tto_1',
    payerOpenId: 'usr_1',
    paidAtMs: NOW + 1000,
    eventId: 'evt_1',
    ...overrides,
  };
}

/** Asserts that nothing this module can grant was granted. */
async function expectNothingGranted(orderId: string): Promise<void> {
  expect(await orderStore.get(orderId)).toMatchObject({ unlockId: null, fulfilledAtMs: null });
  expect(await unlockStore.list()).toEqual([]);
}

beforeEach(() => {
  orderStore = createInMemoryUnlockOrderStore();
  unlockStore = createInMemoryUnlockStore();
});

describe('createUnlockOrderPaymentSink', () => {
  it('records a payment against the order that trade order belongs to', async () => {
    const orderId = await seedOrder();

    expect(await sink().recordPaid(paid())).toBe('RECORDED');
    expect(await orderStore.get(orderId)).toMatchObject({ paidAtMs: NOW + 1000 });
  });

  // The step this slot exists for. The receipt carries the order's own fields, so the episode the
  // viewer can now watch is the one they paid for.
  it('grants the episode the order was opened for', async () => {
    const orderId = await seedOrder();

    await sink().recordPaid(paid());

    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toMatchObject({
      userId: 'usr_1',
      episodeId: 'ep_1',
      dramaId: 'drm_1',
      method: 'COIN',
      costCoins: 300,
      orderId,
      grantedAtMs: NOW + 1000,
      expiresAtMs: null,
    });
  });

  it('fulfils the order against the receipt it wrote', async () => {
    const orderId = await seedOrder();

    await sink().recordPaid(paid());

    const unlock = await unlockStore.findForEpisode('usr_1', 'ep_1');
    expect(await orderStore.get(orderId)).toMatchObject({
      status: 'FULFILLED',
      unlockId: unlock?.id,
      fulfilledAtMs: NOW + 1000,
    });
  });

  // Beans buy more than coin unlocks. An event for something this module did not sell is ordinary
  // traffic, not an error, and it must not be answered by inventing an order.
  it('reports a trade order it did not issue, without creating one', async () => {
    const orderId = await seedOrder();

    expect(await sink().recordPaid(paid({ tradeOrderId: 'tto_other' }))).toBe('NO_MATCHING_ORDER');
    expect(await orderStore.list()).toHaveLength(1);
    await expectNothingGranted(orderId);
  });

  /**
   * The open id is our user primary key, so this is a real comparison. Without it an authentic
   * callback for one viewer's payment could pay another viewer's order, and the second viewer is
   * the one who would end up owning the episode.
   */
  it('refuses a payer who did not place the order, and grants nothing', async () => {
    const orderId = await seedOrder('usr_1');

    expect(await sink().recordPaid(paid({ payerOpenId: 'usr_2' }))).toBe('PAYER_MISMATCH');
    expect(await orderStore.get(orderId)).toMatchObject({ status: 'PENDING', paidAtMs: null });
    await expectNothingGranted(orderId);
  });

  it('reports a redelivery without restamping the payment or the grant', async () => {
    const orderId = await seedOrder();
    const subscriber = sink();

    await subscriber.recordPaid(paid());
    expect(await subscriber.recordPaid(paid({ paidAtMs: NOW + 90_000 }))).toBe('ALREADY_RECORDED');
    expect(await orderStore.get(orderId)).toMatchObject({
      paidAtMs: NOW + 1000,
      fulfilledAtMs: NOW + 1000,
    });
    expect(await unlockStore.list()).toHaveLength(1);
  });

  it('grants the same episode once, however many times the event is delivered', async () => {
    await seedOrder();
    const subscriber = sink();

    for (let delivery = 0; delivery < 5; delivery += 1) {
      await subscriber.recordPaid(paid({ paidAtMs: NOW + delivery * 1000 }));
    }

    expect(await unlockStore.list()).toHaveLength(1);
  });

  it('pays and grants only the order the trade order names', async () => {
    const first = await seedOrder('usr_1', 'tto_1');
    const second = await seedOrder('usr_1', 'tto_2');

    await sink().recordPaid(paid({ tradeOrderId: 'tto_2' }));

    expect(await orderStore.get(first)).toMatchObject({ status: 'PENDING', unlockId: null });
    expect(await orderStore.get(second)).toMatchObject({ status: 'FULFILLED' });
  });

  /**
   * A transition the table refuses is reported rather than swallowed, so the callback logs it at
   * error level. Nothing in the current table produces it — `PAYMENT_VERIFIED` on a paid or
   * fulfilled order is a redelivery — and it is the branch a future status such as an expired or
   * refunded order lands in, denying until somebody handles it.
   */
  it('reports a refused transition as not payable, and grants nothing', async () => {
    const refusing: UnlockOrderStore = {
      ...orderStore,
      findByTradeOrderId: async () => pendingOrder(),
      apply: async () => err('TRANSITION_NOT_ALLOWED'),
    };

    expect(await sink({ orderStore: refusing }).recordPaid(paid())).toBe('ORDER_NOT_PAYABLE');
    expect(await unlockStore.list()).toEqual([]);
  });

  it('reports an order that vanished between the lookup and the write', async () => {
    const racing: UnlockOrderStore = {
      ...orderStore,
      findByTradeOrderId: async () => pendingOrder(),
      apply: async () => err('ORDER_NOT_FOUND'),
    };

    expect(await sink({ orderStore: racing }).recordPaid(paid())).toBe('NO_MATCHING_ORDER');
    expect(await unlockStore.list()).toEqual([]);
  });

  // By the time the callback calls this, the delivery's idempotency key is spent: a thrown error
  // would be answered `500`, retried, deduplicated as a redelivery and never attempted again.
  it('resolves an outcome rather than raising, for every failure it can meet', async () => {
    const empty: UnlockOrderStore = { ...orderStore, findByTradeOrderId: async () => undefined };

    await expect(sink({ orderStore: empty }).recordPaid(paid())).resolves.toBe('NO_MATCHING_ORDER');
  });
});

/**
 * The payment is recorded and the entitlement is not.
 *
 * This is the failure the outcome vocabulary gained a word for. The viewer has been charged and owns
 * nothing, the callback still answers `200` because the delivery was authentic, and the only thing
 * standing between that and a support ticket is an error-level log line and a replayable event.
 */
describe('createUnlockOrderPaymentSink — when the grant does not land', () => {
  it('reports a receipt that could not be written', async () => {
    const orderId = await seedOrder();
    const failing: UnlockStore = {
      ...unlockStore,
      record: async () => err('UNLOCK_NOT_RECORDED'),
    };

    expect(await sink({ unlockStore: failing }).recordPaid(paid())).toBe('UNLOCK_NOT_GRANTED');
    // The payment is recorded regardless, which is the direction this must fail in: we know the
    // viewer was charged, and the order is a `PAID` row a replay can finish.
    expect(await orderStore.get(orderId)).toMatchObject({ status: 'PAID', unlockId: null });
  });

  /**
   * The replay that heals. A later delivery of the same payment finds the order `PAID`, grants the
   * episode, and finishes the bookkeeping — which is why a failed grant is left as a `PAID` order
   * rather than rolled back into a `PENDING` one.
   */
  it('grants on a redelivery after a first attempt that could not write', async () => {
    const orderId = await seedOrder();
    const failing: UnlockStore = {
      ...unlockStore,
      record: async () => err('UNLOCK_NOT_RECORDED'),
    };
    await sink({ unlockStore: failing }).recordPaid(paid());

    expect(await sink().recordPaid(paid({ paidAtMs: NOW + 90_000 }))).toBe('ALREADY_RECORDED');
    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toBeDefined();
    expect(await orderStore.get(orderId)).toMatchObject({ status: 'FULFILLED' });
  });

  it('reports an order that could not be advanced, having already granted', async () => {
    await seedOrder();
    let applications = 0;
    const failingSecondApply: UnlockOrderStore = {
      ...orderStore,
      apply: async (id, transition) => {
        applications += 1;

        return applications === 1 ? orderStore.apply(id, transition) : err('ORDER_NOT_FOUND');
      },
    };

    expect(await sink({ orderStore: failingSecondApply }).recordPaid(paid())).toBe(
      'UNLOCK_NOT_GRANTED',
    );
    // The receipt exists, so the viewer can watch what they paid for even though the order does not
    // say so. That is the recoverable direction, and it is why the two writes are in this order.
    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toBeDefined();
  });
});

/**
 * One episode, two orders, both paid.
 *
 * The front door refuses to open an order for an episode the viewer already owns, so the only way
 * here is two orders opened before either was paid — one viewer, two devices, or a client that
 * regenerated its idempotency key. The viewer has been charged twice and owns the episode once.
 */
describe('createUnlockOrderPaymentSink — a second payment for the same episode', () => {
  async function payBoth(): Promise<PaidTradeOrderSink> {
    const subscriber = sink();
    await seedOrder('usr_1', 'tto_1');
    await seedOrder('usr_1', 'tto_2');
    await subscriber.recordPaid(paid({ tradeOrderId: 'tto_1' }));

    return subscriber;
  }

  it('reports it as a duplicate purchase rather than as an ordinary payment', async () => {
    const subscriber = await payBoth();

    expect(await subscriber.recordPaid(paid({ tradeOrderId: 'tto_2', paidAtMs: NOW + 2000 }))).toBe(
      'DUPLICATE_PURCHASE',
    );
  });

  it('leaves one receipt, from the order that paid for it first', async () => {
    const subscriber = await payBoth();

    await subscriber.recordPaid(paid({ tradeOrderId: 'tto_2', paidAtMs: NOW + 2000 }));

    expect(await unlockStore.list()).toHaveLength(1);
    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toMatchObject({
      orderId: 'uord_tto_1',
      grantedAtMs: NOW + 1000,
    });
  });

  // The second order is still paid and still fulfilled, against the receipt that exists. Refusing
  // to fulfil it would leave a paid order that never completes; what is owed is a refund, and that
  // is a decision for a human, not for the callback.
  it('records the second payment and fulfils it against the existing receipt', async () => {
    const subscriber = await payBoth();

    await subscriber.recordPaid(paid({ tradeOrderId: 'tto_2', paidAtMs: NOW + 2000 }));

    expect(await orderStore.get('uord_tto_2')).toMatchObject({
      status: 'FULFILLED',
      paidAtMs: NOW + 2000,
      unlockId: (await unlockStore.findForEpisode('usr_1', 'ep_1'))?.id,
    });
  });

  it('reports a redelivery of the duplicate as a redelivery, not as a second duplicate', async () => {
    const subscriber = await payBoth();
    await subscriber.recordPaid(paid({ tradeOrderId: 'tto_2', paidAtMs: NOW + 2000 }));

    expect(await subscriber.recordPaid(paid({ tradeOrderId: 'tto_2', paidAtMs: NOW + 3000 }))).toBe(
      'ALREADY_RECORDED',
    );
  });
});
