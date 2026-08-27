import { beforeEach, describe, expect, it } from 'vitest';

import { createInMemoryUnlockOrderStore } from './order-store.js';
import { createUnlockOrder } from './orders.js';
import type { UnlockOrder } from './orders.js';
import type { UnlockOrderStore } from './order-store.js';

/**
 * The store's semantics, which the durable version has to reproduce.
 *
 * Three of them are load-bearing and are the reason the interface is this narrow: the idempotency
 * index is per viewer, the trade order id is the single correlation key for a payment, and every
 * write goes through the transition table rather than around it.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

let store: UnlockOrderStore;

function order(overrides: Partial<UnlockOrder> = {}): UnlockOrder {
  return {
    ...createUnlockOrder({
      id: `uord_${overrides.tradeOrderId ?? 'a'}`,
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

beforeEach(() => {
  store = createInMemoryUnlockOrderStore();
});

describe('createInMemoryUnlockOrderStore — creation', () => {
  it('stores an order and reads it back by id', async () => {
    const created = await store.create(order({ id: 'uord_1' }));

    expect(created.ok).toBe(true);
    expect(await store.get('uord_1')).toMatchObject({ id: 'uord_1', status: 'PENDING' });
  });

  it('refuses a second order under the same key for the same viewer', async () => {
    await store.create(order({ id: 'uord_1' }));
    const second = await store.create(order({ id: 'uord_2', tradeOrderId: 'tto_2' }));

    expect(second).toEqual({ ok: false, error: 'IDEMPOTENCY_CONFLICT' });
    expect(await store.get('uord_2')).toBeUndefined();
  });

  // The index is `(userId, idempotencyKey)`. A global one would let one viewer's chosen key block
  // another viewer's order, which is a denial of service with a UUID.
  it('lets a different viewer use the same key', async () => {
    await store.create(order({ id: 'uord_1' }));
    const other = await store.create(
      order({ id: 'uord_2', userId: 'usr_2', tradeOrderId: 'tto_2' }),
    );

    expect(other.ok).toBe(true);
  });

  it('finds an order by the key that created it, and only for its own viewer', async () => {
    await store.create(order({ id: 'uord_1' }));

    expect(await store.findByIdempotencyKey('usr_1', 'key-1')).toMatchObject({ id: 'uord_1' });
    expect(await store.findByIdempotencyKey('usr_2', 'key-1')).toBeUndefined();
    expect(await store.findByIdempotencyKey('usr_1', 'key-other')).toBeUndefined();
  });
});

describe('createInMemoryUnlockOrderStore — correlation', () => {
  it('finds the order a payment belongs to by trade order id', async () => {
    await store.create(order({ id: 'uord_1', tradeOrderId: 'tto_abc' }));

    expect(await store.findByTradeOrderId('tto_abc')).toMatchObject({ id: 'uord_1' });
  });

  it('finds nothing for a trade order it never issued', async () => {
    await store.create(order({ id: 'uord_1', tradeOrderId: 'tto_abc' }));

    expect(await store.findByTradeOrderId('tto_zzz')).toBeUndefined();
  });

  // The lookup has to be single-valued or a callback pays an arbitrary one of the matches. In the
  // durable store that is a unique index; here it is the same guarantee, enforced at insert.
  it('refuses a second order claiming the same trade order id', async () => {
    await store.create(order({ id: 'uord_1', tradeOrderId: 'tto_abc' }));
    const clash = await store.create(
      order({ id: 'uord_2', tradeOrderId: 'tto_abc', idempotencyKey: 'key-2' }),
    );

    expect(clash).toEqual({ ok: false, error: 'TRADE_ORDER_TAKEN' });
    expect(await store.findByTradeOrderId('tto_abc')).toMatchObject({ id: 'uord_1' });
    expect(await store.list()).toHaveLength(1);
  });
});

describe('createInMemoryUnlockOrderStore — transitions', () => {
  beforeEach(async () => {
    await store.create(order({ id: 'uord_1' }));
  });

  it('applies a payment and persists the new state', async () => {
    const applied = await store.apply('uord_1', { type: 'PAYMENT_VERIFIED', atMs: NOW + 1 });

    expect(applied.ok && applied.value.status).toBe('PAID');
    expect(await store.get('uord_1')).toMatchObject({ status: 'PAID', paidAtMs: NOW + 1 });
  });

  it('reports an unknown order rather than creating one', async () => {
    expect(await store.apply('uord_nope', { type: 'PAYMENT_VERIFIED', atMs: NOW })).toEqual({
      ok: false,
      error: 'ORDER_NOT_FOUND',
    });
    expect(await store.list()).toHaveLength(1);
  });

  // The store owns persistence, not policy: a transition the table refuses leaves the stored order
  // untouched, so there is no way to reach a state by going through the store instead of the rules.
  it('leaves the order alone when the transition is refused', async () => {
    const refused = await store.apply('uord_1', {
      type: 'UNLOCK_RECORDED',
      unlockId: 'ulk_1',
      atMs: NOW,
    });

    expect(refused).toEqual({ ok: false, error: 'TRANSITION_NOT_ALLOWED' });
    expect(await store.get('uord_1')).toMatchObject({ status: 'PENDING', unlockId: null });
  });

  it('reports a redelivered payment as already applied without restamping it', async () => {
    await store.apply('uord_1', { type: 'PAYMENT_VERIFIED', atMs: NOW + 1 });
    const again = await store.apply('uord_1', { type: 'PAYMENT_VERIFIED', atMs: NOW + 60_000 });

    expect(again).toEqual({ ok: false, error: 'ALREADY_APPLIED' });
    expect(await store.get('uord_1')).toMatchObject({ paidAtMs: NOW + 1 });
  });
});

describe('createInMemoryUnlockOrderStore — bounds', () => {
  it('drops the oldest orders past its capacity without leaving stale index entries', async () => {
    const bounded = createInMemoryUnlockOrderStore({ capacity: 2 });

    for (const n of [1, 2, 3]) {
      await bounded.create(
        order({ id: `uord_${n}`, tradeOrderId: `tto_${n}`, idempotencyKey: `key-${n}` }),
      );
    }

    expect(await bounded.list()).toHaveLength(2);
    expect(await bounded.findByTradeOrderId('tto_1')).toBeUndefined();
    expect(await bounded.findByIdempotencyKey('usr_1', 'key-1')).toBeUndefined();
    expect(await bounded.findByTradeOrderId('tto_3')).toMatchObject({ id: 'uord_3' });
  });
});
