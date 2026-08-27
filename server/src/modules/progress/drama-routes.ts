import type { DramaProgressView } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { errorBody } from '../../core/errors.js';
import { projectDramaProgress, validateDramaId } from './drama.js';
import { requireViewer, sendViewerRefusal } from './viewer.js';
import type { DramaProgressCatalogPort } from './drama-catalog-port.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';
import type { WatchProgressRecord } from './progress.js';
import type { WatchProgressStore } from './store.js';

/**
 * Per-drama watch progress.
 *
 * ```
 * GET /v1/progress/dramas/{dramaId}  -> 200 DramaProgressView
 * ```
 *
 * Auth is required: a progress list without a session is not a progress list, and an anonymous
 * `200` with `items: []` would look like "this viewer has never watched this" to a client that
 * then has to guess whether to sign in. The client's move for `401` is silent login, then one
 * retry — and PNL-01 treats that failure as "no watched marks", never as a guessed range.
 *
 * The numbers come from `catalog` through `DramaProgressCatalogPort`. The default port refuses, so
 * an unwired deployment answers `503` rather than parsing episode ids. `buildApp` wires the real
 * catalogue store, the same one the episode list is served from, so the picker and this read
 * cannot disagree about which cell is episode 4.
 *
 * Deliberately not here: writing progress (that stays on the per-episode PUT) and inventing a
 * watched mark for every episode before `lastWatched`.
 */

export interface DramaProgressRouteOptions {
  readonly store: WatchProgressStore;
  readonly viewerResolver: ViewerResolver;
  readonly catalogPort: DramaProgressCatalogPort;
}

export const DRAMA_PROGRESS_PATH = '/v1/progress/dramas/:dramaId';

interface DramaParams {
  readonly dramaId?: string;
}

export async function dramaProgressRoutes(
  app: FastifyInstance,
  options: DramaProgressRouteOptions,
): Promise<void> {
  const { store, viewerResolver, catalogPort } = options;

  app.get(DRAMA_PROGRESS_PATH, async (request, reply) => {
    // A per-viewer answer in a shared cache is a cross-user leak waiting for a misconfigured
    // proxy. Set before the answer is known, so the refusals carry it too.
    const answer = reply.header('cache-control', 'private, no-store');

    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) {
      return sendViewerRefusal(request, answer, viewer.error, 'drama-progress read');
    }

    const dramaId = validateDramaId((request.params as DramaParams).dramaId);
    if (!dramaId.ok) {
      return answer.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', `${dramaId.error.field} is invalid`, request.id, {
          fields: [{ field: dramaId.error.field, reason: dramaId.error.reason }],
        }),
      );
    }

    const listed = await catalogPort.listDramaEpisodes(dramaId.value);
    if (!listed.ok) {
      request.log.error(
        { reason: listed.error, dramaId: dramaId.value },
        'drama progress not numbered',
      );
      return answer
        .status(503)
        .send(
          errorBody(
            'COMMON_SERVICE_UNAVAILABLE',
            'Watch progress is temporarily unavailable',
            request.id,
          ),
        );
    }

    const recordsByEpisodeId = await loadRecords(store, viewer.value, listed.value);
    const body: DramaProgressView = projectDramaProgress({
      episodes: listed.value,
      recordsByEpisodeId,
    });
    return answer.status(200).send(body);
  });
}

async function loadRecords(
  store: WatchProgressStore,
  userId: string,
  episodes: readonly { readonly episodeId: string }[],
): Promise<ReadonlyMap<string, WatchProgressRecord>> {
  const records = new Map<string, WatchProgressRecord>();

  await Promise.all(
    episodes.map(async (episode) => {
      const record = await store.read(userId, episode.episodeId);
      if (record !== undefined) {
        records.set(episode.episodeId, record);
      }
    }),
  );

  return records;
}
