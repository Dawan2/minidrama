import type { ApiErrorCode } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { decideEpisodeAccess } from '../entitlement/access.js';
import { errorBody } from '../../core/errors.js';
import type { EntitlementFactsPort, EpisodeAccessFactsFailure } from '../entitlement/facts-port.js';
import type { EpisodeAccess, UnavailableCause } from '../entitlement/access.js';
import type { PlaybackMediaFailure, PlaybackMediaPort } from './media-port.js';
import type { ViewerResolutionFailure, ViewerResolver } from '../entitlement/viewer-resolver.js';
import type { WatchProgressStore } from '../progress/store.js';

/**
 * Playback session issuance — `POST /v1/playback/sessions` → `201` (X-19 BD-1…BD-6,
 * `docs/plan/x19-playback-endpoint.md` §1.1).
 *
 * The response is a playback *descriptor*, never a signed media URL (correction A4 in
 * `docs/architecture/system-overview.md` §1.1). Two authorization systems sit in series and this
 * endpoint owns only the commercial one: it can deny playback, it can never grant it. The
 * platform independently enforces moderation, online version, listing state and client
 * authorization, and can still refuse an episode this endpoint approved.
 *
 * **The entitlement rules are not here.** Wave 1 shipped a stub `isEntitled` that read the episode
 * id; it is now `decideEpisodeAccess`, the single pure function in
 * `modules/entitlement/access.ts` that also answers `POST /v1/entitlement/episode-access`. Nothing
 * in this file decides access — it establishes who is asking, gathers the facts, and translates one
 * verdict into one response. A second opinion about entitlement living at the enforcement point is
 * how the browse view and the play attempt start disagreeing about what a viewer owns.
 *
 * **A denial never reaches the media port.** The verdict is evaluated to completion before any
 * media identifier is resolved, so `NEED_UNLOCK` and `NEED_VIP` return without a `vid` existing
 * anywhere in the request — not withheld from the response, never looked up. That ordering is the
 * enforcement, and `routes.test.ts` asserts it against a counting port rather than against the
 * response body, because a body assertion only proves the descriptor was not *sent*.
 *
 * **This endpoint answers `403`, where the decision endpoint answers `200`.** The difference is not
 * a disagreement: entitlement reports state a client renders an unlock panel from, and playback is
 * an attempt, so a commercial denial here is a refusal (`docs/handoff/w2-work-f.md` §2.2, S32).
 *
 * **`resumePositionSec` is the viewer's stored progress, or `0`.** The player already forwards
 * that field as VePlayer `startTime`. A missing row, an anonymous caller, or a non-integer stored
 * position starts at the beginning — that is wrong for a returning viewer we failed to read, and
 * never wrong about entitlement. Another viewer's row is unreachable because the key is
 * `(userId, episodeId)`. Still deferred: the lazy `play_auth_token` fetch for TikTok clients
 * below 44.5.0 (W10).
 */

interface CreateSessionBody {
  readonly episodeId?: unknown;
}

export interface PlaybackRouteOptions {
  readonly factsPort: EntitlementFactsPort;
  readonly viewerResolver: ViewerResolver;
  readonly mediaPort: PlaybackMediaPort;
  readonly now: () => number;
  /**
   * The same store the heartbeat writes. A second map here would resume from a position the
   * player had been reporting into a different table.
   */
  readonly progressStore: WatchProgressStore;
}

interface ErrorMapping {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  /** Ours to fix rather than the caller's, so it is logged at error level. */
  readonly ours?: true;
}

/**
 * Deliberately identical to `modules/entitlement/routes.ts`. Both endpoints answer the same
 * questions about the same facts, and the day they answer them with different statuses is the day a
 * client has to special-case which endpoint told it the session was bad.
 */
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

const MEDIA_FAILURES: Record<PlaybackMediaFailure, ErrorMapping> = {
  // The viewer is entitled and we cannot name the asset. That is ours, not theirs, and it is the
  // one failure of this endpoint that a paying viewer experiences as a broken product.
  MEDIA_UNAVAILABLE: {
    status: 503,
    code: 'EPISODE_ASSET_UNAVAILABLE',
    message: 'The video for this episode is not available yet',
    ours: true,
  },
};

/**
 * A commercial lock is a conversion opportunity, so it carries the unlock context the client needs
 * to render a panel. It must never be reported with the same code as a platform block, which is an
 * incident (`docs/architecture/system-overview.md` §5.2).
 */
const COMMERCIAL_DENIALS = {
  NEED_UNLOCK: {
    status: 403,
    code: 'EPISODE_LOCKED',
    message: 'This episode is not unlocked',
  },
  NEED_VIP: {
    status: 403,
    code: 'EPISODE_VIP_REQUIRED',
    message: 'This episode is for VIP members',
  },
} as const satisfies Record<string, ErrorMapping>;

/**
 * `docs/12-api-contracts.md` §4.4: an anonymous viewer asking to play a paid episode gets `401`.
 * The decision function answers `NEED_UNLOCK` for the same viewer on purpose — for a browse view
 * that is the truth — and the difference is that playback is an attempt. Signing in is the step
 * that has to happen first, and quoting a price to someone with no wallet asks them to solve the
 * second problem before the first (`docs/handoff/w2-work-f.md` §5).
 */
const ANONYMOUS_DENIAL: ErrorMapping = {
  status: 401,
  code: 'AUTH_REQUIRED',
  message: 'Sign in to play this episode',
};

export async function playbackRoutes(
  app: FastifyInstance,
  options: PlaybackRouteOptions,
): Promise<void> {
  app.post('/v1/playback/sessions', async (request, reply) => {
    const body = request.body as CreateSessionBody | undefined;
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
        request.log.error({ code: mapping.code, episodeId }, 'playback session not issued');
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

    // The single gate. Everything below it runs only for a viewer the decision function said may
    // play, which is why the media lookup is safe to place after it and nowhere else.
    if (!access.playable) {
      // The unlock context rides on every denial, including the anonymous `401`, so a client can
      // render "sign in to unlock for 300 coins" in one step. It discloses nothing: the decision
      // endpoint already quotes the same price to the same anonymous caller.
      return send(denialMapping(access, viewerId.value), {
        episodeId: facts.value.episode.id,
        unlockPolicy: facts.value.episode.unlockPolicy,
        unlockOptions: access.unlockOptions,
        priceCoins: access.priceCoins,
      });
    }

    const media = await options.mediaPort.resolveMedia({ episodeId: facts.value.episode.id });
    if (!media.ok) {
      return send(MEDIA_FAILURES[media.error], { episodeId: facts.value.episode.id });
    }

    // After the gate, and after media: a commercial denial must not read another viewer's
    // progress, and a missing asset must not look up a resume we will not send.
    const resumePositionSec = await resumeFromProgress(
      options.progressStore,
      viewerId.value,
      facts.value.episode.id,
    );

    const descriptor: PlaybackDescriptor = {
      // The drama is the album. Taken from the facts that decided access rather than resolved
      // again, so the descriptor cannot name a different drama than the one that was authorized.
      albumId: facts.value.drama.id,
      episodeId: facts.value.episode.id,
      vid: media.value.vid,
      resumePositionSec,
    };

    return reply.status(201).send(descriptor);
  });
}

/**
 * Translates a non-playable verdict into a refusal.
 *
 * `FREE`, `UNLOCKED` and `VIP` never reach here — the decision function only pairs them with
 * `playable: true` — and `UNAVAILABLE` was answered before the gate. `NEED_UNLOCK` is the default
 * rather than a third branch on purpose: a reason added to the vocabulary later denies until
 * somebody handles it, which is the only direction a fall-through may point at an enforcement
 * point.
 */
function denialMapping(access: EpisodeAccess, viewerId: string | null): ErrorMapping {
  if (viewerId === null) return ANONYMOUS_DENIAL;

  return access.reason === 'NEED_VIP'
    ? COMMERCIAL_DENIALS.NEED_VIP
    : COMMERCIAL_DENIALS.NEED_UNLOCK;
}

/**
 * Where VePlayer should start, from the heartbeat table, never from a guess.
 *
 * Anonymous callers have no row to read. A missing row is `0`, the same answer `GET
 * /v1/progress/episodes/{id}` already gives, so continue-watching and a fresh session cannot
 * disagree about "never watched". A stored value that is not a non-negative integer is not a
 * start time — it is dropped rather than forwarded into `startTime`.
 */
async function resumeFromProgress(
  store: WatchProgressStore,
  viewerId: string | null,
  episodeId: string,
): Promise<number> {
  if (viewerId === null) return 0;

  const record = await store.read(viewerId, episodeId);
  if (record === undefined) return 0;
  if (!Number.isInteger(record.positionSec) || record.positionSec < 0) return 0;
  return record.positionSec;
}
