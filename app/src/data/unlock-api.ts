import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure } from './failure';
import type { ApiFailure } from './failure';
import type { HttpPoster, HttpReader, PostOptions } from './http';

/**
 * The coin unlock order surface, as the client sees it.
 *
 * Two operations, both on `cursor/w2-work-k-6bb5`. `POST /v1/unlock/coin-orders` records that this
 * viewer wants to buy this episode and answers with the platform trade order they pay against;
 * `GET /v1/unlock/coin-orders/{orderId}` reports where that order got to.
 *
 * The shapes below are transcribed from that branch's `orderView` rather than merged from it, so
 * this slot does not drag a server module into a client diff while an integrator is in flight. The
 * transcription is deliberately narrow — it is a wire shape, not a re-export of the server's
 * `UnlockOrder`, which carries a `userId`, an idempotency key and internal timestamps the client
 * has no business holding.
 *
 * Three properties of the API decide the shape of everything downstream:
 *
 * 1. **Creating an order grants nothing.** The `201` records an intent. The same viewer asking
 *    about the same episode a millisecond later still gets `NEED_UNLOCK`.
 * 2. **Only a verified TikTok callback can move an order.** No request the client can make — a
 *    second creation, a poll, a retry with the same key — advances a status. So there is no
 *    client-side "mark it paid", and this module offers no way to write one.
 * 3. **`unlockGranted` is the only field that means the episode was bought.** `status: PAID` means
 *    the viewer was charged and says nothing about whether the episode is playable; today it never
 *    becomes playable, because writing the unlock row is a later slot's work. A client that read
 *    access off `status` would show a locked episode as unlocked, which is why `status` and
 *    `unlockGranted` are kept as two fields here rather than collapsed into one.
 *
 * The authority on playability remains the catalogue's `viewerAccess`. Nothing in this file is an
 * entitlement.
 */

export const COIN_ORDERS_PATH = '/v1/unlock/coin-orders';
export const AD_SESSIONS_PATH = '/v1/unlock/ad-sessions';
export const AD_GRANTS_PATH = '/v1/unlock/ad-grants';

export function coinOrderEndpoint(orderId: string): string {
  return `${COIN_ORDERS_PATH}/${encodeURIComponent(orderId)}`;
}

/**
 * `PENDING` → `PAID` → `FULFILLED`, as the server's transition table allows them. The client only
 * ever reads these, and reads them for progress reporting rather than for access.
 */
export const COIN_ORDER_STATUSES = ['PENDING', 'PAID', 'FULFILLED'] as const;

export type CoinOrderStatus = (typeof COIN_ORDER_STATUSES)[number];

export interface CoinOrder {
  readonly orderId: string;
  readonly status: CoinOrderStatus;
  readonly episodeId: string;
  /** What the server quoted and froze onto the order. Never a number the client sent. */
  readonly priceCoins: number;
  /** The one field that means the episode was actually bought. See §3 above. */
  readonly unlockGranted: boolean;
  readonly payment: {
    readonly provider: string;
    /** Handed to `PlatformBridge.pay`. No amount or wallet reference passes through this API. */
    readonly tradeOrderId: string;
  };
}

export interface CreateCoinOrderRequest {
  readonly episodeId: string;
  /**
   * One per purchase attempt, reused verbatim on every retry of that attempt. Reusing it is what
   * makes a retry return the first order instead of opening a second payment
   * (`docs/12-api-contracts.md` §2.4).
   */
  readonly idempotencyKey: string;
}

export const AD_PLACEMENTS = ['AFTER_EPISODE', 'MANUAL_SKIP'] as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export interface AdUnlockSession {
  readonly nonce: string;
  readonly adUnitId: string;
  readonly placement: AdPlacement;
  readonly episodeId: string;
}

export interface AdUnlockGrant {
  readonly unlock: {
    readonly id: string;
    readonly episodeId: string;
    readonly method: 'AD';
    readonly costCoins: 0;
  };
  readonly quota: {
    readonly usedToday: number;
    readonly dailyLimit: number;
  };
}

export interface CreateAdSessionRequest {
  readonly episodeId: string;
  readonly placement: AdPlacement;
}

export interface CreateAdGrantRequest {
  readonly episodeId: string;
  readonly nonce: string;
  readonly isEnded: boolean;
  readonly idempotencyKey: string;
}

export interface UnlockApi {
  createCoinOrder(request: CreateCoinOrderRequest): Promise<Result<CoinOrder, ApiFailure>>;
  fetchCoinOrder(orderId: string): Promise<Result<CoinOrder, ApiFailure>>;
  createAdSession(request: CreateAdSessionRequest): Promise<Result<AdUnlockSession, ApiFailure>>;
  grantAdUnlock(request: CreateAdGrantRequest): Promise<Result<AdUnlockGrant, ApiFailure>>;
}

export function createUnlockApi(http: HttpReader & HttpPoster): UnlockApi {
  return {
    createCoinOrder: async (request) => {
      const options: PostOptions = { headers: { 'Idempotency-Key': request.idempotencyKey } };
      // The body carries an episode id and nothing else. A price in a request body is a discount
      // coupon with no expiry date, and the server refuses one anyway.
      const body = await http.postJson(COIN_ORDERS_PATH, { episodeId: request.episodeId }, options);
      return body.ok ? narrowCoinOrder(body.value) : body;
    },

    fetchCoinOrder: async (orderId) => {
      const body = await http.getJson(coinOrderEndpoint(orderId));
      return body.ok ? narrowCoinOrder(body.value) : body;
    },

    createAdSession: async (request) => {
      const body = await http.postJson(AD_SESSIONS_PATH, {
        episodeId: request.episodeId,
        placement: request.placement,
      });
      return body.ok ? narrowAdSession(body.value) : body;
    },

    grantAdUnlock: async (request) => {
      const options: PostOptions = { headers: { 'Idempotency-Key': request.idempotencyKey } };
      const body = await http.postJson(
        AD_GRANTS_PATH,
        {
          episodeId: request.episodeId,
          nonce: request.nonce,
          isEnded: request.isEnded,
        },
        options,
      );
      return body.ok ? narrowAdGrant(body.value) : body;
    },
  };
}

/**
 * A `2xx` whose body is not the documented shape is a failure, not a value — the same rule the
 * catalogue reads follow, and it matters more here. The two fields that drive a decision are
 * `payment.tradeOrderId`, which is what the viewer is about to pay against, and `unlockGranted`,
 * which is what says they bought something. Both are checked for their exact type.
 *
 * `unlockGranted` in particular is never defaulted. An absent field read as `false` would be
 * tolerable and an absent field read as truthy would hand over an episode, so a body missing it is
 * rejected outright rather than interpreted.
 */
function narrowCoinOrder(value: unknown): Result<CoinOrder, ApiFailure> {
  const record = asRecord(value);
  const payment = asRecord(record?.['payment']);

  if (
    record === null ||
    payment === null ||
    typeof record['orderId'] !== 'string' ||
    typeof record['episodeId'] !== 'string' ||
    typeof record['priceCoins'] !== 'number' ||
    typeof record['unlockGranted'] !== 'boolean' ||
    typeof payment['tradeOrderId'] !== 'string' ||
    payment['tradeOrderId'] === '' ||
    !isCoinOrderStatus(record['status'])
  ) {
    return err(apiFailure({ kind: 'MALFORMED', message: 'the response was not a coin order' }));
  }

  return ok(value as CoinOrder);
}

function isCoinOrderStatus(value: unknown): value is CoinOrderStatus {
  return typeof value === 'string' && (COIN_ORDER_STATUSES as readonly string[]).includes(value);
}

function isAdPlacement(value: unknown): value is AdPlacement {
  return typeof value === 'string' && (AD_PLACEMENTS as readonly string[]).includes(value);
}

function narrowAdSession(value: unknown): Result<AdUnlockSession, ApiFailure> {
  const record = asRecord(value);
  if (
    record === null ||
    typeof record['nonce'] !== 'string' ||
    record['nonce'] === '' ||
    typeof record['adUnitId'] !== 'string' ||
    record['adUnitId'] === '' ||
    typeof record['episodeId'] !== 'string' ||
    !isAdPlacement(record['placement'])
  ) {
    return err(apiFailure({ kind: 'MALFORMED', message: 'the response was not an ad session' }));
  }

  return ok({
    nonce: record['nonce'],
    adUnitId: record['adUnitId'],
    placement: record['placement'],
    episodeId: record['episodeId'],
  });
}

function narrowAdGrant(value: unknown): Result<AdUnlockGrant, ApiFailure> {
  const record = asRecord(value);
  const unlock = asRecord(record?.['unlock']);
  const quota = asRecord(record?.['quota']);

  if (
    record === null ||
    unlock === null ||
    quota === null ||
    typeof unlock['id'] !== 'string' ||
    typeof unlock['episodeId'] !== 'string' ||
    unlock['method'] !== 'AD' ||
    unlock['costCoins'] !== 0 ||
    typeof quota['usedToday'] !== 'number' ||
    typeof quota['dailyLimit'] !== 'number'
  ) {
    return err(apiFailure({ kind: 'MALFORMED', message: 'the response was not an ad grant' }));
  }

  return ok({
    unlock: {
      id: unlock['id'],
      episodeId: unlock['episodeId'],
      method: 'AD',
      costCoins: 0,
    },
    quota: { usedToday: quota['usedToday'], dailyLimit: quota['dailyLimit'] },
  });
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
