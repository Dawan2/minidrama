import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';

import { COIN_ORDERS_PATH, coinOrderEndpoint, createUnlockApi } from './unlock-api';
import { apiFailure } from './failure';
import { coinOrder, grantedCoinOrder } from '../testing/unlock-fixtures';
import type { HttpPoster, HttpReader } from './http';

function httpStub(body: unknown): HttpReader & HttpPoster {
  return {
    getJson: () => Promise.resolve(ok(body)),
    postJson: () => Promise.resolve(ok(body)),
  };
}

function postSpy() {
  return vi.fn<HttpPoster['postJson']>(() => Promise.resolve(ok(coinOrder())));
}

describe('coin order endpoints', () => {
  it('publishes the paths the server registered', () => {
    expect(COIN_ORDERS_PATH).toBe('/v1/unlock/coin-orders');
    expect(coinOrderEndpoint('uord_1')).toBe('/v1/unlock/coin-orders/uord_1');
  });

  it('escapes an order id that would otherwise change the path', () => {
    expect(coinOrderEndpoint('uord/1?x=2')).toBe('/v1/unlock/coin-orders/uord%2F1%3Fx%3D2');
  });
});

describe('creating a coin order', () => {
  it('sends the idempotency key as a header', async () => {
    const postJson = postSpy();
    await createUnlockApi({ getJson: () => Promise.resolve(ok({})), postJson }).createCoinOrder({
      episodeId: 'ep_test_0004',
      idempotencyKey: 'unl_abc',
    });

    expect(postJson).toHaveBeenCalledWith(
      COIN_ORDERS_PATH,
      { episodeId: 'ep_test_0004' },
      { headers: { 'Idempotency-Key': 'unl_abc' } },
    );
  });

  /**
   * The amount is the server's, quoted from the same decision the panel was rendered against. A
   * price in a request body is a discount coupon with no expiry date, so the body is checked for
   * what it contains *and* for what it does not.
   */
  it('sends an episode id and no price', async () => {
    const postJson = postSpy();
    await createUnlockApi({ getJson: () => Promise.resolve(ok({})), postJson }).createCoinOrder({
      episodeId: 'ep_test_0004',
      idempotencyKey: 'unl_abc',
    });

    const body = postJson.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['episodeId']);
  });

  it('passes a server refusal through untouched, with its code', async () => {
    const failure = apiFailure({
      kind: 'HTTP',
      status: 409,
      code: 'UNLOCK_ALREADY_UNLOCKED',
      message: 'already unlocked',
    });

    const result = await createUnlockApi({
      getJson: () => Promise.resolve(ok({})),
      postJson: () => Promise.resolve({ ok: false, error: failure }),
    }).createCoinOrder({ episodeId: 'ep_1', idempotencyKey: 'unl_abc' });

    expect(result).toEqual({ ok: false, error: failure });
  });

  it('returns the order, including the trade order the client pays against', async () => {
    const order = coinOrder();
    const result = await createUnlockApi(httpStub(order)).createCoinOrder({
      episodeId: 'ep_test_0004',
      idempotencyKey: 'unl_abc',
    });

    expect(result).toEqual(ok(order));
  });
});

describe('reading a coin order', () => {
  it('reads the order by id', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(coinOrder())));
    await createUnlockApi({ getJson, postJson: postSpy() }).fetchCoinOrder('uord_1');

    expect(getJson).toHaveBeenCalledWith('/v1/unlock/coin-orders/uord_1');
  });

  it('keeps status and unlockGranted as two separate facts', async () => {
    const paid = coinOrder({ status: 'PAID', unlockGranted: false });
    const result = await createUnlockApi(httpStub(paid)).fetchCoinOrder('uord_1');

    expect(result.ok && result.value.status).toBe('PAID');
    expect(result.ok && result.value.unlockGranted).toBe(false);
  });

  it('reports a granted order', async () => {
    const result = await createUnlockApi(httpStub(grantedCoinOrder())).fetchCoinOrder('uord_1');
    expect(result.ok && result.value.unlockGranted).toBe(true);
  });
});

/**
 * A `2xx` in the wrong shape is a failure, not a value. It matters more here than on the catalogue
 * reads: the two fields being checked are the identifier the viewer is about to pay against and the
 * flag that says they bought something.
 */
describe('a response that is not a coin order', () => {
  async function narrows(body: unknown) {
    return createUnlockApi(httpStub(body)).fetchCoinOrder('uord_1');
  }

  it('rejects a body with no unlockGranted rather than defaulting it', async () => {
    const { unlockGranted: _dropped, ...rest } = coinOrder();
    const result = await narrows(rest);

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  it('rejects a truthy non-boolean unlockGranted', async () => {
    const result = await narrows({ ...coinOrder(), unlockGranted: 'true' });
    expect(result.ok).toBe(false);
  });

  it('rejects an order with no trade order to pay against', async () => {
    for (const payment of [undefined, {}, { provider: 'TIKTOK' }, { tradeOrderId: '' }]) {
      const result = await narrows({ ...coinOrder(), payment });
      expect(result.ok, JSON.stringify(payment)).toBe(false);
    }
  });

  it('rejects a status outside the transition table', async () => {
    const result = await narrows({ ...coinOrder(), status: 'CREDITED' });
    expect(result.ok).toBe(false);
  });

  it('rejects a body that is not an object at all', async () => {
    for (const body of [null, 'ok', 7, [coinOrder()]]) {
      expect((await narrows(body)).ok, JSON.stringify(body)).toBe(false);
    }
  });
});
