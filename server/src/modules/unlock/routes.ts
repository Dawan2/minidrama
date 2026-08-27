import type { ApiErrorCode } from '@minidrama/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createUnlockOrder, newUnlockOrderId, unlockOrderGranted } from './orders.js';
import { decideEpisodeAccess } from '../entitlement/access.js';
import { errorBody } from '../../core/errors.js';
import type { EntitlementFactsPort, EpisodeAccessFactsFailure } from '../entitlement/facts-port.js';
import type { EpisodeAccess, UnavailableCause } from '../entitlement/access.js';
import type { PlatformTradeOrderPort } from './trade-order-port.js';
import type { UnlockOrder } from './orders.js';
import type { UnlockOrderStore } from './order-store.js';
import type { ViewerResolutionFailure, ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * Coin unlock orders — the *intent* to buy an episode, and the state of that intent.
 *
 * `POST /v1/unlock/coin-orders` writes a `PENDING` order and hands back the platform trade order the
 * client passes to `TTMinis.pay`. `GET /v1/unlock/coin-orders/{orderId}` reports where that order
 * got to. Neither endpoint unlocks anything, and there is no third endpoint that does:
 *
 *   - **creating an order grants nothing.** The `201` says an intent was recorded, and the same
 *     viewer asking `POST /v1/entitlement/episode-access` about the same episode a millisecond later
 *     still gets `NEED_UNLOCK`. Nothing in this module writes an unlock row, a wallet transaction or
 *     a VIP record;
 *   - **only a verified webhook moves an order.** `PENDING → PAID` exists solely as the
 *     `PAYMENT_VERIFIED` transition, whose only caller is the payment sink, whose only caller is the
 *     TikTok callback after the HMAC matched (`modules/platform-tiktok/routes.ts`). No request to
 *     this module — including a second creation, a poll, or a retry with the same idempotency key —
 *     can advance an order's status;
 *   - **the price is the server's.** The request body carries an episode id and nothing else. The
 *     amount is the one `decideEpisodeAccess` quoted for this viewer at this moment, frozen onto the
 *     order, so the charge is the number the viewer was shown and never a number they sent.
 *
 * The entitlement rules are not re-derived here. This module asks the same pure function the
 * decision endpoint and the playback endpoint ask, through the same facts port instance, and uses
 * the verdict for one thing only: deciding whether there is anything to sell.
 */

interface CreateCoinOrderBody {
  readonly episodeId?: unknown;
}

export interface UnlockRouteOptions {
  readonly factsPort: EntitlementFactsPort;
  readonly viewerResolver: ViewerResolver;
  readonly orderStore: UnlockOrderStore;
  readonly tradeOrderPort: PlatformTradeOrderPort;
  readonly now: () => number;
}

interface ErrorMapping {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  /** Ours to fix rather than the caller's, so it is logged at error level. */
  readonly ours?: true;
}

export const COIN_ORDERS_PATH = '/v1/unlock/coin-orders';

/** `docs/12-api-contracts.md` §2.4: every unlock write carries one. */
const IDEMPOTENCY_HEADER = 'idempotency-key';
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

/** Identical to the entitlement and playback tables on purpose (`docs/handoff/w2-work-i.md` S43). */
const VIEWER_FAILURES: Record<ViewerResolutionFailure, ErrorMapping> = {
  SESSION_REJECTED: {
    status: 401,
    code: 'AUTH_REQUIRED',
    message: 'The session credential was rejected',
  },
  SESSION_UNRESOLVABLE: {
    status: 503,
    code: 'COMMON_SERVICE_UNAVAILABLE',
    message: 'Sessions cannot be resolved',
    ours: true,
  },
};

const FACTS_FAILURES: Record<EpisodeAccessFactsFailure, ErrorMapping> = {
  EPISODE_NOT_FOUND: { status: 404, code: 'CONTENT_NOT_FOUND', message: 'No such episode' },
  VIEWER_NOT_FOUND: { status: 401, code: 'AUTH_REQUIRED', message: 'The session is not valid' },
  FACTS_UNAVAILABLE: {
    status: 503,
    code: 'COMMON_SERVICE_UNAVAILABLE',
    message: 'Entitlement facts are not available',
    ours: true,
  },
};

const UNAVAILABLE_CAUSES: Record<UnavailableCause, ErrorMapping> = {
  NOT_PUBLISHED: { status: 404, code: 'CONTENT_NOT_FOUND', message: 'No such episode' },
  WITHDRAWN: { status: 410, code: 'CONTENT_OFFLINE', message: 'This episode has been withdrawn' },
  MISCONFIGURED_PRICE: {
    status: 503,
    code: 'COMMON_SERVICE_UNAVAILABLE',
    message: 'This episode is temporarily unavailable',
    ours: true,
  },
};

/**
 * An episode the viewer can already watch has nothing to sell, and selling it anyway is how a
 * subscriber gets charged for content their subscription already covers.
 * `docs/12-error-catalog.md` §6 separates the two cases the client renders differently: the
 * episode is already owned, or the policy does not permit buying it at all.
 */
const NOT_FOR_SALE: Record<'ALREADY_UNLOCKED' | 'POLICY', ErrorMapping> = {
  ALREADY_UNLOCKED: {
    status: 409,
    code: 'UNLOCK_ALREADY_UNLOCKED',
    message: 'This episode is already unlocked',
  },
  POLICY: {
    status: 422,
    code: 'UNLOCK_POLICY_NOT_ALLOWED',
    message: 'This episode cannot be unlocked with coins',
  },
};

const ANONYMOUS_DENIAL: ErrorMapping = {
  status: 401,
  code: 'AUTH_REQUIRED',
  message: 'Sign in to unlock this episode',
};

const IDEMPOTENCY_KEY_REQUIRED: ErrorMapping = {
  status: 400,
  code: 'COMMON_IDEMPOTENCY_KEY_REQUIRED',
  message: 'Idempotency-Key is required',
};

const IDEMPOTENCY_CONFLICT: ErrorMapping = {
  status: 409,
  code: 'COMMON_IDEMPOTENCY_CONFLICT',
  message: 'This Idempotency-Key was used for a different request',
};

const TRADE_ORDER_UNAVAILABLE: ErrorMapping = {
  status: 503,
  code: 'PAYMENT_CHANNEL_UNAVAILABLE',
  message: 'Payments are not available right now',
  ours: true,
};

const ORDER_NOT_FOUND: ErrorMapping = {
  status: 404,
  code: 'PAYMENT_ORDER_NOT_FOUND',
  message: 'No such order',
};

/**
 * A paid episode with no usable price never reaches here — `decideEpisodeAccess` reports it as
 * `MISCONFIGURED_PRICE` first — but the quote is typed `number | null`, and the one place that must
 * not treat a missing price as free is the place about to charge it.
 */
const UNQUOTABLE_PRICE: ErrorMapping = {
  status: 503,
  code: 'COMMON_SERVICE_UNAVAILABLE',
  message: 'This episode is temporarily unavailable',
  ours: true,
};

export async function unlockRoutes(
  app: FastifyInstance,
  options: UnlockRouteOptions,
): Promise<void> {
  function send(
    request: FastifyRequest,
    reply: FastifyReply,
    mapping: ErrorMapping,
    details?: Readonly<Record<string, unknown>>,
  ) {
    if (mapping.ours === true) {
      request.log.error({ code: mapping.code }, 'coin unlock order not created');
    }

    return reply
      .status(mapping.status)
      .send(errorBody(mapping.code, mapping.message, request.id, details));
  }

  app.post(COIN_ORDERS_PATH, async (request, reply) => {
    const body = request.body as CreateCoinOrderBody | undefined;
    const episodeId = body?.episodeId;

    if (typeof episodeId !== 'string' || episodeId.length === 0) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'episodeId is required', request.id, {
          fields: [{ field: 'episodeId', reason: 'required' }],
        }),
      );
    }

    const idempotencyKey = readIdempotencyKey(request.headers[IDEMPOTENCY_HEADER]);
    if (idempotencyKey === null) {
      return send(request, reply, IDEMPOTENCY_KEY_REQUIRED);
    }

    const viewerId = options.viewerResolver.resolve(request.headers.authorization);
    if (!viewerId.ok) {
      return send(request, reply, VIEWER_FAILURES[viewerId.error]);
    }

    // An order has to belong to an account: it is what a payment is attributed to and what an
    // eventual unlock is recorded against. Quoting a price to a viewer with neither asks them to
    // solve the second problem before the first (`docs/handoff/w2-work-i.md` §3.3).
    if (viewerId.value === null) {
      return send(request, reply, ANONYMOUS_DENIAL, { episodeId });
    }

    const userId = viewerId.value;

    // Before anything with a side effect, including the platform trade order. A retried creation
    // must return the first order rather than mint a second thing to pay for.
    const replayed = await options.orderStore.findByIdempotencyKey(userId, idempotencyKey);
    if (replayed !== undefined) {
      if (replayed.episodeId !== episodeId) {
        return send(request, reply, IDEMPOTENCY_CONFLICT, { idempotencyKey });
      }

      return reply.status(201).send(orderView(replayed));
    }

    const facts = await options.factsPort.loadEpisodeAccessFacts({ episodeId, viewerId: userId });
    if (!facts.ok) {
      return send(
        request,
        reply,
        FACTS_FAILURES[facts.error],
        facts.error === 'EPISODE_NOT_FOUND'
          ? { resourceType: 'EPISODE', resourceId: episodeId }
          : undefined,
      );
    }

    const access = decideEpisodeAccess({ ...facts.value, nowMs: options.now() });

    if (access.unavailableCause !== null) {
      return send(request, reply, UNAVAILABLE_CAUSES[access.unavailableCause], {
        resourceType: 'EPISODE',
        resourceId: facts.value.episode.id,
      });
    }

    // The single gate on whether there is anything to sell. Coins are for sale exactly when the
    // decision function refused the episode *and* offered coins as the remedy — which excludes free
    // episodes, episodes the viewer already owns, episodes their subscription covers, and VIP-only
    // episodes that no amount of coins can open.
    const notForSale = refusalToSell(access);
    if (notForSale !== null) {
      return send(request, reply, notForSale, {
        episodeId: facts.value.episode.id,
        unlockPolicy: facts.value.episode.unlockPolicy,
        reason: access.reason,
      });
    }

    const priceCoins = access.priceCoins;
    if (priceCoins === null || !Number.isInteger(priceCoins) || priceCoins <= 0) {
      return send(request, reply, UNQUOTABLE_PRICE, { episodeId: facts.value.episode.id });
    }

    // The id is minted before the platform call so the trade order can carry it: an order and its
    // payment that cannot be joined from either side is a reconciliation problem the moment the
    // first callback goes missing.
    const orderId = newUnlockOrderId();
    const tradeOrder = await options.tradeOrderPort.createTradeOrder({
      orderId,
      userId,
      episodeId: facts.value.episode.id,
      priceCoins,
    });

    if (!tradeOrder.ok) {
      return send(request, reply, TRADE_ORDER_UNAVAILABLE, { episodeId: facts.value.episode.id });
    }

    const created = await options.orderStore.create(
      createUnlockOrder({
        id: orderId,
        userId,
        episodeId: facts.value.episode.id,
        dramaId: facts.value.drama.id,
        priceCoins,
        tradeOrderId: tradeOrder.value.tradeOrderId,
        idempotencyKey,
        createdAtMs: options.now(),
      }),
    );

    if (!created.ok) {
      // `IDEMPOTENCY_CONFLICT`: the key was claimed between the lookup above and here, and the
      // concurrent duplicate must not become a second thing the viewer can pay for.
      // `TRADE_ORDER_TAKEN`: the platform handed us an identifier another order already holds, so
      // the callback could not tell the two apart. Neither order is written.
      return created.error === 'IDEMPOTENCY_CONFLICT'
        ? send(request, reply, IDEMPOTENCY_CONFLICT, { idempotencyKey })
        : send(request, reply, TRADE_ORDER_UNAVAILABLE, { episodeId: facts.value.episode.id });
    }

    request.log.info(
      { orderId: created.value.id, episodeId: created.value.episodeId, priceCoins },
      'coin unlock order created',
    );

    return reply.status(201).send(orderView(created.value));
  });

  app.get<{ Params: { orderId: string } }>(
    `${COIN_ORDERS_PATH}/:orderId`,
    async (request, reply) => {
      const viewerId = options.viewerResolver.resolve(request.headers.authorization);
      if (!viewerId.ok) {
        return send(request, reply, VIEWER_FAILURES[viewerId.error]);
      }
      if (viewerId.value === null) {
        return send(request, reply, ANONYMOUS_DENIAL);
      }

      const order = await options.orderStore.get(request.params.orderId);

      // An order belonging to somebody else is reported as absent, not as forbidden. A `403` would
      // confirm that an id exists and whose it is not, which is enough to enumerate orders.
      if (order === undefined || order.userId !== viewerId.value) {
        return send(request, reply, ORDER_NOT_FOUND, { orderId: request.params.orderId });
      }

      return reply.status(200).send(orderView(order));
    },
  );
}

/**
 * An `Idempotency-Key` is a single opaque token, so anything with a comma or whitespace in it is
 * refused rather than trimmed into shape. That is mostly one case: Node joins a repeated header
 * into `key-a, key-b`, and accepting the join would deduplicate two requests on a value neither of
 * them sent — which reverses when the client happens to emit the two headers in the other order.
 */
function readIdempotencyKey(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;

  const key = header.trim();
  if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;

  return /[\s,]/.test(key) ? null : key;
}

/**
 * Why this episode is not for sale to this viewer, or `null` when it is.
 *
 * Refusing is the default and selling is the exception: a verdict this function does not recognise
 * declines the sale, so a reason added to the vocabulary later cannot open a payment path nobody
 * has looked at.
 */
function refusalToSell(access: EpisodeAccess): ErrorMapping | null {
  if (access.reason === 'UNLOCKED') return NOT_FOR_SALE.ALREADY_UNLOCKED;
  if (access.playable) return NOT_FOR_SALE.POLICY;

  return access.unlockOptions.includes('COINS') ? null : NOT_FOR_SALE.POLICY;
}

/**
 * The client view of an order.
 *
 * `unlockGranted` is stated rather than implied, because "the order is paid" and "the episode is
 * unlocked" are two different facts and this slot only ever produces the first. A client that
 * inferred access from `status: PAID` would show a locked episode as playable; the field it must
 * read is this one, and the authority is still `POST /v1/entitlement/episode-access`.
 */
function orderView(order: UnlockOrder): Record<string, unknown> {
  return {
    orderId: order.id,
    status: order.status,
    episodeId: order.episodeId,
    priceCoins: order.priceCoins,
    unlockGranted: unlockOrderGranted(order),
    createdAt: new Date(order.createdAtMs).toISOString(),
    paidAt: order.paidAtMs === null ? null : new Date(order.paidAtMs).toISOString(),
    // What the client hands to `TTMinis.pay`. The money is charged by the platform; no amount, card
    // or wallet reference passes through this API.
    payment: { provider: 'TIKTOK', tradeOrderId: order.tradeOrderId },
  };
}
