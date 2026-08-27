import type { ApiErrorCode } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { decideEpisodeAccess } from './access.js';
import { errorBody } from '../../core/errors.js';
import type { EntitlementFactsPort, EpisodeAccessFactsFailure } from './facts-port.js';
import type { UnavailableCause } from './access.js';
import type { ViewerResolutionFailure, ViewerResolver } from './viewer-resolver.js';

/**
 * The HTTP wrapper around the access decision.
 *
 * It does four things and no more: read the episode id, establish who is asking, gather the facts,
 * and translate one verdict into one response. Every rule lives in `access.ts`, so the endpoint
 * cannot develop a second opinion about entitlement — which is the way these two drift apart.
 *
 * **A commercial denial answers `200`, not `403`.** This endpoint reports state; it is not an
 * attempt to play. `NEED_UNLOCK` is the honest answer to "may I?", and the client needs it to render
 * an unlock panel, so refusing to describe it would force the client to infer the state from an
 * error — the inference `docs/12-api-contracts.md` §3.3 forbids. The enforcement point is playback,
 * where a locked episode is a `403 EPISODE_LOCKED`. Unavailability is different: a withdrawn or
 * unpublished episode has no viewer-facing state to report, so it uses the error envelope.
 *
 * **No media identifier appears in any response here.** Entitlement decides whether playback may be
 * requested; playback issues the descriptor (correction A4, `docs/architecture/system-overview.md`
 * §1.1). Returning anything playable from a decision endpoint would put a second, unaudited source
 * of media references in the system.
 */

interface EpisodeAccessRequestBody {
  readonly episodeId?: unknown;
}

export interface EntitlementRouteOptions {
  readonly factsPort: EntitlementFactsPort;
  readonly viewerResolver: ViewerResolver;
  readonly now: () => number;
}

interface ErrorMapping {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  /** Ours to fix rather than the caller's, so it is logged at error level. */
  readonly ours?: true;
}

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
  // The session named a user we do not have. Answering as anonymous would silently downgrade a
  // subscriber to a stranger, which is a wrong entitlement answer wearing a 200.
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
  // A paid episode with no usable price. Quoting it would let the unlock endpoint charge nothing.
  MISCONFIGURED_PRICE: {
    status: 503,
    code: 'COMMON_SERVICE_UNAVAILABLE',
    message: 'This episode is temporarily unavailable',
    ours: true,
  },
};

export async function entitlementRoutes(
  app: FastifyInstance,
  options: EntitlementRouteOptions,
): Promise<void> {
  app.post('/v1/entitlement/episode-access', async (request, reply) => {
    const body = request.body as EpisodeAccessRequestBody | undefined;
    const episodeId = body?.episodeId;

    if (typeof episodeId !== 'string' || episodeId.length === 0) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'episodeId is required', request.id, {
          fields: [{ field: 'episodeId', reason: 'required' }],
        }),
      );
    }

    const send = (mapping: ErrorMapping, details?: Readonly<Record<string, unknown>>) => {
      if (mapping.ours === true) {
        request.log.error({ code: mapping.code, episodeId }, 'entitlement decision unavailable');
      }

      return reply
        .status(mapping.status)
        .send(errorBody(mapping.code, mapping.message, request.id, details));
    };

    const viewerId = options.viewerResolver.resolve(request.headers.authorization);
    if (!viewerId.ok) {
      return send(VIEWER_FAILURES[viewerId.error]);
    }

    const facts = await options.factsPort.loadEpisodeAccessFacts({
      episodeId,
      viewerId: viewerId.value,
    });
    if (!facts.ok) {
      return send(
        FACTS_FAILURES[facts.error],
        facts.error === 'EPISODE_NOT_FOUND'
          ? { resourceType: 'EPISODE', resourceId: episodeId }
          : undefined,
      );
    }

    const access = decideEpisodeAccess({ ...facts.value, nowMs: options.now() });

    if (access.unavailableCause !== null) {
      return send(UNAVAILABLE_CAUSES[access.unavailableCause], {
        resourceType: 'EPISODE',
        resourceId: facts.value.episode.id,
      });
    }

    return reply.status(200).send({
      episodeId: facts.value.episode.id,
      viewerAccess: {
        playable: access.playable,
        reason: access.reason,
        unlockedBy: access.unlockedBy,
      },
      unlockOptions: access.unlockOptions,
      priceCoins: access.priceCoins,
    });
  });
}
