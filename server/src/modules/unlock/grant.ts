import { createCoinUnlock, newUnlockId } from './unlocks.js';
import type { Unlock } from './unlocks.js';
import type { UnlockOrder } from './orders.js';
import type { UnlockOrderApplyFailure, UnlockOrderStore } from './order-store.js';
import type { UnlockRecordFailure, UnlockStore } from './unlock-store.js';

/**
 * Turning a paid order into an entitlement — the step `PAID → FULFILLED` was reserved for.
 *
 * It is one function, away from HTTP and away from the webhook, because two rules cost money if
 * they are wrong and both are about ordering.
 *
 * **A `PENDING` order grants nothing.** `advanceUnlockOrder` already refuses `PENDING → FULFILLED`,
 * but that backstop guards the *order*, not the unlock table: a caller that wrote the row first
 * would hand over the episode and merely fail to record that it had. So the status is checked here,
 * before the write, and the transition table remains the second line rather than the only one.
 *
 * **The receipt is written before the order claims it exists.** If the process dies between the two
 * writes, the outcomes are: row written, order still `PAID` — the viewer can watch what they paid
 * for, and a redelivery or a replay of the stored webhook event completes the bookkeeping, because
 * `record` deduplicates on `(userId, episodeId)`. The other order of writes produces an order that
 * says `FULFILLED` and names an `unlockId` that no table holds, which reads as a granted purchase to
 * every client and to every operator, and grants nothing.
 *
 * Nothing here debits a coin wallet. The platform charged the viewer for the trade order; the
 * `WalletTransaction` ledger and the coin balance it implies are W14's, and inventing a debit
 * against a balance that does not exist would be bookkeeping we would have to unpick later.
 */

export type UnlockGrantFailure = UnlockRecordFailure | UnlockOrderApplyFailure;

export type UnlockGrant =
  | { readonly status: 'GRANTED'; readonly unlock: Unlock }
  /**
   * The viewer already held this episode. Reached by a redelivered callback, by a replay of a
   * stored event, and by the one case that is not a retry at all: a second order for an episode the
   * viewer has already bought, which the caller can recognise from `unlock.orderId`.
   */
  | { readonly status: 'ALREADY_GRANTED'; readonly unlock: Unlock }
  /** No verified payment has been seen for this order. Nothing was read and nothing was written. */
  | { readonly status: 'ORDER_NOT_PAID' }
  /**
   * The grant did not complete. Whether the row exists is deliberately not claimed: the receipt may
   * have been written and the order may not say so, which is the recoverable direction and the
   * reason this is reported rather than thrown. A replay of the stored webhook event finishes it.
   */
  | { readonly status: 'INCOMPLETE'; readonly reason: UnlockGrantFailure };

export interface GrantUnlockInput {
  readonly orderStore: UnlockOrderStore;
  readonly unlockStore: UnlockStore;
  /** Read, never trusted for its status alone — see the `PENDING` check below. */
  readonly order: UnlockOrder;
  readonly atMs: number;
  /** Injected only by tests that need a deterministic row id. */
  readonly newId?: () => string;
}

export async function grantUnlockForOrder(input: GrantUnlockInput): Promise<UnlockGrant> {
  const { order } = input;

  // The rule this file exists for. `PENDING` means the platform has never confirmed a payment for
  // this order, and the row below is permanent access to a paid episode.
  if (order.status === 'PENDING') {
    return { status: 'ORDER_NOT_PAID' };
  }

  const recorded = await input.unlockStore.record(
    createCoinUnlock({
      id: (input.newId ?? newUnlockId)(),
      // Every field comes off the order, which froze them from the facts that priced it. Nothing
      // here is derived from a request, a payload or a second lookup, so a grant cannot name
      // another viewer's account, another drama, or a price the viewer was never shown.
      userId: order.userId,
      episodeId: order.episodeId,
      dramaId: order.dramaId,
      costCoins: order.priceCoins,
      orderId: order.id,
      grantedAtMs: input.atMs,
    }),
  );

  if (!recorded.ok) {
    return { status: 'INCOMPLETE', reason: recorded.error };
  }

  const { unlock, created } = recorded.value;

  const applied = await input.orderStore.apply(order.id, {
    type: 'UNLOCK_RECORDED',
    // The stored row's id, which on a duplicate is not the one that was offered.
    unlockId: unlock.id,
    atMs: input.atMs,
  });

  // `ALREADY_APPLIED` is an order that is already `FULFILLED` — a redelivery, or a replay of a
  // grant that finished. It is not a failure and the entitlement is intact either way. Any other
  // refusal is: the receipt exists and the order does not admit it, so somebody is owed a replay.
  if (!applied.ok && applied.error !== 'ALREADY_APPLIED') {
    return { status: 'INCOMPLETE', reason: applied.error };
  }

  return created ? { status: 'GRANTED', unlock } : { status: 'ALREADY_GRANTED', unlock };
}
