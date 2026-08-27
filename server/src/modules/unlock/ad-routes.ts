import type { ApiErrorCode } from '@minidrama/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createAdUnlock, newUnlockId } from './unlocks.js';
import { decideEpisodeAccess } from '../entitlement/access.js';
import { errorBody } from '../../core/errors.js';
import { isAdPlacement, isUsableAdUnitId } from './ad-placement.js';
import { createReportedCompletionVerifier } from './ad-completion.js';
import { createInMemoryAdRewardLog } from './ad-reward-log.js';
import { createInMemoryAdSessionStore } from './ad-session-store.js';
import { DEFAULT_AD_PLACEMENT } from './ad-placement.js';
import type { AdCompletionVerifier } from './ad-completion.js';
import type { AdPlacementConfig } from './ad-placement.js';
import type { AdRewardLog } from './ad-reward-log.js';
import type { AdSessionStore } from './ad-session-store.js';
import type { EntitlementFactsPort, EpisodeAccessFactsFailure } from '../entitlement/facts-port.js';
import type { EpisodeAccess, UnavailableCause } from '../entitlement/access.js';
import type { UnlockStore } from './unlock-store.js';
import type { ViewerResolutionFailure, ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * Rewarded-ad unlock: a nonce for a permitted placement, then a grant gated on `isEnded`.
 *
 * ```
 * POST /v1/unlock/ad-sessions  -> 201 { nonce, adUnitId, placement, episodeId, expiresAt }
 * POST /v1/unlock/ad-grants    -> 200 { unlock, quota }   (Idempotency-Key required)
 * ```
 *
 * Creating a session grants nothing. Reporting `isEnded: true` grants nothing by itself: the
 * verifier, the nonce, the quota, and the entitlement decision all sit between the body and
 * the unlock row. A 200 with no `trade_order_id` is the C4-06 analogue here — a 200 whose
 * `isEnded` is true but whose nonce is missing still refuses.
 *
 * Ad-unit ids come from injected config. The default is `null` (GATE-4 unknown). This module
 * does not invent a Portal id, and it does not read `BEANS_RATE`.
 *
 * Interstitials are not this file. They do not unlock, so they have no grant endpoint.
 */

interface CreateAdSessionBody {
  readonly episodeId?: unknown;
  readonly placement?: unknown;
}

interface CreateAdGrantBody {
  readonly episodeId?: unknown;
  readonly nonce?: unknown;
  readonly isEnded?: unknown;
}

export interface AdRouteOptions {
  readonly factsPort: EntitlementFactsPort;
  readonly viewerResolver: ViewerResolver;
  readonly unlockStore: UnlockStore;
  readonly now: () => number;
  readonly placement?: AdPlacementConfig;
  readonly verifier?: AdCompletionVerifier;
  readonly sessions?: AdSessionStore;
  readonly rewardLog?: AdRewardLog;
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
const UTC_DAY_MS = 24 * 60 * 60 * 1000;

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

const AD_UNAVAILABLE: ErrorMapping = {
  status: 503,
  code: 'UNLOCK_AD_UNAVAILABLE',
  message: 'Rewarded ads are not available',
  ours: true,
};

const AD_NOT_COMPLETED: ErrorMapping = {
  status: 422,
  code: 'UNLOCK_AD_NOT_COMPLETED',
  message: 'The rewarded ad was not watched to the end',
};

const AD_QUOTA: ErrorMapping = {
  status: 429,
  code: 'UNLOCK_AD_QUOTA_EXCEEDED',
  message: 'Today’s ad-unlock allowance is used up',
};

const ALREADY_UNLOCKED: ErrorMapping = {
  status: 409,
  code: 'UNLOCK_ALREADY_UNLOCKED',
  message: 'This episode is already unlocked',
};

const POLICY: ErrorMapping = {
  status: 422,
  code: 'UNLOCK_POLICY_NOT_ALLOWED',
  message: 'This episode cannot be unlocked with an ad',
};

const NONCE_REFUSED: ErrorMapping = {
  status: 422,
  code: 'UNLOCK_POLICY_NOT_ALLOWED',
  message: 'This ad session cannot be used',
};

export async function adRoutes(app: FastifyInstance, options: AdRouteOptions): Promise<void> {
  const placement = options.placement ?? DEFAULT_AD_PLACEMENT;
  const verifier = options.verifier ?? createReportedCompletionVerifier();
  const sessions = options.sessions ?? createInMemoryAdSessionStore();
  const rewardLog = options.rewardLog ?? createInMemoryAdRewardLog();

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
    const answer = reply.header('cache-control', 'private, no-store');
    const body = request.body as CreateAdSessionBody | undefined;
    const episodeId = body?.episodeId;
    const requestedPlacement = body?.placement;

    if (typeof episodeId !== 'string' || episodeId.length === 0) {
      return answer.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'episodeId is required', request.id, {
          fields: [{ field: 'episodeId', reason: 'required' }],
        }),
      );
    }

    if (!isAdPlacement(requestedPlacement)) {
      return answer.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'placement is not a permitted slot', request.id, {
          fields: [{ field: 'placement', reason: 'AFTER_EPISODE or MANUAL_SKIP' }],
        }),
      );
    }

    const viewerId = options.viewerResolver.resolve(request.headers.authorization);
    if (!viewerId.ok) {
      return send(request, answer, VIEWER_FAILURES[viewerId.error]);
    }
    if (viewerId.value === null) {
      return send(request, answer, ANONYMOUS_DENIAL, { episodeId });
    }

    if (!isUsableAdUnitId(placement.rewardedAdUnitId)) {
      rewardLog.record({
        atMs: options.now(),
        userId: viewerId.value,
        episodeId,
        sessionId: '',
        isEndedReported: false,
        verdict: 'UNAVAILABLE',
      });
      return send(request, answer, AD_UNAVAILABLE, { episodeId });
    }

    const facts = await options.factsPort.loadEpisodeAccessFacts({
      episodeId,
      viewerId: viewerId.value,
    });
    if (!facts.ok) {
      return send(
        request,
        answer,
        FACTS_FAILURES[facts.error],
        facts.error === 'EPISODE_NOT_FOUND'
          ? { resourceType: 'EPISODE', resourceId: episodeId }
          : undefined,
      );
    }

    const access = decideEpisodeAccess({ ...facts.value, nowMs: options.now() });
    const notForAd = refusalToGrantAd(access);
    if (notForAd !== null) {
      return send(request, answer, notForAd, {
        episodeId: facts.value.episode.id,
        unlockPolicy: facts.value.episode.unlockPolicy,
        reason: access.reason,
      });
    }

    const session = sessions.issue({
      userId: viewerId.value,
      episodeId: facts.value.episode.id,
      dramaId: facts.value.drama.id,
      placement: requestedPlacement,
      adUnitId: placement.rewardedAdUnitId,
      atMs: options.now(),
      ttlMs: placement.sessionTtlMs,
    });

    return answer.status(201).send({
      nonce: session.nonce,
      adUnitId: session.adUnitId,
      placement: session.placement,
      episodeId: session.episodeId,
      expiresAt: new Date(session.expiresAtMs).toISOString(),
    });
  });

  app.post(AD_GRANTS_PATH, async (request, reply) => {
    const answer = reply.header('cache-control', 'private, no-store');
    const body = request.body as CreateAdGrantBody | undefined;
    const episodeId = body?.episodeId;
    const nonce = body?.nonce;
    const isEnded = body?.isEnded;

    if (typeof episodeId !== 'string' || episodeId.length === 0) {
      return answer.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'episodeId is required', request.id, {
          fields: [{ field: 'episodeId', reason: 'required' }],
        }),
      );
    }

    if (typeof nonce !== 'string' || nonce.length === 0) {
      return answer.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'nonce is required', request.id, {
          fields: [{ field: 'nonce', reason: 'required' }],
        }),
      );
    }

    if (typeof isEnded !== 'boolean') {
      return answer.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'isEnded must be a boolean', request.id, {
          fields: [{ field: 'isEnded', reason: 'boolean' }],
        }),
      );
    }

    const idempotencyKey = readIdempotencyKey(request.headers[IDEMPOTENCY_HEADER]);
    if (idempotencyKey === null) {
      return send(request, answer, IDEMPOTENCY_KEY_REQUIRED);
    }

    const viewerId = options.viewerResolver.resolve(request.headers.authorization);
    if (!viewerId.ok) {
      return send(request, answer, VIEWER_FAILURES[viewerId.error]);
    }
    if (viewerId.value === null) {
      return send(request, answer, ANONYMOUS_DENIAL, { episodeId });
    }

    const userId = viewerId.value;

    const replayed = sessions.findGrant(userId, idempotencyKey);
    if (replayed !== undefined) {
      if (replayed.episodeId !== episodeId) {
        return send(request, answer, IDEMPOTENCY_CONFLICT, { idempotencyKey });
      }
      return answer.status(replayed.status).send(replayed.body);
    }

    const session = sessions.findByNonce(nonce);
    if (
      session === undefined ||
      session.consumed ||
      session.userId !== userId ||
      session.episodeId !== episodeId ||
      session.expiresAtMs <= options.now()
    ) {
      rewardLog.record({
        atMs: options.now(),
        userId,
        episodeId,
        sessionId: session?.id ?? '',
        isEndedReported: isEnded,
        verdict: 'REFUSED',
      });
      return send(request, answer, NONCE_REFUSED, { episodeId });
    }

    // Consume before the verdict so a skipped view cannot be retried as a completion on the
    // same nonce. A new session is a new instance, which is the platform's own rule.
    sessions.consume(nonce);

    const verdict = verifier.verify({ isEnded });
    if (verdict !== 'COMPLETED') {
      rewardLog.record({
        atMs: options.now(),
        userId,
        episodeId,
        sessionId: session.id,
        isEndedReported: isEnded,
        verdict: 'NOT_COMPLETED',
      });
      const bodyOut = errorBody(AD_NOT_COMPLETED.code, AD_NOT_COMPLETED.message, request.id, {
        episodeId,
      });
      sessions.rememberGrant(userId, idempotencyKey, {
        episodeId,
        status: AD_NOT_COMPLETED.status,
        body: bodyOut,
      });
      return answer.status(AD_NOT_COMPLETED.status).send(bodyOut);
    }

    const facts = await options.factsPort.loadEpisodeAccessFacts({ episodeId, viewerId: userId });
    if (!facts.ok) {
      return send(
        request,
        answer,
        FACTS_FAILURES[facts.error],
        facts.error === 'EPISODE_NOT_FOUND'
          ? { resourceType: 'EPISODE', resourceId: episodeId }
          : undefined,
      );
    }

    const access = decideEpisodeAccess({ ...facts.value, nowMs: options.now() });
    if (access.unavailableCause !== null) {
      return send(request, answer, UNAVAILABLE_CAUSES[access.unavailableCause], {
        resourceType: 'EPISODE',
        resourceId: facts.value.episode.id,
      });
    }

    const notForAd = refusalToGrantAd(access);
    if (notForAd !== null) {
      return send(request, answer, notForAd, {
        episodeId: facts.value.episode.id,
        unlockPolicy: facts.value.episode.unlockPolicy,
        reason: access.reason,
      });
    }

    const usedToday = await countAdUnlocksToday(options.unlockStore, userId, options.now());
    if (usedToday >= placement.dailyLimit) {
      rewardLog.record({
        atMs: options.now(),
        userId,
        episodeId,
        sessionId: session.id,
        isEndedReported: isEnded,
        verdict: 'QUOTA_EXCEEDED',
      });
      return send(request, answer, AD_QUOTA, {
        usedToday,
        dailyLimit: placement.dailyLimit,
      });
    }

    const recorded = await options.unlockStore.record(
      createAdUnlock({
        id: newUnlockId(),
        userId,
        episodeId: facts.value.episode.id,
        dramaId: facts.value.drama.id,
        sessionId: session.id,
        grantedAtMs: options.now(),
      }),
    );

    if (!recorded.ok) {
      return send(request, answer, {
        status: 503,
        code: 'COMMON_SERVICE_UNAVAILABLE',
        message: 'The ad unlock could not be recorded',
        ours: true,
      });
    }

    const { unlock, created } = recorded.value;
    if (!created) {
      return send(request, answer, ALREADY_UNLOCKED, {
        episodeId: unlock.episodeId,
        unlockId: unlock.id,
      });
    }

    rewardLog.record({
      atMs: options.now(),
      userId,
      episodeId: unlock.episodeId,
      sessionId: session.id,
      isEndedReported: isEnded,
      verdict: 'COMPLETED',
    });

    const quota = { usedToday: usedToday + 1, dailyLimit: placement.dailyLimit };
    const bodyOut = {
      unlock: {
        id: unlock.id,
        episodeId: unlock.episodeId,
        method: unlock.method,
        costCoins: unlock.costCoins,
      },
      quota,
    };
    sessions.rememberGrant(userId, idempotencyKey, {
      episodeId: unlock.episodeId,
      status: 200,
      body: bodyOut,
    });

    request.log.info(
      { unlockId: unlock.id, episodeId: unlock.episodeId, method: unlock.method },
      'ad unlock granted',
    );

    return answer.status(200).send(bodyOut);
  });
}

/**
 * Ads unlock the same commercially locked coin episodes coins do. Free, already-owned, VIP-only,
 * and withdrawn content are not an ad grant: watching an ad must not open a VIP-only episode
 * the coin path also refuses, and must not sell something already playable.
 */
function refusalToGrantAd(access: EpisodeAccess): ErrorMapping | null {
  if (access.unavailableCause !== null) return UNAVAILABLE_CAUSES[access.unavailableCause];
  if (access.reason === 'UNLOCKED') return ALREADY_UNLOCKED;
  if (access.playable) return POLICY;
  return access.unlockOptions.includes('COINS') ? null : POLICY;
}

function utcDayStartMs(nowMs: number): number {
  return Math.floor(nowMs / UTC_DAY_MS) * UTC_DAY_MS;
}

async function countAdUnlocksToday(
  store: UnlockStore,
  userId: string,
  nowMs: number,
): Promise<number> {
  const start = utcDayStartMs(nowMs);
  const rows = await store.list();
  return rows.filter(
    (unlock) =>
      unlock.userId === userId &&
      unlock.method === 'AD' &&
      unlock.grantedAtMs >= start &&
      unlock.grantedAtMs < start + UTC_DAY_MS,
  ).length;
}

function readIdempotencyKey(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;

  const key = header.trim();
  if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;

  return /[\s,]/.test(key) ? null : key;
}
