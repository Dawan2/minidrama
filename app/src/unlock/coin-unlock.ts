import { classifyFailure } from '../data/failure';
import type { ApiFailure } from '../data/failure';
import type { BridgeError } from '@minidrama/shared';
import type { CoinOrder, UnlockApi } from '../data/unlock-api';
import type { PlatformBridge } from '../platform/types';

/**
 * The coin unlock, end to end: record the intent, hand the trade order to the platform, then ask
 * the server what came of it.
 *
 * It is a plain async function rather than a hook because it is the part that spends money, and the
 * part that spends money should be assertable without a DOM, a router or a render. `useCoinUnlock`
 * is the twenty lines that publish its progress into React state.
 *
 * **Nothing here unlocks anything.** That is not a style preference, it is the only reason the flow
 * is shaped this way. Three tempting shortcuts each hand over a paid episode for free:
 *
 * - returning `UNLOCKED` when the order is created — the `201` records an intent and the episode is
 *   still locked a millisecond later;
 * - returning `UNLOCKED` when `PlatformBridge.pay` resolves — the SDK callback says the platform's
 *   sheet closed, not that money moved, and it is not the authority on either;
 * - returning `UNLOCKED` on `status: PAID` — the viewer was charged and the unlock row has not been
 *   written. Today it is never written at all, so `PAID` is where a real, successful purchase
 *   currently stops.
 *
 * So the single condition for `UNLOCKED` is the server's own `unlockGranted`, and even that is not
 * treated as access: the caller reloads the episode list and renders whatever `viewerAccess` then
 * says. A locally patched episode is a client-side entitlement decision by another name.
 *
 * The other half of the design is that a *charged* viewer never sees a plain error. `PAID` without
 * a grant is its own outcome (`AWAITING_UNLOCK`) with its own copy, because "we took your money and
 * something went wrong" and "nothing happened, try again" are different sentences and only one of
 * them is true.
 */

export const COIN_UNLOCK_STAGES = [
  /** `POST /v1/unlock/coin-orders` in flight. */
  'ORDERING',
  /** The platform's payment sheet is up. Nothing of ours is on screen. */
  'PAYING',
  /** Polling the order for the callback the platform has not delivered yet. */
  'CONFIRMING',
] as const;

export type CoinUnlockStage = (typeof COIN_UNLOCK_STAGES)[number];

export const COIN_UNLOCK_FAILURES = [
  /** The server will not sell this episode for coins. The offer on screen was stale. */
  'NOT_FOR_SALE',
  /** An order belongs to an account and this viewer has none. */
  'SIGN_IN_REQUIRED',
  /** The episode was withdrawn or never existed. Not a payment problem. */
  'EPISODE_GONE',
  /** The payment rail is down, or absent from this client. Nothing was charged. */
  'PAYMENT_UNAVAILABLE',
  /** The platform refused the payment. Nothing was charged. */
  'PAYMENT_FAILED',
  /** We ran out of patience waiting for the callback. The charge may yet land. */
  'PAYMENT_NOT_CONFIRMED',
  /** The idempotency key was refused. A fresh attempt needs a fresh key. */
  'ORDER_CONFLICT',
  /** The order the viewer is paying against has vanished server-side. Never offer a retry. */
  'ORDER_LOST',
  /** Transport. The request plausibly never arrived. */
  'UNREACHABLE',
  /** The server refused the request in a way repeating it cannot fix. */
  'REFUSED',
] as const;

export type CoinUnlockFailure = (typeof COIN_UNLOCK_FAILURES)[number];

/**
 * Whether the viewer may press the button again, and with which key.
 *
 * `SAME_KEY` is the safe retry: the server returns the order it already has instead of opening a
 * second payment, which is the entire point of an idempotency key. `NONE` is not politeness — it is
 * the answer whenever money may already have moved, or whenever repeating the request cannot
 * change what the server said.
 */
export type UnlockRetryAdvice = 'SAME_KEY' | 'FRESH_KEY' | 'NONE';

export type CoinUnlockOutcome =
  /** The server says this order bought the episode. Reload; do not patch. */
  | { readonly kind: 'UNLOCKED' }
  /** `409 UNLOCK_ALREADY_UNLOCKED`. A success: they own it (`docs/02-screen-inventory.md` PNL-02). */
  | { readonly kind: 'ALREADY_UNLOCKED' }
  /** Charged, not yet granted. The honest end state of a successful purchase today. */
  | { readonly kind: 'AWAITING_UNLOCK'; readonly orderId: string }
  /** The viewer dismissed the platform's sheet. Nothing was charged. */
  | { readonly kind: 'CANCELLED' }
  /** The panel closed while this was in flight. Nothing to report to a surface that is gone. */
  | { readonly kind: 'ABANDONED' }
  | {
      readonly kind: 'FAILED';
      readonly reason: CoinUnlockFailure;
      readonly retry: UnlockRetryAdvice;
      /** For `data-trace-id`, so a viewer's report maps to a server trace. Never rendered. */
      readonly failure: ApiFailure | null;
    };

/**
 * How long the client waits for a callback it does not control.
 *
 * The first poll is immediate, because by the time the platform's sheet has closed the webhook may
 * already have arrived, and a mandatory one-second pause before the first read is a second of
 * spinner for nothing. The delays below therefore sit *between* polls: seven reads over sixty
 * seconds, which is the budget `docs/02-user-journeys.md` J11-8 gives an order poll.
 *
 * Injected, like `sleep` in the HTTP client, so the timing is a value a test can supply rather than
 * a clock a test has to fake.
 */
export interface UnlockPacing {
  readonly pollBackoffMs: readonly number[];
  readonly sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_UNLOCK_PACING: UnlockPacing = {
  pollBackoffMs: [1_000, 2_000, 4_000, 8_000, 15_000, 30_000],
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

export interface CoinUnlockDeps {
  readonly api: UnlockApi;
  readonly bridge: PlatformBridge;
  readonly episodeId: string;
  readonly idempotencyKey: string;
  readonly pacing: UnlockPacing;
  readonly onStage: (stage: CoinUnlockStage) => void;
  /** True once the panel is gone. Checked before every wait so a closed panel stops costing timers. */
  readonly abandoned: () => boolean;
}

export async function runCoinUnlock(deps: CoinUnlockDeps): Promise<CoinUnlockOutcome> {
  deps.onStage('ORDERING');

  const created = await deps.api.createCoinOrder({
    episodeId: deps.episodeId,
    idempotencyKey: deps.idempotencyKey,
  });

  if (!created.ok) {
    return refusedOrder(created.error);
  }

  const order: CoinOrder = created.value;

  // A retry of an attempt that already completed: the same key returns the same order, and the
  // server has since granted it. Cheap to notice, and skipping a second trip through the payment
  // sheet for something already paid for is worth the one condition.
  if (order.unlockGranted) {
    return { kind: 'UNLOCKED' };
  }

  if (deps.abandoned()) {
    return { kind: 'ABANDONED' };
  }

  deps.onStage('PAYING');
  const paid = await deps.bridge.pay(order.payment.tradeOrderId);

  // A dismissed sheet is the one signal that says no charge happened, so it is the one failure that
  // does not get confirmed against the server. Polling for sixty seconds after the viewer said no
  // holds a panel open on a purchase they have already declined.
  if (!paid.ok && paid.error.code === 'BRIDGE_USER_CANCELLED') {
    return { kind: 'CANCELLED' };
  }

  if (deps.abandoned()) {
    return { kind: 'ABANDONED' };
  }

  deps.onStage('CONFIRMING');

  /**
   * A `pay` that reported an error still gets exactly one confirming read. The SDK is not the
   * authority on whether money moved — the verified callback is — and an adapter that returns
   * `BRIDGE_UNKNOWN` for a payment that actually succeeded would otherwise leave a charged viewer
   * looking at "payment failed". One read, not the full budget: there is no reason to wait sixty
   * seconds for a callback the platform has no reason to send.
   */
  const confirmation = await confirmOrder(
    deps,
    order.orderId,
    paid.ok ? deps.pacing.pollBackoffMs : [],
  );

  if (confirmation === 'ABANDONED') {
    return { kind: 'ABANDONED' };
  }
  if (confirmation === 'GRANTED') {
    return { kind: 'UNLOCKED' };
  }
  if (confirmation === 'PAID') {
    return { kind: 'AWAITING_UNLOCK', orderId: order.orderId };
  }
  if (confirmation === 'LOST') {
    // The order the viewer may have just paid against is not there any more. A retry would mint a
    // second payable order, so this one dead-ends deliberately.
    return { kind: 'FAILED', reason: 'ORDER_LOST', retry: 'NONE', failure: null };
  }

  return paid.ok
    ? { kind: 'FAILED', reason: 'PAYMENT_NOT_CONFIRMED', retry: 'SAME_KEY', failure: null }
    : { kind: 'FAILED', reason: payFailure(paid.error), retry: 'SAME_KEY', failure: null };
}

type Confirmation = 'GRANTED' | 'PAID' | 'PENDING' | 'LOST' | 'ABANDONED';

/**
 * Reads the order until it says something final or the budget runs out.
 *
 * A failed poll does not end the loop. The payment is in flight either way, and one unanswered read
 * says nothing about it — giving up on the first timeout would report "payment failed" to a viewer
 * whose money is on its way. The exception is `PAYMENT_ORDER_NOT_FOUND`, which is not a transient
 * answer: the order is gone, and no amount of asking again will bring it back.
 */
async function confirmOrder(
  deps: CoinUnlockDeps,
  orderId: string,
  backoffMs: readonly number[],
): Promise<Confirmation> {
  let charged = false;

  for (let attempt = 0; ; attempt += 1) {
    if (deps.abandoned()) {
      return 'ABANDONED';
    }

    const read = await deps.api.fetchCoinOrder(orderId);

    if (read.ok) {
      if (read.value.unlockGranted) {
        return 'GRANTED';
      }
      // `FULFILLED` without a grant is a server-side bookkeeping failure, and it is read here as
      // "charged, not granted" for the same reason as `PAID`: the one field that means the episode
      // was bought said it was not.
      charged = read.value.status !== 'PENDING';
    } else if (read.error.code === 'PAYMENT_ORDER_NOT_FOUND') {
      return 'LOST';
    }

    const delay = backoffMs[attempt];
    if (delay === undefined) {
      return charged ? 'PAID' : 'PENDING';
    }

    await deps.pacing.sleep(delay);
  }
}

/**
 * Why the order was not opened.
 *
 * The server's error code is read before the status is classified, because the two disagree on the
 * cases that matter most. `409 UNLOCK_ALREADY_UNLOCKED` is a *success* and classifies as a terminal
 * rejection; `422 UNLOCK_POLICY_NOT_ALLOWED` is a stale offer and classifies the same way. Reading
 * the status first would collapse both into "we could not load this", which is the copy that tells
 * a viewer nothing about an episode they already own.
 */
function refusedOrder(failure: ApiFailure): CoinUnlockOutcome {
  switch (failure.code) {
    case 'UNLOCK_ALREADY_UNLOCKED':
      return { kind: 'ALREADY_UNLOCKED' };
    case 'UNLOCK_POLICY_NOT_ALLOWED':
      return { kind: 'FAILED', reason: 'NOT_FOR_SALE', retry: 'NONE', failure };
    case 'AUTH_REQUIRED':
    case 'AUTH_TOKEN_EXPIRED':
      return { kind: 'FAILED', reason: 'SIGN_IN_REQUIRED', retry: 'NONE', failure };
    case 'CONTENT_NOT_FOUND':
    case 'CONTENT_OFFLINE':
      return { kind: 'FAILED', reason: 'EPISODE_GONE', retry: 'NONE', failure };
    case 'PAYMENT_CHANNEL_UNAVAILABLE':
      return { kind: 'FAILED', reason: 'PAYMENT_UNAVAILABLE', retry: 'SAME_KEY', failure };
    case 'COMMON_IDEMPOTENCY_CONFLICT':
    case 'COMMON_IDEMPOTENCY_KEY_REQUIRED':
      return { kind: 'FAILED', reason: 'ORDER_CONFLICT', retry: 'FRESH_KEY', failure };
    default:
      // Nothing was created, so nothing can have been charged, and the same key stays valid.
      return classifyFailure(failure).kind === 'RETRYABLE'
        ? { kind: 'FAILED', reason: 'UNREACHABLE', retry: 'SAME_KEY', failure }
        : { kind: 'FAILED', reason: 'REFUSED', retry: 'NONE', failure };
  }
}

function payFailure(error: BridgeError): CoinUnlockFailure {
  return error.code === 'BRIDGE_UNSUPPORTED' || error.code === 'BRIDGE_NOT_READY'
    ? 'PAYMENT_UNAVAILABLE'
    : 'PAYMENT_FAILED';
}
