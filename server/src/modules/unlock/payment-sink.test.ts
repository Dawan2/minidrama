import { beforeEach, describe, expect, it } from 'vitest';
import { err } from '@minidrama/shared';

import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createUnlockOrder } from './orders.js';
import { createUnlockOrderPaymentSink } from './payment-sink.js';
import type { PaidTradeOrder } from '../platform-tiktok/paid-trade-orders.js';
import type { UnlockOrder } from './orders.js';
import type { UnlockOrderStore } from './order-store.js';

/**
 * The one subscriber to verified payments, tested away from HTTP.
 *
 * `routes.test.ts` proves nothing reaches this without a valid signature. What is proved here is
 * what it does once something does: it correlates on the trade order id, it refuses a payer who is
 * not the account that placed the order, and every outcome other than `RECORDED` leaves the order
 * exactly as it was.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

let store: UnlockOrderStore;

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
  await store.create(order);

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

beforeEach(() => {
  store = createInMemoryUnlockOrderStore();
});

describe('createUnlockOrderPaymentSink', () => {
  it('records a payment against the order that trade order belongs to', async () => {
    const orderId = await seedOrder();

    expect(await createUnlockOrderPaymentSink(store).recordPaid(paid())).toBe('RECORDED');
    expect(await store.get(orderId)).toMatchObject({ status: 'PAID', paidAtMs: NOW + 1000 });
  });

  // Recording is not granting. The `Unlock` row an entitlement decision reads is written by the
  // transition after this one, and that transition has no caller yet.
  it('grants nothing by recording it', async () => {
    const orderId = await seedOrder();
    await createUnlockOrderPaymentSink(store).recordPaid(paid());

    expect(await store.get(orderId)).toMatchObject({ unlockId: null, fulfilledAtMs: null });
  });

  // Beans buy more than coin unlocks. An event for something this module did not sell is ordinary
  // traffic, not an error, and it must not be answered by inventing an order.
  it('reports a trade order it did not issue, without creating one', async () => {
    await seedOrder();

    expect(
      await createUnlockOrderPaymentSink(store).recordPaid(paid({ tradeOrderId: 'tto_other' })),
    ).toBe('NO_MATCHING_ORDER');
    expect(await store.list()).toHaveLength(1);
  });

  /**
   * The open id is our user primary key, so this is a real comparison. Without it an authentic
   * callback for one viewer's payment could pay another viewer's order, and the second viewer is
   * the one who would end up owning the episode.
   */
  it('refuses a payer who did not place the order, and leaves it pending', async () => {
    const orderId = await seedOrder('usr_1');

    expect(
      await createUnlockOrderPaymentSink(store).recordPaid(paid({ payerOpenId: 'usr_2' })),
    ).toBe('PAYER_MISMATCH');
    expect(await store.get(orderId)).toMatchObject({ status: 'PENDING', paidAtMs: null });
  });

  it('reports a redelivery without restamping the payment', async () => {
    const orderId = await seedOrder();
    const sink = createUnlockOrderPaymentSink(store);

    await sink.recordPaid(paid());
    expect(await sink.recordPaid(paid({ paidAtMs: NOW + 90_000 }))).toBe('ALREADY_RECORDED');
    expect(await store.get(orderId)).toMatchObject({ paidAtMs: NOW + 1000 });
  });

  it('pays only the order the trade order names', async () => {
    const first = await seedOrder('usr_1', 'tto_1');
    const second = await seedOrder('usr_1', 'tto_2');

    await createUnlockOrderPaymentSink(store).recordPaid(paid({ tradeOrderId: 'tto_2' }));

    expect(await store.get(first)).toMatchObject({ status: 'PENDING' });
    expect(await store.get(second)).toMatchObject({ status: 'PAID' });
  });

  /**
   * A transition the table refuses is reported rather than swallowed, so the callback logs it at
   * error level. Nothing in the current table produces it — `PAYMENT_VERIFIED` on a paid or
   * fulfilled order is a redelivery — and it is the branch a future status such as an expired or
   * refunded order lands in, denying until somebody handles it.
   */
  it('reports a refused transition as not payable', async () => {
    const refusing: UnlockOrderStore = {
      ...store,
      findByTradeOrderId: async () => pendingOrder(),
      apply: async () => err('TRANSITION_NOT_ALLOWED'),
    };

    expect(await createUnlockOrderPaymentSink(refusing).recordPaid(paid())).toBe(
      'ORDER_NOT_PAYABLE',
    );
  });

  it('reports an order that vanished between the lookup and the write', async () => {
    const racing: UnlockOrderStore = {
      ...store,
      findByTradeOrderId: async () => pendingOrder(),
      apply: async () => err('ORDER_NOT_FOUND'),
    };

    expect(await createUnlockOrderPaymentSink(racing).recordPaid(paid())).toBe('NO_MATCHING_ORDER');
  });

  // By the time the callback calls this, the delivery's idempotency key is spent: a thrown error
  // would be answered `500`, retried, deduplicated as a redelivery and never attempted again.
  it('resolves an outcome rather than raising, for every failure it can meet', async () => {
    const empty: UnlockOrderStore = { ...store, findByTradeOrderId: async () => undefined };

    await expect(createUnlockOrderPaymentSink(empty).recordPaid(paid())).resolves.toBe(
      'NO_MATCHING_ORDER',
    );
  });
});
