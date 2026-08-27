import type { FastifyInstance } from 'fastify';

import {
  WATCH_HISTORY_SCAN_LIMIT,
  parseWatchHistoryQuery,
  projectWatchHistory,
} from './history.js';
import { errorBody } from '../../core/errors.js';
import { requireViewer, sendViewerRefusal } from './viewer.js';
import type { RawWatchHistoryQuery } from './history.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';
import type { WatchHistoryCatalogPort } from './catalog-port.js';
import type { WatchProgressStore } from './store.js';

/**
 * The watch-history list.
 *
 * ```
 * GET /v1/users/me/watch-history?cursor=&limit=  -> 200 Page<WatchHistoryEntry>
 * ```
 *
 * The client has had this screen since W3 slot M and has been getting `404` from the not-found
 * handler, because there was no progress module at all (`docs/handoff/w3-work-m.md` §5). This is the
 * read it was written against.
 *
 * The endpoint's whole job is to keep three answers apart, and they are three different screens in
 * the client:
 *
 *   - **`401`** — nobody is asking. History is the one list read in the product with no anonymous
 *     reading: the row *is* the identity. The client's move is silent login, then one retry.
 *   - **`200` with an empty page** — you are signed in and have watched nothing. A real answer, and
 *     an empty-state screen with a "browse" button rather than an error.
 *   - **`503`** — you are signed in, you have watched something, and we cannot describe it. Also a
 *     real answer, and it must never be flattened into the one above: "you have never watched
 *     anything" is a claim about the viewer, and a viewer who believes it stops looking.
 *
 * That last distinction is why the catalogue port is consulted lazily. A viewer with no rows needs
 * no episode described, so the empty page is answered without asking anything that could fail — an
 * unwired deployment still tells `401` and `200 []` apart, which is the property the client's three
 * screens rest on.
 *
 * Deliberately not here: `DELETE /users/me/watch-history/{dramaId}`. Removing a drama from the list
 * is a write against rows this module owns, but "hidden from history" is not a position — it is a
 * per-drama flag with no column to live in yet, and inferring it by deleting progress rows would
 * silently throw away the viewer's resume positions for every episode of that drama.
 */

export interface WatchHistoryRouteOptions {
  readonly store: WatchProgressStore;
  readonly viewerResolver: ViewerResolver;
  readonly catalogPort: WatchHistoryCatalogPort;
}

export const WATCH_HISTORY_PATH = '/v1/users/me/watch-history';

export async function watchHistoryRoutes(
  app: FastifyInstance,
  options: WatchHistoryRouteOptions,
): Promise<void> {
  const { store, viewerResolver, catalogPort } = options;

  app.get(WATCH_HISTORY_PATH, async (request, reply) => {
    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) {
      return sendViewerRefusal(request, reply, viewer.error, 'watch-history read');
    }

    const query = parseWatchHistoryQuery(request.query as RawWatchHistoryQuery);
    if (!query.ok) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', `${query.error.field} is invalid`, request.id, {
          fields: [{ field: query.error.field, reason: query.error.reason }],
        }),
      );
    }

    // A viewer's history is per-viewer and short-lived by nature; a shared cache holding it is a
    // cross-user leak waiting for a misconfigured proxy (`docs/design/api-contracts.md` §7.3).
    const answer = reply.header('cache-control', 'private, no-store');

    const rows = await store.list(viewer.value, WATCH_HISTORY_SCAN_LIMIT);

    if (rows.length === 0) {
      // Nothing watched. Answered without consulting the catalogue, so that "you have watched
      // nothing" cannot turn into a `503` on a deployment where the catalogue is not wired — and so
      // that it never turns into one for the viewer this is the true answer for.
      return answer.status(200).send({ items: [], pageInfo: { nextCursor: null, hasMore: false } });
    }

    const facts = await catalogPort.loadWatchedEpisodeFacts(rows.map((row) => row.episodeId));
    if (!facts.ok) {
      request.log.error(
        { reason: facts.error, rows: rows.length },
        'watch history not describable',
      );
      return answer
        .status(503)
        .send(
          errorBody(
            'COMMON_SERVICE_UNAVAILABLE',
            'Watch history is temporarily unavailable',
            request.id,
          ),
        );
    }

    return answer
      .status(200)
      .send(projectWatchHistory({ rows, facts: facts.value, query: query.value }));
  });
}
