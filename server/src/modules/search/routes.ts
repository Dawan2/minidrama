import type { DramaSearchResults, FavoriteState } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { errorBody } from '../../core/errors.js';
import { findMatches } from './search.js';
import { parseSearchLimit, validateDramaId, validateSearchQuery } from './validation.js';
import { requireViewer, sendViewerRefusal } from '../progress/viewer.js';
import type { DramaDirectory } from './dramas.js';
import type { FavoriteRecord, FavoritesStore } from './favorites.js';
import type { FieldFailure } from './validation.js';
import type { ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * Search: find a drama, then follow it.
 *
 * The module was `discovery/` on `cursor/w2-work-j-acf5` and moved here during C2 integration
 * (`docs/plan/cycle-2-integration.md` A2): another slot had built a recommendation feed under the
 * same directory name, and the two do not overlap — the name collided, the work did not. `discovery/`
 * is the feed; this is search and favourites.
 *
 * ```
 * GET    /v1/search?q=&limit=              -> 200   anonymous
 * GET    /v1/dramas/{dramaId}/favorite     -> 200   per viewer
 * PUT    /v1/dramas/{dramaId}/favorite     -> 204   per viewer, idempotent
 * DELETE /v1/dramas/{dramaId}/favorite     -> 204   per viewer, idempotent
 * ```
 *
 * The two halves of `U4` (`docs/01-product-scope.md` §3) share a module because they share the
 * question "which drama is this" — and, today, the answer to it. Everything else about them differs,
 * including the property that decides how each handler is written:
 *
 *   - **search is anonymous and viewer-independent.** It resolves no viewer, carries no per-viewer
 *     field, and is therefore the one response in this module a shared cache could hold. There is a
 *     test asserting it contains no favourite state, because the moment it does, the caching answer
 *     changes;
 *   - **favourites are per viewer and refuse by default.** They use the one `ViewerResolver` seam
 *     this server has (`entitlement/viewer-resolver.ts`), narrowed by `progress/viewer.ts`'s
 *     `requireViewer` because "nobody" is not an acceptable answer here either. That is the same
 *     seam this slot originally wrote against, reconciled to the implementation that won A1: one
 *     `401 AUTH_REQUIRED` for a missing and a rejected credential alike, because the difference is
 *     operator information and the client's move — silent login, retry once — is the same.
 *
 * Search closes gap **G5** (`docs/02-information-architecture.md` §10: "no keyword search endpoint",
 * which is why the 剧场 tab's search entry is built but hidden). It does not close W18: this is
 * keyword matching over a seed, not a search engine.
 *
 * Deliberately not here: `GET /users/me/favorites`. The favourites screen (SCR-08) lists
 * `DramaSummary` pages, which is a catalogue view object this branch does not have — see §4 of the
 * handoff.
 */

export interface SearchRouteOptions {
  readonly directory: DramaDirectory;
  readonly favorites: FavoritesStore;
  readonly viewerResolver: ViewerResolver;
  readonly now?: () => number;
}

const FAVORITE_PATH = '/v1/dramas/:dramaId/favorite';

interface DramaParams {
  readonly dramaId?: string;
}

interface SearchQuery {
  readonly q?: unknown;
  readonly limit?: unknown;
}

function validationErrorBody(failure: FieldFailure, traceId: string): ReturnType<typeof errorBody> {
  return errorBody('COMMON_VALIDATION_FAILED', `${failure.field} is invalid`, traceId, {
    fields: [{ field: failure.field, reason: failure.reason }],
  });
}

function favoriteState(dramaId: string, record: FavoriteRecord | undefined): FavoriteState {
  if (record === undefined) {
    // Not a 404. "You do not follow this" is a complete answer to "do I follow this", and a 404
    // would make the unfavourited case — the common one — an error path on every drama screen.
    return { dramaId, favorited: false };
  }

  return {
    dramaId,
    favorited: true,
    favoritedAt: new Date(record.favoritedAtMs).toISOString(),
  };
}

export async function searchRoutes(
  app: FastifyInstance,
  options: SearchRouteOptions,
): Promise<void> {
  const { directory, favorites, viewerResolver } = options;
  const now = options.now ?? Date.now;

  app.get('/v1/search', async (request, reply) => {
    const raw = request.query as SearchQuery | undefined;

    const query = validateSearchQuery(raw?.q);
    if (!query.ok) {
      return reply.status(400).send(validationErrorBody(query.error, request.id));
    }

    const limit = parseSearchLimit(raw?.limit);
    if (!limit.ok) {
      return reply.status(400).send(validationErrorBody(limit.error, request.id));
    }

    const matches = findMatches(await directory.listSearchable(), query.value);

    const results: DramaSearchResults = {
      query: query.value,
      items: matches.slice(0, limit.value).map((match) => ({
        dramaId: match.drama.id,
        title: match.drama.title,
        tags: match.drama.tags,
        matchedOn: match.matchedOn,
      })),
      truncated: matches.length > limit.value,
    };

    request.log.debug({ matches: matches.length, returned: results.items.length }, 'search served');

    return reply.status(200).send(results);
  });

  app.get(FAVORITE_PATH, async (request, reply) => {
    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) return sendViewerRefusal(request, reply, viewer.error, 'favourite request');

    const dramaId = validateDramaId((request.params as DramaParams).dramaId);
    if (!dramaId.ok) {
      return reply.status(400).send(validationErrorBody(dramaId.error, request.id));
    }

    // No catalogue lookup on the read. A viewer must be able to see their own row for a drama that
    // has since been delisted — that row is the reason the drama is still on their favourites
    // screen, and answering 410 here would leave them unable to see what they are being shown.
    const record = await favorites.read(viewer.value, dramaId.value);

    // Per-viewer, so a shared cache holding it is a cross-user leak waiting for a misconfigured
    // proxy (`docs/design/api-contracts.md` §7.3).
    return reply
      .header('cache-control', 'private, no-store')
      .status(200)
      .send(favoriteState(dramaId.value, record));
  });

  app.put(FAVORITE_PATH, async (request, reply) => {
    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) return sendViewerRefusal(request, reply, viewer.error, 'favourite request');

    const dramaId = validateDramaId((request.params as DramaParams).dramaId);
    if (!dramaId.ok) {
      return reply.status(400).send(validationErrorBody(dramaId.error, request.id));
    }

    // The one write in this module that asks the catalogue anything. Following a drama creates a
    // reference to it, and a reference to something that does not exist is a row nobody can ever
    // render — it would reach a viewer as a permanently broken card on their favourites screen.
    const drama = await directory.lookup(dramaId.value);

    if (drama === undefined || drama.status === 'DRAFT') {
      // A draft is a 404 and not a 410 on purpose: 410 would confirm that an unannounced drama
      // exists, and an unpublished title is exactly the thing a competitor would probe for.
      return reply.status(404).send(
        errorBody('CONTENT_NOT_FOUND', 'No such drama', request.id, {
          resourceType: 'drama',
          resourceId: dramaId.value,
        }),
      );
    }

    if (drama.status === 'OFFLINE') {
      return reply.status(410).send(
        errorBody('CONTENT_OFFLINE', 'This drama is no longer available', request.id, {
          resourceType: 'drama',
          resourceId: dramaId.value,
        }),
      );
    }

    const record = await favorites.add(viewer.value, dramaId.value, now());

    request.log.debug(
      { dramaId: dramaId.value, favoritedAtMs: record.favoritedAtMs },
      'drama favourited',
    );

    return reply.status(204).send();
  });

  app.delete(FAVORITE_PATH, async (request, reply) => {
    const viewer = requireViewer(viewerResolver, request.headers.authorization);
    if (!viewer.ok) return sendViewerRefusal(request, reply, viewer.error, 'favourite request');

    const dramaId = validateDramaId((request.params as DramaParams).dramaId);
    if (!dramaId.ok) {
      return reply.status(400).send(validationErrorBody(dramaId.error, request.id));
    }

    // No catalogue lookup, and no distinction between "removed" and "was not there". Un-following
    // must never be the operation that fails: refusing it for a delisted drama would trap the row
    // on the viewer's screen with no way to clear it, and a 404 for a row that is already gone
    // makes a retried DELETE — the reason DELETE is meant to be idempotent — look like an error.
    const removed = await favorites.remove(viewer.value, dramaId.value);

    request.log.debug({ dramaId: dramaId.value, removed }, 'drama unfavourited');

    return reply.status(204).send();
  });
}
