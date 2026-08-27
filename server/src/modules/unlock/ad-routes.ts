import type { ApiErrorCode } from '@minidrama/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createAdUnlockSession, newAdSessionId } from './ad-sessions.js';
import { defaultAdUnlockPolicy } from './ad-unlock-policy.js';
import { decideEpisodeAccess } from '../entitlement/access.js';
import { errorBody } from '../../core/errors.js';
import { redeemAdUnlock } from './ad-grant.js';
import type { AdCompletionVerifier } from './ad-completion.js';
import type { AdGrant } from './ad-grant.js';
import type { AdRewardLogStore } from './ad-reward-log.js';
import type { AdUnlockPolicy } from './ad-unlock-policy.js';
import type { AdUnlockSessionStore } from './ad-session-store.js';
import type { EntitlementFactsPort, EpisodeAccessFactsFailure } from '../entitlement/facts-port.js';
import type { UnavailableCause } from '../entitlement/access.js';
import type { Unlock } from './unlocks.js';
import type { UnlockStore } from './unlock-store.js';
import type { ViewerResolutionFailure, ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * Ad unlock — mint a one-use nonce, then redeem it only after the completion verifier agrees.
 *
 * ```
 * POST /v1/unlock/ad-sessions  -> 201 { sessionId, episodeId }
 * POST /v1/unlock/ad-grants    -> 200 { unlock, quota } | 4xx
 * ```
 *
 * The client event is not a grant. `isEnded: true` on the grant body is an input to
 * `AdCompletionVerifier`. A skipped view still consumes the nonce. GATE-4 unit ids are not a
 * field: this API does not catalogue placements.
 */

interface CreateAdSessionBody {
  readonly episodeId?: unknown;
}

interface CreateAdGrantBody {
  readonly sessionId?: unknown;
  readonly isEnded?: unknown;
}

export interface AdUnlockRouteOptions {
  readonly factsPort: EntitlementFactsPort;
  readonly viewerResolver: ViewerResolver;
  readonly sessionStore: AdUnlockSessionStore;
  readonly logStore: AdRewardLogStore;
  readonly unlockStore: UnlockStore;
  readonly verifier: AdCompletionVerifier;
  readonly policy?: AdUnlockPolicy;
  readonly now: () => number;
}

interface ErrorMapping {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly ours?: true;
}

export const AD_SESSIONS_PATH = '/v1/unlock/ad-sessions';
export const AD_GRANTS_PATH = '/v1/unlock/ad-grants';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

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

const NOT_FOR_SALE: Record<'ALREADY_UNLOCKED' | 'POLICY', ErrorMapping> = {
  ALREADY_UNLOCKED: {
    status: 409,
    code: 'UNLOCK_ALREADY_UNLOCKED',
    message: 'This episode is already unlocked',
  },
  POLICY: {
    status: 422,
    code: 'UNLOCK_POLICY_NOT_ALLOWED',
    message: 'This episode cannot be unlocked with an ad',
  },
};

const SESSION_NOT_FOUND: ErrorMapping = {
  status: 404,
  code: 'COMMON_RESOURCE_NOT_FOUND',
  message: 'No such ad session',
};

const AD_NOT_COMPLETED: ErrorMapping = {
  status: 422,
  code: 'AD_NOT_COMPLETED',
  message: 'The ad was not watched to the end',
};

const AD_QUOTA_EXCEEDED: ErrorMapping = {
  status: 429,
  code: 'AD_QUOTA_EXCEEDED',
  message: 'The daily ad-unlock limit has been reached',
};

const AD_UNAVAILABLE: ErrorMapping = {
  status: 503,
  code: 'AD_UNAVAILABLE',
  message: 'Ad unlock is not available right now',
  ours: true,
};

export async function adUnlockRoutes(
  app: FastifyInstance,
  options: AdUnlockRouteOptions,
): Promise<void> {
  const policy = options.policy ?? defaultAdUnlockPolicy();

  function send(
    request: FastifyRequest,
    reply: FastifyReply,
    mapping: ErrorMapping,
    details?: Readonly<Record<string, unknown>>,
  ) {
    if (mapping.ours === true) {
      request.log.error({ code: mapping.code }, 'ad unlock refused');
    }

    return reply
      .status(mapping.status)
      .send(errorBody(mapping.code, mapping.message, request.id, details));
  }

  app.post(AD_SESSIONS_PATH, async (request, reply) => {
    const body = request.body as CreateAdSessionBody | undefined;
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
    if (viewerId.value === null) {
      return send(request, reply, ANONYMOUS_DENIAL, { episodeId });
    }

    const userId = viewerId.value;
    const replayed = await options.sessionStore.findByIdempotencyKey(userId, idempotencyKey);
    if (replayed !== undefined) {
      if (replayed.episodeId !== episodeId) {
        return send(request, reply, IDEMPOTENCY_CONFLICT, { idempotencyKey });
      }
      return reply.status(201).send(sessionView(replayed));
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

    const notForSale = refusalToOfferAd(access);
    if (notForSale !== null) {
      return send(request, reply, notForSale, {
        episodeId: facts.value.episode.id,
        unlockPolicy: facts.value.episode.unlockPolicy,
        reason: access.reason,
      });
    }

    const created = await options.sessionStore.create(
      createAdUnlockSession({
        id: newAdSessionId(),
        userId,
        episodeId: facts.value.episode.id,
        dramaId: facts.value.drama.id,
        idempotencyKey,
        createdAtMs: options.now(),
      }),
    );

    if (!created.ok) {
      return created.error === 'IDEMPOTENCY_CONFLICT'
        ? send(request, reply, IDEMPOTENCY_CONFLICT, { idempotencyKey })
        : send(request, reply, AD_UNAVAILABLE, { episodeId: facts.value.episode.id });
    }

    return reply.status(201).send(sessionView(created.value));
  });

  app.post(AD_GRANTS_PATH, async (request, reply) => {
    const body = request.body as CreateAdGrantBody | undefined;
    const sessionId = body?.sessionId;

    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'sessionId is required', request.id, {
          fields: [{ field: 'sessionId', reason: 'required' }],
        }),
      );
    }

    const viewerId = options.viewerResolver.resolve(request.headers.authorization);
    if (!viewerId.ok) {
      return send(request, reply, VIEWER_FAILURES[viewerId.error]);
    }
    if (viewerId.value === null) {
      return send(request, reply, ANONYMOUS_DENIAL);
    }

    const session = await options.sessionStore.get(sessionId);
    if (session === undefined || session.userId !== viewerId.value) {
      return send(request, reply, SESSION_NOT_FOUND, { sessionId });
    }

    const facts = await options.factsPort.loadEpisodeAccessFacts({
      episodeId: session.episodeId,
      viewerId: viewerId.value,
    });
    if (!facts.ok) {
      return send(request, reply, FACTS_FAILURES[facts.error]);
    }

    const access = decideEpisodeAccess({ ...facts.value, nowMs: options.now() });
    const granted = await redeemAdUnlock({
      sessionStore: options.sessionStore,
      logStore: options.logStore,
      unlockStore: options.unlockStore,
      verifier: options.verifier,
      policy,
      session,
      access,
      isEnded: body?.isEnded,
      atMs: options.now(),
    });

    return sendGrant(request, reply, granted);
  });
}

function sendGrant(
  request: FastifyRequest,
  reply: FastifyReply,
  granted: AdGrant,
): FastifyReply {
  switch (granted.status) {
    case 'GRANTED':
    case 'ALREADY_GRANTED':
      return reply.status(200).send({
        unlock: unlockView(granted.unlock),
        quota: granted.quota,
      });
    case 'NOT_COMPLETED':
      return reply
        .status(AD_NOT_COMPLETED.status)
        .send(errorBody(AD_NOT_COMPLETED.code, AD_NOT_COMPLETED.message, request.id));
    case 'QUOTA_EXCEEDED':
      return reply.status(AD_QUOTA_EXCEEDED.status).send(
        errorBody(AD_QUOTA_EXCEEDED.code, AD_QUOTA_EXCEEDED.message, request.id, {
          usedToday: granted.quota.usedToday,
          dailyLimit: granted.quota.dailyLimit,
        }),
      );
    case 'NOT_FOR_SALE':
      return reply
        .status(NOT_FOR_SALE.POLICY.status)
        .send(errorBody(NOT_FOR_SALE.POLICY.code, NOT_FOR_SALE.POLICY.message, request.id));
    case 'ALREADY_UNLOCKED':
      return reply
        .status(NOT_FOR_SALE.ALREADY_UNLOCKED.status)
        .send(
          errorBody(
            NOT_FOR_SALE.ALREADY_UNLOCKED.code,
            NOT_FOR_SALE.ALREADY_UNLOCKED.message,
            request.id,
          ),
        );
    case 'SESSION_NOT_FOUND':
      return reply
        .status(SESSION_NOT_FOUND.status)
        .send(errorBody(SESSION_NOT_FOUND.code, SESSION_NOT_FOUND.message, request.id));
    case 'INCOMPLETE':
      return reply
        .status(AD_UNAVAILABLE.status)
        .send(errorBody(AD_UNAVAILABLE.code, AD_UNAVAILABLE.message, request.id));
  }
}

function refusalToOfferAd(access: ReturnType<typeof decideEpisodeAccess>): ErrorMapping | null {
  if (access.reason === 'UNLOCKED') return NOT_FOR_SALE.ALREADY_UNLOCKED;
  if (access.playable) return NOT_FOR_SALE.POLICY;
  return access.unlockOptions.includes('COINS') ? null : NOT_FOR_SALE.POLICY;
}

function readIdempotencyKey(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const key = header.trim();
  if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;
  return /[\s,]/.test(key) ? null : key;
}

function sessionView(session: { readonly id: string; readonly episodeId: string }) {
  return { sessionId: session.id, episodeId: session.episodeId };
}

function unlockView(unlock: Unlock): Record<string, unknown> {
  return {
    id: unlock.id,
    episodeId: unlock.episodeId,
    method: unlock.method,
    costCoins: unlock.costCoins,
  };
}
