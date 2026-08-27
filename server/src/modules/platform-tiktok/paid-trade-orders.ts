/**
 * What the webhook handler does once it believes a trade order was paid.
 *
 * The callback module owns authenticity and nothing else: it proves the bytes came from TikTok, and
 * then it has to hand the fact to whoever sold something. That hand-off is this interface, and it is
 * declared here rather than in the unlock module because the webhook is the publisher — the day a
 * second thing is bought with Beans (a VIP subscription, a whole-drama unlock), it subscribes to the
 * same event instead of the callback growing a second opinion about what an order is.
 *
 * The interface carries no notion of granting. A sink is told that a payment was verified; deciding
 * what that entitles anyone to belongs to the module that sold the thing.
 */

export interface PaidTradeOrder {
  /** The platform's `trade_order_id`, taken from a payload whose HMAC has already been checked. */
  readonly tradeOrderId: string;
  /**
   * The `user_openid` on the envelope. Also our user primary key
   * (`contracts/openapi.yaml`, `LoginResponse.openId`), so a sink can and should check that the
   * payer is the account that placed the order.
   */
  readonly payerOpenId: string;
  /** When we learned of the payment. The sender's own clock is on the stored raw payload. */
  readonly paidAtMs: number;
  /** The stored webhook event, so a recorded payment can be traced back to the bytes. */
  readonly eventId: string;
}

/**
 * Operator vocabulary, not a client contract — the callback answers `200` either way, because a
 * non-200 is read as failed delivery and brings the event back for 72 hours.
 *
 * `NO_MATCHING_ORDER` is expected traffic in a system that sells more than one thing. The last two
 * are not: they mean an authentic payment arrived for an order we hold and we declined to record
 * it, which needs a human.
 */
export type PaidTradeOrderOutcome =
  'RECORDED' | 'ALREADY_RECORDED' | 'NO_MATCHING_ORDER' | 'PAYER_MISMATCH' | 'ORDER_NOT_PAYABLE';

export interface PaidTradeOrderSink {
  /**
   * Implementations must not throw. By the time this is called the delivery's idempotency key has
   * been claimed, so a thrown error would be answered `500`, retried, deduplicated as a redelivery
   * and never attempted again — a payment lost to an exception. A failure is an outcome, and an
   * outcome is logged and left for replay from the stored payload.
   */
  recordPaid(paid: PaidTradeOrder): Promise<PaidTradeOrderOutcome>;
}

/**
 * The default: hear the payment, record nothing.
 *
 * It is the fail-closed direction — no order moves, no entitlement appears, and the raw event is
 * already stored and replayable — so a deployment that has not wired a sink under-delivers instead
 * of handing out content nobody paid for.
 */
export function createIgnoringPaidTradeOrderSink(): PaidTradeOrderSink {
  return {
    recordPaid: async () => 'NO_MATCHING_ORDER',
  };
}
