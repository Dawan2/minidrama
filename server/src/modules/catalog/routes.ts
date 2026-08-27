import { DRAMA_CATEGORIES, err, ok } from '@minidrama/shared';
import type { DramaCategory, EpisodeItem, Page, Result } from '@minidrama/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ascendingKey, paginate, parseLimit, queryFingerprint } from '../../core/pagination.js';
import { dramaSortKey } from './store.js';
import { errorBody } from '../../core/errors.js';
import { toDramaDetail, toDramaSummary, toEpisodeItem } from './views.js';
import type { CatalogStore, DramaSort } from './store.js';
import type { DramaRecord } from './types.js';
import type { ViewerResolver } from './viewer.js';

/**
 * The storefront: dramas, seasons flattened into a running order, and per-episode access.
 *
 * These are the anonymous-capable public reads of `docs/12-api-contracts.md` §4.3. Two things are
 * true of every response here and are worth stating before the code:
 *
 * - **No response carries a way to play anything.** Not a URL, not a `vid`, not an asset key. The
 *   catalogue says what exists and whether you may watch it; `POST /v1/playback/sessions` is the
 *   only place that answers with identifiers a player can use, and it re-checks entitlement.
 * - **`viewerAccess` is the answer, not the ingredients.** The client never sees the free-window
 *   size, the raw policy or the publication state in a form it could recombine into a decision.
 */

const DRAMA_SORTS: readonly DramaSort[] = ['HOT', 'NEW'];
const DRAMA_LIMIT = { fallback: 20, max: 100 };
/** Episode lists default larger: the detail screen renders the whole grid at once. */
const EPISODE_LIMIT = { fallback: 50, max: 100 };
const MAX_TAG_LENGTH = 64;

export interface CatalogRouteOptions {
  readonly store: CatalogStore;
  readonly viewerResolver: ViewerResolver;
}

/** A repeated query parameter arrives as an array; that is a client bug, not a value to guess at. */
function singleValue(raw: unknown): Result<string | undefined, 'REPEATED'> {
  if (raw === undefined) return ok(undefined);
  if (typeof raw !== 'string') return err('REPEATED');
  return ok(raw);
}

function invalidQuery(
  request: FastifyRequest,
  reply: FastifyReply,
  field: string,
  reason: string,
): FastifyReply {
  return reply.status(400).send(
    errorBody('COMMON_VALIDATION_FAILED', `${field} is invalid`, request.id, {
      fields: [{ field, reason }],
    }),
  );
}

function notFound(
  request: FastifyRequest,
  reply: FastifyReply,
  resourceType: string,
  resourceId: string,
): FastifyReply {
  return reply
    .status(404)
    .send(
      errorBody('CONTENT_NOT_FOUND', 'No such content', request.id, { resourceType, resourceId }),
    );
}

function gone(
  request: FastifyRequest,
  reply: FastifyReply,
  resourceType: string,
  resourceId: string,
): FastifyReply {
  return reply.status(410).send(
    errorBody('CONTENT_OFFLINE', 'This content is no longer available', request.id, {
      resourceType,
      resourceId,
    }),
  );
}

/**
 * Draft and offline are different answers on purpose.
 *
 * A draft is indistinguishable from a typo — 404, and the endpoint reveals nothing about content
 * that has not been announced. An offline drama did exist, and every deep link and history entry
 * pointing at it needs to be told so: 410 routes the client to the "no longer available" state
 * instead of the "wrong link" one (`docs/architecture/system-overview.md` §6.2).
 */
function contentBlocked(drama: DramaRecord): 'NOT_FOUND' | 'OFFLINE' | null {
  if (drama.status === 'DRAFT') return 'NOT_FOUND';
  if (drama.status === 'OFFLINE') return 'OFFLINE';
  return null;
}

export async function catalogRoutes(
  app: FastifyInstance,
  options: CatalogRouteOptions,
): Promise<void> {
  const { store, viewerResolver } = options;

  app.get('/v1/dramas', async (request, reply) => {
    const query = request.query as Record<string, unknown>;

    const category = singleValue(query['category']);
    const tag = singleValue(query['tag']);
    const sort = singleValue(query['sort']);
    const cursor = singleValue(query['cursor']);

    if (!category.ok) return invalidQuery(request, reply, 'category', 'repeated');
    if (!tag.ok) return invalidQuery(request, reply, 'tag', 'repeated');
    if (!sort.ok) return invalidQuery(request, reply, 'sort', 'repeated');
    if (!cursor.ok) return invalidQuery(request, reply, 'cursor', 'repeated');

    if (
      category.value !== undefined &&
      !(DRAMA_CATEGORIES as readonly string[]).includes(category.value)
    ) {
      return invalidQuery(request, reply, 'category', 'unknown');
    }
    if (tag.value !== undefined && (tag.value.length === 0 || tag.value.length > MAX_TAG_LENGTH)) {
      return invalidQuery(request, reply, 'tag', 'length');
    }
    if (sort.value !== undefined && !(DRAMA_SORTS as readonly string[]).includes(sort.value)) {
      return invalidQuery(request, reply, 'sort', 'unknown');
    }

    const limit = parseLimit(query['limit'], DRAMA_LIMIT);
    if (!limit.ok) return invalidQuery(request, reply, 'limit', 'out of range');

    const effectiveSort = (sort.value ?? 'HOT') as DramaSort;
    const dramas = await store.listDramas({
      category: category.value as DramaCategory | undefined,
      tag: tag.value,
      sort: effectiveSort,
    });

    const page = paginate(dramas, {
      keyOf: (drama) => dramaSortKey(effectiveSort, drama),
      limit: limit.value,
      cursor: cursor.value,
      fingerprint: queryFingerprint({
        list: 'dramas',
        sort: effectiveSort,
        category: category.value ?? null,
        tag: tag.value ?? null,
      }),
    });
    if (!page.ok) return invalidQuery(request, reply, 'cursor', 'not valid for this query');

    return reply.status(200).send({
      items: page.value.items.map(toDramaSummary),
      pageInfo: page.value.pageInfo,
    });
  });

  app.get('/v1/dramas/:dramaId', async (request, reply) => {
    const { dramaId } = request.params as { dramaId: string };

    const found = await store.getDrama(dramaId);
    if (found === undefined) return notFound(request, reply, 'DRAMA', dramaId);

    const blocked = contentBlocked(found.drama);
    if (blocked === 'NOT_FOUND') return notFound(request, reply, 'DRAMA', dramaId);
    if (blocked === 'OFFLINE') return gone(request, reply, 'DRAMA', dramaId);

    const episodes = await store.listEpisodes(dramaId);

    return reply.status(200).send(toDramaDetail(found.drama, found.seasons, episodes));
  });

  app.get('/v1/dramas/:dramaId/episodes', async (request, reply) => {
    const { dramaId } = request.params as { dramaId: string };
    const query = request.query as Record<string, unknown>;

    const seasonNumber = singleValue(query['seasonNumber']);
    const cursor = singleValue(query['cursor']);
    if (!seasonNumber.ok) return invalidQuery(request, reply, 'seasonNumber', 'repeated');
    if (!cursor.ok) return invalidQuery(request, reply, 'cursor', 'repeated');

    if (seasonNumber.value !== undefined && !/^[1-9][0-9]*$/.test(seasonNumber.value)) {
      return invalidQuery(request, reply, 'seasonNumber', 'must be a positive integer');
    }

    const limit = parseLimit(query['limit'], EPISODE_LIMIT);
    if (!limit.ok) return invalidQuery(request, reply, 'limit', 'out of range');

    const found = await store.getDrama(dramaId);
    if (found === undefined) return notFound(request, reply, 'DRAMA', dramaId);

    const blocked = contentBlocked(found.drama);
    if (blocked === 'NOT_FOUND') return notFound(request, reply, 'DRAMA', dramaId);
    if (blocked === 'OFFLINE') return gone(request, reply, 'DRAMA', dramaId);

    let episodes = await store.listEpisodes(dramaId);

    if (seasonNumber.value !== undefined) {
      const wanted = Number.parseInt(seasonNumber.value, 10);
      // A season that does not exist is a 404 rather than an empty page: "this drama has no season
      // 9" and "season 9 has no episodes yet" are different answers, and only one of them is true.
      const season = found.seasons.find(
        (candidate) => candidate.seasonNumber === wanted && candidate.status === 'PUBLISHED',
      );
      if (season === undefined) {
        return notFound(request, reply, 'SEASON', `${dramaId}#${seasonNumber.value}`);
      }
      episodes = episodes.filter((positioned) => positioned.seasonNumber === wanted);
    }

    const page = paginate(episodes, {
      keyOf: (positioned) => ascendingKey(positioned.globalEpisodeNumber),
      limit: limit.value,
      cursor: cursor.value,
      fingerprint: queryFingerprint({
        list: 'episodes',
        dramaId,
        seasonNumber: seasonNumber.value ?? null,
      }),
    });
    if (!page.ok) return invalidQuery(request, reply, 'cursor', 'not valid for this query');

    const viewer = await viewerResolver.resolve(request);
    const items: readonly EpisodeItem[] = page.value.items.map((positioned) =>
      toEpisodeItem(positioned, found.drama, viewer),
    );

    const body: Page<EpisodeItem> = { items, pageInfo: page.value.pageInfo };
    return reply.status(200).send(body);
  });

  app.get('/v1/episodes/:episodeId', async (request, reply) => {
    const { episodeId } = request.params as { episodeId: string };

    const found = await store.getEpisode(episodeId);
    if (found === undefined) return notFound(request, reply, 'EPISODE', episodeId);

    const blocked = contentBlocked(found.drama);
    if (blocked === 'NOT_FOUND') return notFound(request, reply, 'DRAMA', found.drama.id);
    if (blocked === 'OFFLINE') return gone(request, reply, 'DRAMA', found.drama.id);

    // The listing keeps an offline episode visible so the grid does not renumber itself; asking for
    // that episode directly is a different question, and it gets the honest answer.
    if (found.positioned.seasonStatus === 'OFFLINE') {
      return gone(request, reply, 'SEASON', found.positioned.episode.seasonId);
    }
    if (found.positioned.episode.status === 'OFFLINE') {
      return gone(request, reply, 'EPISODE', episodeId);
    }

    const viewer = await viewerResolver.resolve(request);

    return reply.status(200).send(toEpisodeItem(found.positioned, found.drama, viewer));
  });
}
