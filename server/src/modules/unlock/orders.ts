import { randomUUID } from 'node:crypto';
import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * The coin unlock order, and the ladder it may climb.
 *
 * An order is an *intent to buy an episode*, not a purchase and never an entitlement. It is written
 * before the viewer pays, it is the record the platform's payment callback is correlated against,
 * and on its own it grants exactly nothing — `POST /v1/entitlement/episode-access` and
 * `POST /v1/playback/sessions` read unlock rows and a subscription, and this module writes neither.
 *
 * The whole point of the file is the transition table, which is a pure function so that the one
 * rule that costs money if it is wrong can be tested exhaustively without a route, a clock or a
 * store:
 *
 *   - `PENDING → PAID` happens only on `PAYMENT_VERIFIED`, and the only caller that may raise that
 *     transition is the TikTok webhook handler, after the HMAC verified
 *     (`modules/platform-tiktok/routes.ts`). There is no client-reachable path to it — an endpoint
 *     that let a client declare its own order paid would be a free episode with extra steps;
 *   - `PAID → FULFILLED` happens only on `UNLOCK_RECORDED`, and carries the id of the `Unlock` row
 *     that was written. `PENDING → FULFILLED` is refused, so nothing can grant an unlock for an
 *     order the platform never confirmed, however the wallet slot is eventually built.
 *
 * `FULFILLED` is unreachable in this slot on purpose: writing the `Unlock` row and debiting the
 * wallet is W14 work against a data layer that is W7 work, and a stub that skipped to `FULFILLED`
 * would be a coin unlock that hands over paid content without a payment. The state exists here so
 * that the slot which does the granting inherits the ordering rule instead of inventing one — see
 * `docs/handoff/w2-work-k.md` §3.
 */

export const UNLOCK_ORDER_STATUSES = ['PENDING', 'PAID', 'FULFILLED'] as const;
export type UnlockOrderStatus = (typeof UNLOCK_ORDER_STATUSES)[number];

/**
 * `uord_`, not the `ord_` that `docs/12-domain-model.md` §2.1 gives `RechargeOrder`. The two are
 * different aggregates with different lifecycles and different money in them, and a support ticket
 * quoting an id should not need both tables searched to find out which kind of order it is.
 */
const UNLOCK_ORDER_ID_PREFIX = 'uord_';

export interface UnlockOrder {
  readonly id: string;
  /** The account the order — and any unlock that eventually comes of it — belongs to. */
  readonly userId: string;
  readonly episodeId: string;
  /** Carried from the facts that priced the order, so a later grant cannot name another drama. */
  readonly dramaId: string;
  /**
   * The price quoted by `decideEpisodeAccess` at creation time, never a number from the request
   * body. Frozen here so the amount charged is the amount the viewer was shown.
   */
  readonly priceCoins: number;
  /** The platform's identifier for the payment. The webhook correlates on exactly this field. */
  readonly tradeOrderId: string;
  /** The client's `Idempotency-Key`, so a retried creation returns the first order. */
  readonly idempotencyKey: string;
  readonly status: UnlockOrderStatus;
  readonly createdAtMs: number;
  /** Set only by a verified payment callback. */
  readonly paidAtMs: number | null;
  readonly fulfilledAtMs: number | null;
  /** The `Unlock` row this order produced. Non-null exactly when the order is `FULFILLED`. */
  readonly unlockId: string | null;
}

export type UnlockOrderTransition =
  | { readonly type: 'PAYMENT_VERIFIED'; readonly atMs: number }
  | { readonly type: 'UNLOCK_RECORDED'; readonly unlockId: string; readonly atMs: number };

/**
 * `ALREADY_APPLIED` is ordinary traffic — TikTok delivers at least once for 72 hours — and means
 * the order is already at or past the state the transition would put it in. `TRANSITION_NOT_ALLOWED`
 * is the one that matters: something tried to move an order backwards or to skip a step.
 */
export type UnlockOrderTransitionFailure = 'ALREADY_APPLIED' | 'TRANSITION_NOT_ALLOWED';

export interface NewUnlockOrder {
  /**
   * Minted by the caller, before the platform trade order is created, so the trade order can carry
   * it as the merchant reference. An order and a payment that cannot be joined from either side is
   * a reconciliation problem waiting for the first callback to go missing.
   */
  readonly id: string;
  readonly userId: string;
  readonly episodeId: string;
  readonly dramaId: string;
  readonly priceCoins: number;
  readonly tradeOrderId: string;
  readonly idempotencyKey: string;
  readonly createdAtMs: number;
}

/** Every order starts `PENDING`. There is no constructor that produces any other status. */
export function createUnlockOrder(input: NewUnlockOrder): UnlockOrder {
  return {
    id: input.id,
    userId: input.userId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    priceCoins: input.priceCoins,
    tradeOrderId: input.tradeOrderId,
    idempotencyKey: input.idempotencyKey,
    status: 'PENDING',
    createdAtMs: input.createdAtMs,
    paidAtMs: null,
    fulfilledAtMs: null,
    unlockId: null,
  };
}

export function newUnlockOrderId(): string {
  return `${UNLOCK_ORDER_ID_PREFIX}${randomUUID().replaceAll('-', '')}`;
}

export function advanceUnlockOrder(
  order: UnlockOrder,
  transition: UnlockOrderTransition,
): Result<UnlockOrder, UnlockOrderTransitionFailure> {
  if (transition.type === 'PAYMENT_VERIFIED') {
    // A payment confirmation for an order that is already paid — or already fulfilled, which
    // implies paid — is a redelivery, not a second payment. It must not restamp `paidAtMs`: the
    // first confirmation is the one that happened, and reconciliation reads that timestamp.
    if (order.status !== 'PENDING') return err('ALREADY_APPLIED');

    return ok({ ...order, status: 'PAID', paidAtMs: transition.atMs });
  }

  if (order.status === 'FULFILLED') return err('ALREADY_APPLIED');

  // The rule this file exists for. An unlock may only be recorded against an order the platform
  // confirmed was paid, so no amount of retrying, racing or future refactoring inside the wallet
  // slot can turn a `PENDING` order into access to a paid episode.
  if (order.status !== 'PAID') return err('TRANSITION_NOT_ALLOWED');

  return ok({
    ...order,
    status: 'FULFILLED',
    fulfilledAtMs: transition.atMs,
    unlockId: transition.unlockId,
  });
}

/**
 * Whether this order has actually bought anything.
 *
 * Both conditions are checked. `FULFILLED` is the status that claims an unlock exists and
 * `unlockId` is the evidence that one does, and an order carrying the first without the second is a
 * bookkeeping failure that must not read as an entitlement. Nothing in the entitlement path
 * consults this — access comes from unlock rows — so it is a client-facing statement of what the
 * order achieved, and in this slot it is always `false`.
 */
export function unlockOrderGranted(order: UnlockOrder): boolean {
  return order.status === 'FULFILLED' && order.unlockId !== null;
}
