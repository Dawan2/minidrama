import { err } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * Where the platform's payment identifier comes from.
 *
 * A coin unlock is paid for in TikTok Beans, so the money never touches our process: the client
 * calls `TTMinis.pay` with a trade order the platform minted, the platform charges the viewer, and
 * the platform tells us about it over the signed webhook. Our order is worthless without that
 * identifier — it is the only field the callback can be correlated on — so it is obtained *before*
 * the order is stored rather than patched in afterwards. An order with no `tradeOrderId` is an
 * order no payment can ever be matched to, which is a support ticket by construction.
 *
 * Creating the trade order is `POST /v2/minis/trade_order/create/`, which is W23 work and gated on
 * business milestones M2 and M4 (`docs/00-wave-plan.md` §2). Until then this is an interface with a
 * refusing default, in the same posture as `EntitlementFactsPort` and `PlaybackMediaPort`: a
 * deployment that cannot create a real trade order answers `503` rather than inventing an
 * identifier that no callback will ever carry.
 */

export interface TradeOrderRequest {
  /** Our order id, for the platform to echo and for reconciliation to join on. */
  readonly orderId: string;
  readonly userId: string;
  readonly episodeId: string;
  /**
   * The server-quoted price, in the virtual coins `docs/12-domain-model.md` §3.3 prices episodes
   * in. The client never supplies an amount, here or anywhere.
   *
   * The platform charges Beans, and what a coin is worth in Beans is a pricing decision that does
   * not exist yet — so this port carries the number we do have and no conversion. W23 supplies the
   * mapping and this request grows the platform-side amount next to it; inventing a rate here would
   * bury a commercial decision in a type definition.
   */
  readonly priceCoins: number;
}

/**
 * Deliberately one field. The platform's create response is documented only in the One Page and
 * we have not seen it, so returning anything more would be guessing at a shape the client would
 * then depend on. If `TTMinis.pay` turns out to need a second value, it is added here in W23 with a
 * source next to it.
 */
export interface TradeOrder {
  readonly tradeOrderId: string;
}

/**
 * One failure, like `PlaybackMediaFailure`. Unreachable, unconfigured and refused all leave the
 * viewer in the same place — no payment can be started — and splitting them before we have seen the
 * real API's error vocabulary would be inventing a taxonomy for a client to branch on.
 */
export type TradeOrderFailure = 'TRADE_ORDER_UNAVAILABLE';

export interface PlatformTradeOrderPort {
  createTradeOrder(request: TradeOrderRequest): Promise<Result<TradeOrder, TradeOrderFailure>>;
}

/** The fail-closed default: no platform payment integration, therefore no order to pay for. */
export function createUnavailableTradeOrderPort(): PlatformTradeOrderPort {
  return {
    createTradeOrder: async () => err('TRADE_ORDER_UNAVAILABLE'),
  };
}
