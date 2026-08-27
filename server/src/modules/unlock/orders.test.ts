import { describe, expect, it } from 'vitest';

import {
  UNLOCK_ORDER_STATUSES,
  advanceUnlockOrder,
  createUnlockOrder,
  newUnlockOrderId,
  unlockOrderGranted,
} from './orders.js';
import type { UnlockOrder, UnlockOrderStatus } from './orders.js';

/**
 * The transition table, tested without a route, a store or a clock.
 *
 * Everything the coin unlock path promises reduces to two rules in here: a payment is the only
 * thing that moves an order off `PENDING`, and an unlock may only be recorded against an order that
 * was paid. Both are asserted from every status, so the table is exhaustive rather than
 * representative — a status added later with no branch fails a test instead of quietly falling
 * through to whatever the last `if` did.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

function pendingOrder(overrides: Partial<UnlockOrder> = {}): UnlockOrder {
  return {
    ...createUnlockOrder({
      id: 'uord_test',
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

function orderAt(status: UnlockOrderStatus): UnlockOrder {
  if (status === 'PENDING') return pendingOrder();
  if (status === 'PAID') return pendingOrder({ status: 'PAID', paidAtMs: NOW + 1000 });

  return pendingOrder({
    status: 'FULFILLED',
    paidAtMs: NOW + 1000,
    fulfilledAtMs: NOW + 2000,
    unlockId: 'ulk_1',
  });
}

describe('createUnlockOrder', () => {
  it('starts every order pending, unpaid and granting nothing', () => {
    const order = pendingOrder();

    expect(order).toMatchObject({
      status: 'PENDING',
      paidAtMs: null,
      fulfilledAtMs: null,
      unlockId: null,
    });
    expect(unlockOrderGranted(order)).toBe(false);
  });

  it('freezes the server-quoted price and the episode it was quoted for', () => {
    expect(pendingOrder()).toMatchObject({ priceCoins: 300, episodeId: 'ep_1', dramaId: 'drm_1' });
  });

  it('keeps the id it was given, so the trade order can carry it', () => {
    expect(pendingOrder().id).toBe('uord_test');
  });
});

describe('newUnlockOrderId', () => {
  // `ord_` is `RechargeOrder`'s in `docs/12-domain-model.md` §2.1. Two order families sharing a
  // prefix means a support ticket quoting an id needs both tables searched to identify it.
  it('is prefixed so it cannot be mistaken for a recharge order', () => {
    expect(newUnlockOrderId()).toMatch(/^uord_[0-9a-f]{32}$/);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newUnlockOrderId()));

    expect(ids.size).toBe(500);
  });
});

describe('advanceUnlockOrder — PAYMENT_VERIFIED', () => {
  it('moves a pending order to paid and stamps when', () => {
    const advanced = advanceUnlockOrder(orderAt('PENDING'), {
      type: 'PAYMENT_VERIFIED',
      atMs: NOW + 5000,
    });

    expect(advanced.ok && advanced.value.status).toBe('PAID');
    expect(advanced.ok && advanced.value.paidAtMs).toBe(NOW + 5000);
  });

  // Paying is not granting. This is the entire reason the two transitions are separate: the slot
  // that eventually writes the `Unlock` row has to raise its own transition to do it.
  it('grants nothing by being paid', () => {
    const advanced = advanceUnlockOrder(orderAt('PENDING'), {
      type: 'PAYMENT_VERIFIED',
      atMs: NOW,
    });

    expect(advanced.ok && advanced.value.unlockId).toBeNull();
    expect(advanced.ok && unlockOrderGranted(advanced.value)).toBe(false);
  });

  // TikTok delivers at least once for 72 hours, so a second confirmation is ordinary traffic. It
  // must not restamp `paidAtMs`: the first confirmation is the one that happened, and that is the
  // timestamp reconciliation joins on.
  it('reports a redelivery as already applied rather than paying twice', () => {
    const paid = orderAt('PAID');
    const again = advanceUnlockOrder(paid, { type: 'PAYMENT_VERIFIED', atMs: NOW + 90_000 });

    expect(again).toEqual({ ok: false, error: 'ALREADY_APPLIED' });
    expect(paid.paidAtMs).toBe(NOW + 1000);
  });

  it('reports a confirmation for a fulfilled order as already applied, since it was', () => {
    expect(
      advanceUnlockOrder(orderAt('FULFILLED'), { type: 'PAYMENT_VERIFIED', atMs: NOW }),
    ).toEqual({ ok: false, error: 'ALREADY_APPLIED' });
  });

  it('never mutates the order it was given', () => {
    const order = orderAt('PENDING');
    advanceUnlockOrder(order, { type: 'PAYMENT_VERIFIED', atMs: NOW + 1 });

    expect(order.status).toBe('PENDING');
    expect(order.paidAtMs).toBeNull();
  });
});

describe('advanceUnlockOrder — UNLOCK_RECORDED', () => {
  // The rule the module exists for. However the wallet slot is built, it cannot hand an episode to
  // a viewer whose payment the platform never confirmed.
  it('refuses to fulfil an order that was never paid', () => {
    expect(
      advanceUnlockOrder(orderAt('PENDING'), {
        type: 'UNLOCK_RECORDED',
        unlockId: 'ulk_9',
        atMs: NOW,
      }),
    ).toEqual({ ok: false, error: 'TRANSITION_NOT_ALLOWED' });
  });

  it('records the unlock against a paid order', () => {
    const advanced = advanceUnlockOrder(orderAt('PAID'), {
      type: 'UNLOCK_RECORDED',
      unlockId: 'ulk_9',
      atMs: NOW + 9000,
    });

    expect(advanced.ok && advanced.value).toMatchObject({
      status: 'FULFILLED',
      unlockId: 'ulk_9',
      fulfilledAtMs: NOW + 9000,
    });
    expect(advanced.ok && unlockOrderGranted(advanced.value)).toBe(true);
  });

  it('refuses to record a second unlock against an order that already has one', () => {
    expect(
      advanceUnlockOrder(orderAt('FULFILLED'), {
        type: 'UNLOCK_RECORDED',
        unlockId: 'ulk_other',
        atMs: NOW,
      }),
    ).toEqual({ ok: false, error: 'ALREADY_APPLIED' });
  });
});

describe('unlockOrderGranted', () => {
  it.each(UNLOCK_ORDER_STATUSES.filter((status) => status !== 'FULFILLED'))(
    'is false for a %s order',
    (status) => {
      expect(unlockOrderGranted(orderAt(status))).toBe(false);
    },
  );

  // A status claiming an unlock exists without the id of one is a bookkeeping failure, and reading
  // it as an entitlement is the expensive way to find that out.
  it('is false for an order marked fulfilled with no unlock recorded', () => {
    expect(unlockOrderGranted(pendingOrder({ status: 'FULFILLED', unlockId: null }))).toBe(false);
  });
});

describe('the reachable state space', () => {
  // `FULFILLED` has no caller in this slot, which is the point: the granting step is W14 work, and
  // a stub that skipped to it would be a coin unlock that hands over paid content for free.
  it('has no path from a fresh order to a granted one without a payment', () => {
    let order = pendingOrder();

    for (const transition of [
      { type: 'UNLOCK_RECORDED', unlockId: 'ulk_1', atMs: NOW } as const,
      { type: 'UNLOCK_RECORDED', unlockId: 'ulk_2', atMs: NOW } as const,
    ]) {
      const advanced = advanceUnlockOrder(order, transition);
      expect(advanced.ok).toBe(false);
      if (advanced.ok) order = advanced.value;
    }

    expect(unlockOrderGranted(order)).toBe(false);
  });
});
