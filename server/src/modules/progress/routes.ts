import type { EpisodeResumeView, WatchProgressReport } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { errorBody } from '../../core/errors.js';
import { mergeReport, validateEpisodeId, validateProgressReport } from './progress.js';
import type { ProgressReportFailure, WatchProgressRecord, WatchProgressRules } from './progress.js';
import type { ViewerResolver } from './viewer.js';
import type { WatchProgressStore } from './store.js';

/**
 * Watch progress: report a position, ask where to resume.
 *
 * ```
 * PUT /v1/progress/episodes/{episodeId}   { positionSec, durationSec, clientUpdatedAt } -> 204
 * GET /v1/progress/episodes/{episodeId}                                                 -> 200
 * ```
 *
 * The write is the highest-frequency authenticated endpoint in the product — a heartbeat every ten
 * seconds per playing viewer (`docs/12-api-contracts.md` §9 `progressHeartbeatSec`) plus one report
 * on exit — and the read sits on the first-frame path. Three consequences are visible in the code:
 *
 *   - **the write answers 204 with no body.** Nothing useful can be said in it. The client already
 *     knows the position it sent, and returning the merged row would invite it to trust a value that
 *     may have come from another device mid-scrub;
 *   - **a report that loses the merge is still a 204.** `docs/12-error-catalog.md` §8 makes this
 *     explicit: progress reporting is deliberately tolerant, and a stale report is not a client
 *     error. An error would teach the client to retry a report it is right to have dropped;
 *   - **the read names its field `resumePositionSec`**, the same key as the playback descriptor
 *     (`docs/design/playback-contract.md` §3.1), while the write reports `positionSec`. §1 of
 *     `packages/shared/src/progress.ts` records why the two differ.
 *
 * Deliberately not here: `GET /progress/dramas/{dramaId}`, the watch-history list and the
 * continue-watching card. All three need an episode-to-drama mapping, which belongs to `catalog`,
 * and both are in flight in adjacent slots (`PRG-003`).
 */

export interface ProgressRouteOptions {
  readonly store: WatchProgressStore;
  readonly viewerResolver: ViewerResolver;
  readonly rules?: WatchProgressRules;
  readonly now?: () => number;
}

const EPISODE_PROGRESS_PATH = '/v1/progress/episodes/:episodeId';

interface EpisodeParams {
  readonly episodeId?: string;
}

function resumeView(episodeId: string, record: WatchProgressRecord | undefined): EpisodeResumeView {
  if (record === undefined) {
    // Not a 404. "You have never watched this" is a complete and useful answer to "where do I
    // resume", and answering 404 would make every first play of every episode handle an error.
    return { episodeId, resumePositionSec: 0, completed: false, recorded: false };
  }

  return {
    episodeId,
    resumePositionSec: record.positionSec,
    completed: record.completed,
    recorded: true,
    durationSec: record.durationSec,
    updatedAt: new Date(record.updatedAtMs).toISOString(),
  };
}

export async function progressRoutes(
  app: FastifyInstance,
  options: ProgressRouteOptions,
): Promise<void> {
  const { store, viewerResolver } = options;
  const now = options.now ?? Date.now;
  const rules = options.rules;

  app.put(EPISODE_PROGRESS_PATH, async (request, reply) => {
    const viewer = viewerResolver.resolve(request.headers.authorization);
    if (!viewer.ok) {
      // One status and one code for all three reasons. Which of "no token", "bad token" and "we
      // cannot check tokens" applies is operator information, and the difference is useful to
      // someone probing the endpoint. The client's move is the same in every case: silent login,
      // then retry once.
      request.log.warn({ reason: viewer.error }, 'progress write without a resolvable viewer');
      return reply.status(401).send(errorBody('AUTH_REQUIRED', 'Sign-in required', request.id));
    }

    const episodeId = validateEpisodeId((request.params as EpisodeParams).episodeId);
    if (!episodeId.ok) {
      return reply.status(400).send(validationErrorBody(episodeId.error, request.id));
    }

    const report = validateProgressReport(
      request.body as Partial<WatchProgressReport> | undefined,
      rules,
    );
    if (!report.ok) {
      return reply
        .status(400)
        .send(
          report.error.kind === 'INVALID_POSITION'
            ? errorBody(
                'PROGRESS_INVALID_POSITION',
                'positionSec cannot be true of this episode',
                request.id,
                { positionSec: report.error.positionSec, durationSec: report.error.durationSec },
              )
            : validationErrorBody(report.error, request.id),
        );
    }

    const existing = await store.read(viewer.value.userId, episodeId.value);
    const outcome = mergeReport({
      existing,
      userId: viewer.value.userId,
      episodeId: episodeId.value,
      report: report.value,
      nowMs: now(),
      ...(rules === undefined ? {} : { rules }),
    });

    if (outcome.record !== existing) {
      await store.save(outcome.record);
    }

    request.log.debug(
      { episodeId: episodeId.value, decision: outcome.decision },
      'watch progress reported',
    );

    return reply.status(204).send();
  });

  app.get(EPISODE_PROGRESS_PATH, async (request, reply) => {
    const viewer = viewerResolver.resolve(request.headers.authorization);
    if (!viewer.ok) {
      request.log.warn({ reason: viewer.error }, 'progress read without a resolvable viewer');
      return reply.status(401).send(errorBody('AUTH_REQUIRED', 'Sign-in required', request.id));
    }

    const episodeId = validateEpisodeId((request.params as EpisodeParams).episodeId);
    if (!episodeId.ok) {
      return reply.status(400).send(validationErrorBody(episodeId.error, request.id));
    }

    const record = await store.read(viewer.value.userId, episodeId.value);

    // A resume position is per-viewer and short-lived by nature; a shared cache holding it is a
    // cross-user leak waiting for a misconfigured proxy (`docs/design/api-contracts.md` §7.3).
    return reply
      .header('cache-control', 'private, no-store')
      .status(200)
      .send(resumeView(episodeId.value, record));
  });
}

function validationErrorBody(
  failure: Extract<ProgressReportFailure, { kind: 'VALIDATION' }>,
  traceId: string,
): ReturnType<typeof errorBody> {
  return errorBody('COMMON_VALIDATION_FAILED', `${failure.field} is invalid`, traceId, {
    fields: [{ field: failure.field, reason: failure.reason }],
  });
}
