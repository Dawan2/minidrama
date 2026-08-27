import type { PaidTradeOrderSink } from '../platform-tiktok/paid-trade-orders.js';
import type { UnlockOrderStore } from './order-store.js';

/**
 * The unlock module's subscription to verified payments.
 *
 * This is the *only* thing in the codebase that can move a coin unlock order out of `PENDING`, and
 * the only caller of `recordPaid` is the webhook handler, after the HMAC matched and inside the
 * client-key and timestamp checks. There is no HTTP route to it, no flag that simulates it and no
 * test-only shortcut past it: a signature that does not verify leaves every order exactly where it
 * was, which is the property `routes.test.ts` spends most of its assertions on.
 *
 * What it does *not* do is grant anything. Recording the payment sets `PAID`; the `Unlock` row that
 * an entitlement decision actually reads is written by the transition after that one, and that
 * transition has no caller yet (`orders.ts`). So a viewer who pays today gets an order that says so
 * and an episode that is still locked — under-delivering until the wallet slot lands, which is the
 * only direction a half-built payment path may fail in.
 */
export function createUnlockOrderPaymentSink(store: UnlockOrderStore): PaidTradeOrderSink {
  return {
    recordPaid: async ({ tradeOrderId, payerOpenId, paidAtMs }) => {
      const order = await store.findByTradeOrderId(tradeOrderId);

      // Ordinary traffic: Beans buy more than coin unlocks, and an event for something this module
      // did not sell belongs to whichever sink did sell it.
      if (order === undefined) return 'NO_MATCHING_ORDER';

      // The payer is the account the order was placed for, or it is not this order's payment. The
      // open id is our user primary key (`contracts/openapi.yaml`, `LoginResponse.openId`), so this
      // is a real comparison rather than a formality — without it, an authentic callback for one
      // viewer's payment could mark another viewer's order paid, and the second viewer would be the
      // one who ends up owning the episode.
      if (order.userId !== payerOpenId) return 'PAYER_MISMATCH';

      const applied = await store.apply(order.id, { type: 'PAYMENT_VERIFIED', atMs: paidAtMs });
      if (applied.ok) return 'RECORDED';

      if (applied.error === 'ORDER_NOT_FOUND') return 'NO_MATCHING_ORDER';

      return applied.error === 'ALREADY_APPLIED' ? 'ALREADY_RECORDED' : 'ORDER_NOT_PAYABLE';
    },
  };
}
