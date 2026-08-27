import { FEED_SCENES } from '@minidrama/shared';
import { randomBytes } from 'node:crypto';
import type { FeedCard, FeedScene } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { ascendingKey, paginate, parseLimit, queryFingerprint } from '../../core/pagination.js';
import { composeFeed } from './feed.js';
import { errorBody } from '../../core/errors.js';
import { toDramaSummary } from '../catalog/views.js';
import type { CatalogStore } from '../catalog/store.js';
import type { ContinueWatchingSource, ResolvedContinueEntry } from './feed.js';
import type { ViewerResolver } from '../catalog/viewer.js';
import type { ViewerResolver as SessionViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * The recommendation feed (`docs/12-api-contracts.md` §4.8).
 *
 * Anonymous-capable: without a session the viewer has no progress, so the response is the
 * non-personalised popularity/recency mix rather than an error.
 */

/** Cards are heavy — each one carries a summary and drives episode preload — so the page is small. */
const FEED_LIMIT = { fallback: 10, max: 50 };

export interface DiscoveryRouteOptions {
  readonly store: CatalogStore;
  readonly viewerResolver: ViewerResolver;
  /**
   * Who is signed in, for the continue-watching rail. Distinct from `viewerResolver` above, which
   * answers unlocks and VIP and is still the anonymous placeholder on the default deployment.
   * Optional so a catalogue-only test can still boot; without it the rail stays empty.
   *
   * A bad token does not 401 this public read — it is answered as anonymous, same as folding
   * `viewer.favorited` into the drama detail. The home feed is anonymous-capable; a rejected
   * session is not a reason to refuse the popularity mix.
   */
  readonly sessionViewer?: SessionViewerResolver;
  readonly continueWatching: ContinueWatchingSource;
}

/**
 * One impression identifier per card per response.
 *
 * It is minted fresh rather than derived from the drama id: the analytics join is
 * "which impression produced this click", and an identifier reused across responses collapses two
 * impressions into one and makes click-through rate unmeasurable.
 */
function trackingId(): string {
  return `trk_${randomBytes(8).toString('hex')}`;
}

export async function discoveryRoutes(
  app: FastifyInstance,
  options: DiscoveryRouteOptions,
): Promise<void> {
  const { store, sessionViewer, continueWatching } = options;

  app.get('/v1/recommendations/feed', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const rawScene = query['scene'];
    const rawCursor = query['cursor'];

    if (rawScene !== undefined && typeof rawScene !== 'string') {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'scene is invalid', request.id, {
          fields: [{ field: 'scene', reason: 'repeated' }],
        }),
      );
    }
    if (rawScene !== undefined && !(FEED_SCENES as readonly string[]).includes(rawScene)) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'scene is invalid', request.id, {
          fields: [{ field: 'scene', reason: 'unknown' }],
        }),
      );
    }
    if (rawCursor !== undefined && typeof rawCursor !== 'string') {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'cursor is invalid', request.id, {
          fields: [{ field: 'cursor', reason: 'repeated' }],
        }),
      );
    }

    const limit = parseLimit(query['limit'], FEED_LIMIT);
    if (!limit.ok) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'limit is invalid', request.id, {
          fields: [{ field: 'limit', reason: 'out of range' }],
        }),
      );
    }

    const scene = (rawScene ?? 'HOME') as FeedScene;
    // Public read: a missing, rejected, or unresolvable session is anonymous, not a 401. Progress
    // and history 401 because the row *is* the identity; the feed is still a catalogue mix.
    const session = sessionViewer?.resolve(request.headers.authorization);
    const userId = session?.ok === true ? session.value : null;

    const [hot, recent, progress] = await Promise.all([
      store.listDramas({ sort: 'HOT' }),
      store.listDramas({ sort: 'NEW' }),
      continueWatching.forViewer(userId),
    ]);

    const resolved: ResolvedContinueEntry[] = [];
    for (const entry of progress) {
      const found = await store.getEpisode(entry.episodeId);
      // A progress record outlives the content it points at. Serving a continue-watching card for a
      // delisted drama or a withdrawn episode sends the viewer straight into an error screen, so the
      // card is dropped and the drama is left to reach the feed on its own merits.
      if (found === undefined) continue;
      if (found.drama.status !== 'PUBLISHED') continue;
      if (found.positioned.seasonStatus !== 'PUBLISHED') continue;
      if (found.positioned.episode.status !== 'PUBLISHED') continue;

      resolved.push({
        drama: found.drama,
        episodeId: entry.episodeId,
        // The catalogue's number, never the one carried in the progress record: numbering is a
        // property of the drama and a stored copy can be stale.
        globalEpisodeNumber: found.positioned.globalEpisodeNumber,
        positionSec: entry.positionSec,
      });
    }

    const entries = composeFeed({ scene, hot, recent, continueWatching: resolved });

    const page = paginate(entries, {
      keyOf: (entry) => `${ascendingKey(entry.rank)}|${entry.drama.id}`,
      limit: limit.value,
      cursor: rawCursor,
      fingerprint: queryFingerprint({ list: 'feed', scene, viewer: userId ?? 'anonymous' }),
    });
    if (!page.ok) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'cursor is invalid', request.id, {
          fields: [{ field: 'cursor', reason: 'not valid for this query' }],
        }),
      );
    }

    const items: readonly FeedCard[] = page.value.items.map((entry) => ({
      cardType: entry.cardType,
      drama: toDramaSummary(entry.drama),
      continueEpisode: entry.continueEpisode,
      recReason: entry.recReason,
      trackingId: trackingId(),
    }));

    return reply.status(200).send({ items, pageInfo: page.value.pageInfo });
  });
}
