import { grantUnlockForOrder } from './grant.js';
import type { PaidTradeOrderSink } from '../platform-tiktok/paid-trade-orders.js';
import type { UnlockOrderStore } from './order-store.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * The unlock module's subscription to verified payments.
 *
 * This is the *only* thing in the codebase that can move a coin unlock order out of `PENDING`, and
 * the only caller of `recordPaid` is the webhook handler, after the HMAC matched and inside the
 * client-key and timestamp checks. There is no HTTP route to it, no flag that simulates it and no
 * test-only shortcut past it: a signature that does not verify leaves every order exactly where it
 * was, which is the property `routes.test.ts` spends most of its assertions on.
 *
 * It now does two writes rather than one, in this order and no other:
 *
 *   1. `PENDING → PAID` on the order. The payment is a fact about money and is recorded first, so a
 *      failure below leaves us knowing the viewer was charged;
 *   2. the `Unlock` row, and then `PAID → FULFILLED` — `grant.ts`, which refuses to write a receipt
 *      for an order that is still `PENDING` and deduplicates on `(userId, episodeId)`.
 *
 * The second step is what makes a paid episode playable, and everything about it is a retry path:
 * TikTok delivers at least once for 72 hours, and the raw event is stored and replayable. So no
 * failure here is fatal and none of them is answered with an exception — the callback has already
 * claimed the delivery's idempotency key, so a throw would become a `500`, the retry would be
 * discarded as a duplicate, and the payment would be lost to a stack trace. Every failure is an
 * outcome, and the two that mean somebody's money is in the wrong place are reported as such.
 */
export interface UnlockOrderPaymentSinkOptions {
  readonly orderStore: UnlockOrderStore;
  readonly unlockStore: UnlockStore;
}

export function createUnlockOrderPaymentSink(
  options: UnlockOrderPaymentSinkOptions,
): PaidTradeOrderSink {
  const { orderStore, unlockStore } = options;

  return {
    recordPaid: async ({ tradeOrderId, payerOpenId, paidAtMs }) => {
      const order = await orderStore.findByTradeOrderId(tradeOrderId);

      // Ordinary traffic: Beans buy more than coin unlocks, and an event for something this module
      // did not sell belongs to whichever sink did sell it.
      if (order === undefined) return 'NO_MATCHING_ORDER';

      // The payer is the account the order was placed for, or it is not this order's payment. The
      // open id is our user primary key (`contracts/openapi.yaml`, `LoginResponse.openId`), so this
      // is a real comparison rather than a formality — without it, an authentic callback for one
      // viewer's payment could mark another viewer's order paid, and the second viewer would be the
      // one who ends up owning the episode.
      if (order.userId !== payerOpenId) return 'PAYER_MISMATCH';

      const applied = await orderStore.apply(order.id, {
        type: 'PAYMENT_VERIFIED',
        atMs: paidAtMs,
      });

      if (!applied.ok) {
        if (applied.error === 'ORDER_NOT_FOUND') return 'NO_MATCHING_ORDER';
        if (applied.error === 'TRANSITION_NOT_ALLOWED') return 'ORDER_NOT_PAYABLE';
      }

      // `ALREADY_APPLIED` is a redelivery, so the order that was already stored is the current one.
      const paid = applied.ok ? applied.value : order;

      // Already fulfilled: the receipt exists and the order says so. Nothing to grant, and nothing
      // here may restamp it.
      if (paid.status === 'FULFILLED') return 'ALREADY_RECORDED';

      const granted = await grantUnlockForOrder({
        orderStore,
        unlockStore,
        order: paid,
        // The instant the payment was learned of, reused rather than read from a second clock: the
        // grant happens in the same breath, and two timestamps would invite them to disagree.
        atMs: paidAtMs,
      });

      // The payment is recorded and the entitlement is not. `ORDER_NOT_PAID` is unreachable from
      // here — the status was just advanced — and is mapped in rather than ignored so that a status
      // added to the ladder later reports a missing grant instead of a granted one.
      if (granted.status === 'INCOMPLETE' || granted.status === 'ORDER_NOT_PAID') {
        return 'UNLOCK_NOT_GRANTED';
      }

      // The viewer already owned the episode, on a receipt some *other* order paid for. That is two
      // orders opened for one episode before either was paid — the front door refuses to sell an
      // episode the viewer already holds — so they have been charged twice and own it once. The
      // order is fulfilled against the existing receipt, and this needs a refund decision.
      if (granted.status === 'ALREADY_GRANTED' && granted.unlock.orderId !== paid.id) {
        return 'DUPLICATE_PURCHASE';
      }

      // `RECORDED` and `ALREADY_RECORDED` describe the payment, as they always have. A redelivery
      // that found the order `PAID` and completed a grant that had not landed reports the payment as
      // already recorded, which it was; the receipt it wrote is durable and inspectable.
      return applied.ok ? 'RECORDED' : 'ALREADY_RECORDED';
    },
  };
}
