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
 * The first three are ordinary traffic: a payment recorded, a redelivery of one, and an event for
 * something this module did not sell. `ERROR_OUTCOMES` below is the rest, and every member of it
 * means an authentic payment arrived and somebody's money is now in the wrong place.
 */
export type PaidTradeOrderOutcome =
  | 'RECORDED'
  | 'ALREADY_RECORDED'
  | 'NO_MATCHING_ORDER'
  | 'PAYER_MISMATCH'
  | 'ORDER_NOT_PAYABLE'
  /** The payment was recorded and what it bought was not granted. The viewer paid for nothing. */
  | 'UNLOCK_NOT_GRANTED'
  /** The viewer was charged for something they already owned, on a second order for one episode. */
  | 'DUPLICATE_PURCHASE';

/**
 * The outcomes a human has to look at. Named here rather than at the log line so that adding an
 * outcome forces a decision about whether it pages anybody.
 */
export const ERROR_OUTCOMES: readonly PaidTradeOrderOutcome[] = [
  'PAYER_MISMATCH',
  'ORDER_NOT_PAYABLE',
  'UNLOCK_NOT_GRANTED',
  'DUPLICATE_PURCHASE',
];

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
