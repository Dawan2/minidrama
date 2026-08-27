import type { DramaSearchResults, FavoriteList, FavoriteState } from '@minidrama/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { encodeFavoritesCursor } from './favorites-cursor.js';
import { errorBody } from '../../core/errors.js';
import { findMatches } from './search.js';
import {
  parseFavoritesCursor,
  parseFavoritesLimit,
  parseSearchLimit,
  validateDramaId,
  validateSearchQuery,
} from './validation.js';
import type { DramaDirectory } from './dramas.js';
import type { FavoriteRecord, FavoritesStore } from './favorites.js';
import type { FieldFailure } from './validation.js';
import type { ViewerResolutionFailure, ViewerResolver } from '../progress/viewer.js';

/**
 * Discovery: find a drama, then follow it.
 *
 * ```
 * GET    /v1/search?q=&limit=              -> 200   anonymous
 * GET    /v1/dramas/{dramaId}/favorite     -> 200   per viewer
 * PUT    /v1/dramas/{dramaId}/favorite     -> 204   per viewer, idempotent
 * DELETE /v1/dramas/{dramaId}/favorite     -> 204   per viewer, idempotent
 * GET    /v1/users/me/favorites?cursor=&limit=  -> 200   per viewer, paged
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
 *   - **favourites are per viewer and refuse by default.** They use the same `ViewerResolver` seam
 *     watch progress introduced, on that slot's explicit instruction (`docs/handoff/w2-work-g.md`
 *     §5): one `401 AUTH_REQUIRED` for a missing, a rejected and an unverifiable credential alike,
 *     because the difference is operator information and the client's move — silent login, retry
 *     once — is the same in all three cases.
 *
 * Search closes gap **G5** (`docs/02-information-architecture.md` §10: "no keyword search endpoint",
 * which is why the 剧场 tab's search entry is built but hidden). It does not close W18: this is
 * keyword matching over a seed, not a search engine.
 *
 * The favourites *list* is the third kind of endpoint here, and the reason it exists is that without
 * it a client wanting to show SCR-08 has to know the ids already: the per-drama `GET` answers "do I
 * follow *this*", so a favourites screen built on it alone fans out one request per candidate drama
 * and still cannot discover a favourite it did not think to ask about. It ships returning drama ids
 * rather than the `DramaSummary` pages `docs/12-api-contracts.md` §4.3 specifies — see
 * `docs/handoff/w8-work-favorites-list.md` §3, decision S60.
 */

export interface DiscoveryRouteOptions {
  readonly directory: DramaDirectory;
  readonly favorites: FavoritesStore;
  readonly viewerResolver: ViewerResolver;
  readonly now?: () => number;
}

const FAVORITE_PATH = '/v1/dramas/:dramaId/favorite';
const FAVORITES_LIST_PATH = '/v1/users/me/favorites';

interface DramaParams {
  readonly dramaId?: string;
}

interface SearchQuery {
  readonly q?: unknown;
  readonly limit?: unknown;
}

interface FavoritesListQuery {
  readonly cursor?: unknown;
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

export async function discoveryRoutes(
  app: FastifyInstance,
  options: DiscoveryRouteOptions,
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
    const viewer = viewerResolver.resolve(request.headers.authorization);
    if (!viewer.ok) return refuse(request, reply, viewer.error);

    const dramaId = validateDramaId((request.params as DramaParams).dramaId);
    if (!dramaId.ok) {
      return reply.status(400).send(validationErrorBody(dramaId.error, request.id));
    }

    // No catalogue lookup on the read. A viewer must be able to see their own row for a drama that
    // has since been delisted — that row is the reason the drama is still on their favourites
    // screen, and answering 410 here would leave them unable to see what they are being shown.
    const record = await favorites.read(viewer.value.userId, dramaId.value);

    // Per-viewer, so a shared cache holding it is a cross-user leak waiting for a misconfigured
    // proxy (`docs/design/api-contracts.md` §7.3).
    return reply
      .header('cache-control', 'private, no-store')
      .status(200)
      .send(favoriteState(dramaId.value, record));
  });

  app.put(FAVORITE_PATH, async (request, reply) => {
    const viewer = viewerResolver.resolve(request.headers.authorization);
    if (!viewer.ok) return refuse(request, reply, viewer.error);

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

    const record = await favorites.add(viewer.value.userId, dramaId.value, now());

    request.log.debug(
      { dramaId: dramaId.value, favoritedAtMs: record.favoritedAtMs },
      'drama favourited',
    );

    return reply.status(204).send();
  });

  app.get(FAVORITES_LIST_PATH, async (request, reply) => {
    const viewer = viewerResolver.resolve(request.headers.authorization);
    // Before the query string is even looked at. An anonymous caller must get the same answer for a
    // well-formed request and a malformed one, or the validation error becomes a way to probe the
    // endpoint without a credential.
    if (!viewer.ok) return refuse(request, reply, viewer.error);

    const raw = request.query as FavoritesListQuery | undefined;

    const limit = parseFavoritesLimit(raw?.limit);
    if (!limit.ok) {
      return reply.status(400).send(validationErrorBody(limit.error, request.id));
    }

    const cursor = parseFavoritesCursor(raw?.cursor);
    if (!cursor.ok) {
      return reply.status(400).send(validationErrorBody(cursor.error, request.id));
    }

    // No catalogue lookup, for the reason the per-drama read does not do one either — and here it
    // is also a paging property: dropping delisted rows after the store has counted them would
    // return a page shorter than `limit` while `hasMore` still described the unfiltered query, so
    // the two halves of the answer would disagree. Resolving ids to dramas is the client's step,
    // and it is where a withdrawn drama gets whatever treatment SCR-08 decides it gets.
    const page = await favorites.list(viewer.value.userId, {
      limit: limit.value,
      ...(cursor.value === undefined ? {} : { after: cursor.value }),
    });

    const last = page.rows.at(-1);

    const body: FavoriteList = {
      items: page.rows.map((row) => ({
        dramaId: row.dramaId,
        favoritedAt: new Date(row.favoritedAtMs).toISOString(),
      })),
      pageInfo: {
        // `hasMore` and a non-null `nextCursor` are one fact, so the cursor is derived from
        // `hasMore` rather than emitted whenever a last row exists. A cursor on the final page
        // invites a client to fetch an empty page to discover it has finished.
        nextCursor: page.hasMore && last !== undefined ? encodeFavoritesCursor(last) : null,
        hasMore: page.hasMore,
      },
    };

    request.log.debug({ returned: body.items.length, hasMore: page.hasMore }, 'favourites listed');

    // Per viewer, so the same rule as the per-drama read: a shared cache holding this is a
    // cross-user leak waiting for a misconfigured proxy.
    return reply.header('cache-control', 'private, no-store').status(200).send(body);
  });

  app.delete(FAVORITE_PATH, async (request, reply) => {
    const viewer = viewerResolver.resolve(request.headers.authorization);
    if (!viewer.ok) return refuse(request, reply, viewer.error);

    const dramaId = validateDramaId((request.params as DramaParams).dramaId);
    if (!dramaId.ok) {
      return reply.status(400).send(validationErrorBody(dramaId.error, request.id));
    }

    // No catalogue lookup, and no distinction between "removed" and "was not there". Un-following
    // must never be the operation that fails: refusing it for a delisted drama would trap the row
    // on the viewer's screen with no way to clear it, and a 404 for a row that is already gone
    // makes a retried DELETE — the reason DELETE is meant to be idempotent — look like an error.
    const removed = await favorites.remove(viewer.value.userId, dramaId.value);

    request.log.debug({ dramaId: dramaId.value, removed }, 'drama unfavourited');

    return reply.status(204).send();
  });
}

/**
 * One status and one code for all three refusal reasons — no credential, a rejected credential, and
 * a deployment that cannot verify credentials at all. Which one applies goes to the log, where the
 * operator can see it; telling the caller would make the endpoint an oracle for a probe.
 */
function refuse(
  request: FastifyRequest,
  reply: FastifyReply,
  reason: ViewerResolutionFailure,
): FastifyReply {
  request.log.warn({ reason }, 'favourite request without a resolvable viewer');
  return reply.status(401).send(errorBody('AUTH_REQUIRED', 'Sign-in required', request.id));
}
