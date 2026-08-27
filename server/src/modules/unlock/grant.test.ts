import { beforeEach, describe, expect, it } from 'vitest';
import { err } from '@minidrama/shared';

import { UNLOCK_ORDER_STATUSES, createUnlockOrder } from './orders.js';
import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createInMemoryUnlockStore } from './unlock-store.js';
import { grantUnlockForOrder } from './grant.js';
import type { UnlockOrder } from './orders.js';
import type { UnlockOrderStore } from './order-store.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * The granting step, tested without a webhook or a route in sight.
 *
 * Two properties are the whole file. A `PENDING` order must not produce a row — asserted by
 * inspecting the unlock store afterwards, not by reading the returned status, because the return
 * value is what a caller believes and the table is what a viewer can watch. And the sequence must be
 * idempotent under repetition, because every caller of it is a retry path: TikTok redelivers for 72
 * hours, and a stored event can be replayed by hand.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

let orderStore: UnlockOrderStore;
let unlockStore: UnlockStore;

function order(overrides: Partial<UnlockOrder> = {}): UnlockOrder {
  return {
    ...createUnlockOrder({
      id: 'uord_1',
      userId: 'usr_1',
      episodeId: 'ep_1',
      dramaId: 'drm_1',
      priceCoins: 300,
      tradeOrderId: 'tto_1',
      idempotencyKey: 'key-1',
      createdAtMs: NOW,
    }),
    ...overrides,
  };
}

/** Stores an order in the state a verified payment would have left it in. */
async function seedPaid(overrides: Partial<UnlockOrder> = {}): Promise<UnlockOrder> {
  const created = order(overrides);
  await orderStore.create(created);
  const paid = await orderStore.apply(created.id, {
    type: 'PAYMENT_VERIFIED',
    atMs: NOW + 1000,
  });
  if (!paid.ok) throw new Error('the fixture order could not be paid');

  return paid.value;
}

function grant(paid: UnlockOrder, atMs = NOW + 2000, newId?: () => string) {
  return grantUnlockForOrder({
    orderStore,
    unlockStore,
    order: paid,
    atMs,
    ...(newId === undefined ? {} : { newId }),
  });
}

beforeEach(() => {
  orderStore = createInMemoryUnlockOrderStore();
  unlockStore = createInMemoryUnlockStore();
});

describe('grantUnlockForOrder — a paid order', () => {
  it('writes the receipt from the order, and nothing from anywhere else', async () => {
    const paid = await seedPaid();

    const granted = await grant(paid, NOW + 2000, () => 'ulk_1');

    expect(granted).toEqual({
      status: 'GRANTED',
      unlock: {
        id: 'ulk_1',
        userId: 'usr_1',
        episodeId: 'ep_1',
        dramaId: 'drm_1',
        method: 'COIN',
        costCoins: 300,
        orderId: 'uord_1',
        grantedAtMs: NOW + 2000,
        expiresAtMs: null,
      },
    });
  });

  it('fulfils the order and points it at the row that was written', async () => {
    const paid = await seedPaid();

    await grant(paid, NOW + 2000, () => 'ulk_1');

    expect(await orderStore.get('uord_1')).toMatchObject({
      status: 'FULFILLED',
      unlockId: 'ulk_1',
      fulfilledAtMs: NOW + 2000,
      // The payment is not restamped by being fulfilled.
      paidAtMs: NOW + 1000,
    });
  });

  // A coin unlock is permanent (`docs/12-domain-model.md` §6.1). An expiry invented here would be
  // an entitlement the decision function stops honouring on a date nobody chose.
  it('grants it permanently', async () => {
    await grant(await seedPaid());

    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toMatchObject({ expiresAtMs: null });
  });

  it('charges what the order froze, not a price recomputed now', async () => {
    await grant(await seedPaid({ priceCoins: 500 }));

    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toMatchObject({ costCoins: 500 });
  });
});

describe('grantUnlockForOrder — an order the platform has not confirmed', () => {
  /**
   * The assertion is on the store, not on the returned status. A caller that reported
   * `ORDER_NOT_PAID` while writing the row anyway would have handed over the episode and merely
   * failed to say so.
   */
  it('writes no receipt for a pending order', async () => {
    const pending = order();
    await orderStore.create(pending);

    expect(await grant(pending)).toEqual({ status: 'ORDER_NOT_PAID' });
    expect(await unlockStore.list()).toEqual([]);
  });

  it('leaves the pending order exactly as it was', async () => {
    const pending = order();
    await orderStore.create(pending);

    await grant(pending);

    expect(await orderStore.get('uord_1')).toMatchObject({
      status: 'PENDING',
      unlockId: null,
      fulfilledAtMs: null,
    });
  });

  /**
   * The second line of defence, on its own. If the status check above were deleted, the row would
   * be written and `advanceUnlockOrder` would still refuse to record it — so this asserts what that
   * backstop does and does not cover: it protects the order, never the unlock table.
   */
  it('is refused by the transition table too, which is why the check is not there', async () => {
    const pending = order();
    await orderStore.create(pending);

    const applied = await orderStore.apply('uord_1', {
      type: 'UNLOCK_RECORDED',
      unlockId: 'ulk_smuggled',
      atMs: NOW,
    });

    expect(applied).toEqual(err('TRANSITION_NOT_ALLOWED'));
  });
});

describe('grantUnlockForOrder — repeated', () => {
  it('grants once, however many times it is asked', async () => {
    const paid = await seedPaid();

    const first = await grant(paid, NOW + 2000, () => 'ulk_1');
    const second = await grant(paid, NOW + 90_000, () => 'ulk_2');
    const third = await grant(paid, NOW + 90_001, () => 'ulk_3');

    expect(first.status).toBe('GRANTED');
    expect(second.status).toBe('ALREADY_GRANTED');
    expect(third.status).toBe('ALREADY_GRANTED');
    expect(await unlockStore.list()).toHaveLength(1);
  });

  it('does not restamp the receipt or the fulfilment', async () => {
    const paid = await seedPaid();
    await grant(paid, NOW + 2000, () => 'ulk_1');

    await grant(paid, NOW + 90_000, () => 'ulk_2');

    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toMatchObject({
      id: 'ulk_1',
      grantedAtMs: NOW + 2000,
    });
    expect(await orderStore.get('uord_1')).toMatchObject({
      unlockId: 'ulk_1',
      fulfilledAtMs: NOW + 2000,
    });
  });

  /**
   * The replay that heals. The row was written and the process died before the order was advanced,
   * which is the direction the two writes are ordered to fail in: the viewer can watch, and the
   * bookkeeping is finished by the next delivery.
   */
  it('completes an order whose receipt was written but never recorded', async () => {
    const paid = await seedPaid();

    // The first attempt writes the row into the real store and cannot advance the order.
    await grantUnlockForOrder({
      orderStore: { ...orderStore, apply: async () => err('ORDER_NOT_FOUND') },
      unlockStore,
      order: paid,
      atMs: NOW + 2000,
      newId: () => 'ulk_1',
    });
    expect(await orderStore.get('uord_1')).toMatchObject({ status: 'PAID', unlockId: null });
    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toMatchObject({ id: 'ulk_1' });

    const replay = await grant(paid, NOW + 90_000, () => 'ulk_2');

    expect(replay.status).toBe('ALREADY_GRANTED');
    expect(await orderStore.get('uord_1')).toMatchObject({
      status: 'FULFILLED',
      unlockId: 'ulk_1',
      fulfilledAtMs: NOW + 90_000,
    });
  });

  /**
   * Two orders, one episode, both paid. The route refuses to open an order for an episode the
   * viewer already owns, so this is the case it cannot refuse: both orders were opened before
   * either was paid. The viewer has been charged twice and owns the episode once — the second order
   * is fulfilled against the *first* order's receipt, so `orderId` is what tells a caller a refund
   * is owed rather than a second entitlement.
   */
  it('gives a second paid order the first order\u2019s receipt', async () => {
    const first = await seedPaid();
    const second = await seedPaid({
      id: 'uord_2',
      tradeOrderId: 'tto_2',
      idempotencyKey: 'key-2',
    });

    await grant(first, NOW + 2000, () => 'ulk_1');
    const duplicate = await grant(second, NOW + 3000, () => 'ulk_2');

    expect(duplicate).toMatchObject({ status: 'ALREADY_GRANTED', unlock: { orderId: 'uord_1' } });
    expect(await unlockStore.list()).toHaveLength(1);
    expect(await orderStore.get('uord_2')).toMatchObject({
      status: 'FULFILLED',
      unlockId: 'ulk_1',
    });
  });
});

describe('grantUnlockForOrder — when a write does not land', () => {
  it('reports a receipt that could not be written, and fulfils nothing', async () => {
    const paid = await seedPaid();

    const granted = await grantUnlockForOrder({
      orderStore,
      unlockStore: { ...unlockStore, record: async () => err('UNLOCK_NOT_RECORDED') },
      order: paid,
      atMs: NOW + 2000,
    });

    expect(granted).toEqual({ status: 'INCOMPLETE', reason: 'UNLOCK_NOT_RECORDED' });
    expect(await orderStore.get('uord_1')).toMatchObject({ status: 'PAID', unlockId: null });
  });

  // The receipt exists and the order does not say so. Reported, never thrown: the caller is the
  // payment callback, and an exception there is a delivery that is retried and then discarded.
  it('reports an order that could not be advanced, having already granted', async () => {
    const paid = await seedPaid();

    const granted = await grantUnlockForOrder({
      orderStore: { ...orderStore, apply: async () => err('ORDER_NOT_FOUND') },
      unlockStore,
      order: paid,
      atMs: NOW + 2000,
      newId: () => 'ulk_1',
    });

    expect(granted).toEqual({ status: 'INCOMPLETE', reason: 'ORDER_NOT_FOUND' });
    expect(await unlockStore.findForEpisode('usr_1', 'ep_1')).toMatchObject({ id: 'ulk_1' });
  });

  it('resolves an outcome for every failure it can meet, rather than raising', async () => {
    const paid = await seedPaid();

    await expect(
      grantUnlockForOrder({
        orderStore: { ...orderStore, apply: async () => err('TRANSITION_NOT_ALLOWED') },
        unlockStore: { ...unlockStore, record: async () => err('UNLOCK_NOT_RECORDED') },
        order: paid,
        atMs: NOW,
      }),
    ).resolves.toMatchObject({ status: 'INCOMPLETE' });
  });
});

describe('grantUnlockForOrder — a fulfilled order', () => {
  it.each(UNLOCK_ORDER_STATUSES)('never writes a second row from status %s', async (status) => {
    const paid = await seedPaid();
    await grant(paid, NOW + 2000, () => 'ulk_1');

    await grant({ ...paid, status }, NOW + 3000, () => 'ulk_2');

    expect(await unlockStore.list()).toHaveLength(1);
  });

  // A redelivery for an order that is already fulfilled is not an error and must not look like one.
  it('reports a fulfilled order as already granted', async () => {
    const paid = await seedPaid();
    await grant(paid, NOW + 2000, () => 'ulk_1');
    const fulfilled = await orderStore.get('uord_1');

    expect(fulfilled).toBeDefined();
    expect(await grant(fulfilled as UnlockOrder, NOW + 3000, () => 'ulk_2')).toMatchObject({
      status: 'ALREADY_GRANTED',
      unlock: { id: 'ulk_1' },
    });
  });
});
