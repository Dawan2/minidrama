import { err, ok } from '@minidrama/shared';

import type { PlatformTradeOrderPort, TradeOrderRequest } from './trade-order-port.js';

/**
 * A stand-in for the platform's trade-order API, and a counting wrapper around any implementation.
 *
 * `POST /v2/minis/trade_order/create/` is W23 work behind two business milestones, so the fixture
 * mints deterministic identifiers instead: `tto_fx_0001`, `tto_fx_0002`, in creation order. They
 * look nothing like a real trade order id on purpose — a test that passes because it recognised a
 * plausible-looking identifier has tested the identifier, and nothing here should ever be mistaken
 * for something a real callback could carry.
 *
 * This is test and development data. `buildApp` never reaches for it: the default port refuses, so
 * an unwired deployment cannot hand out an order that no payment can ever be matched to.
 */

export function createFixtureTradeOrderPort(): PlatformTradeOrderPort {
  let issued = 0;

  return {
    createTradeOrder: async () => {
      issued += 1;

      return ok({ tradeOrderId: `tto_fx_${String(issued).padStart(4, '0')}` });
    },
  };
}

/** A port that cannot create anything, for asserting what a refused creation answers. */
export function createRefusingTradeOrderPort(): PlatformTradeOrderPort {
  return {
    createTradeOrder: async () => err('TRADE_ORDER_UNAVAILABLE'),
  };
}

export interface CountingTradeOrderPort extends PlatformTradeOrderPort {
  /** Every request the route made, in order. Empty is the assertion that matters. */
  readonly requests: readonly TradeOrderRequest[];
}

/**
 * Wraps a trade-order port and records what it was asked for.
 *
 * The response body proves an order was not *returned*; it does not prove the platform was never
 * asked to open a payment. A route that created the trade order first and refused afterwards would
 * satisfy a body assertion while leaving a payable order on TikTok's side for an episode we just
 * decided not to sell — and the viewer can pay that one. Counting the calls tests the ordering
 * itself, which is the same reason `createCountingPlaybackMediaPort` exists.
 */
export function createCountingTradeOrderPort(
  inner: PlatformTradeOrderPort = createFixtureTradeOrderPort(),
): CountingTradeOrderPort {
  const requests: TradeOrderRequest[] = [];

  return {
    requests,
    createTradeOrder: async (request) => {
      requests.push(request);

      return inner.createTradeOrder(request);
    },
  };
}
