import { err, ok } from '@minidrama/shared';
import type {
  DramaDetail,
  DramaSummary,
  EpisodeItem,
  FeedCard,
  FeedScene,
  Page,
  Result,
  ViewerAccess,
} from '@minidrama/shared';

import { apiFailure } from './failure';
import type { ApiFailure } from './failure';
import type { HttpClient } from './http';

/**
 * The catalogue read surface, as the client sees it.
 *
 * Three endpoints, all anonymous-capable (`docs/12-api-contracts.md` §4.3, §4.8). The interface is
 * declared separately from the HTTP implementation because every screen test in this slot supplies
 * its own: a page's five states are a property of the page, and asserting them through a stubbed
 * `fetch` would be testing the transport twice.
 *
 * The paths are the ones the server registered in Wave 2 slot D and are written out rather than
 * assembled, so a rename shows up in a diff of this file.
 */

export const FEED_PATH = '/v1/recommendations/feed';

export function dramaEndpoint(dramaId: string): string {
  return `/v1/dramas/${encodeURIComponent(dramaId)}`;
}

export function episodesEndpoint(dramaId: string): string {
  return `${dramaEndpoint(dramaId)}/episodes`;
}

export interface FeedRequest {
  readonly scene: FeedScene;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface EpisodesRequest {
  readonly dramaId: string;
  readonly seasonNumber?: number;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CatalogApi {
  fetchFeed(request: FeedRequest): Promise<Result<Page<FeedCard>, ApiFailure>>;
  fetchDrama(dramaId: string): Promise<Result<DramaDetail, ApiFailure>>;
  fetchEpisodes(request: EpisodesRequest): Promise<Result<Page<EpisodeItem>, ApiFailure>>;
}

export function createCatalogApi(http: HttpClient): CatalogApi {
  return {
    fetchFeed: async (request) => {
      const body = await http.getJson(FEED_PATH, {
        scene: request.scene,
        cursor: request.cursor,
        limit: request.limit,
      });
      return body.ok ? narrowPage(body.value, narrowFeedCard) : body;
    },

    fetchDrama: async (dramaId) => {
      const body = await http.getJson(dramaEndpoint(dramaId));
      return body.ok ? narrow(body.value, narrowDramaDetail) : body;
    },

    fetchEpisodes: async (request) => {
      const body = await http.getJson(episodesEndpoint(request.dramaId), {
        seasonNumber: request.seasonNumber,
        cursor: request.cursor,
        limit: request.limit,
      });
      return body.ok ? narrowPage(body.value, narrowEpisodeItem) : body;
    },
  };
}

/**
 * Response narrowing.
 *
 * A `200` whose body is not the documented shape is a failure, not a value — and it has to be
 * caught here rather than at the point of use, because the alternative is a component reading
 * `items.map` off `undefined` and taking the whole screen down. There is no schema validation
 * generated from the contract yet (`docs/handoff/w2-work-d.md` §4), so these are hand-written and
 * check the fields the surfaces actually depend on: the ones that drive a decision or an
 * identifier, not every leaf.
 *
 * A shape mismatch reports `MALFORMED`, which classifies as retryable, on the reasoning that a
 * truncated body is far more likely in the field than a server that changed its contract.
 */
function narrow<T>(body: unknown, narrower: (value: unknown) => T | null): Result<T, ApiFailure> {
  const narrowed = narrower(body);
  return narrowed === null
    ? err(apiFailure({ kind: 'MALFORMED', message: 'the response did not match the contract' }))
    : ok(narrowed);
}

function narrowPage<T>(
  body: unknown,
  narrower: (value: unknown) => T | null,
): Result<Page<T>, ApiFailure> {
  const record = asRecord(body);
  const rawItems = record?.['items'];
  const pageInfo = asRecord(record?.['pageInfo']);
  const nextCursor = pageInfo?.['nextCursor'];
  const hasMore = pageInfo?.['hasMore'];

  if (
    !Array.isArray(rawItems) ||
    typeof hasMore !== 'boolean' ||
    !(typeof nextCursor === 'string' || nextCursor === null)
  ) {
    return err(apiFailure({ kind: 'MALFORMED', message: 'the response was not a page' }));
  }

  const items: T[] = [];
  for (const raw of rawItems) {
    const narrowed = narrower(raw);
    if (narrowed === null) {
      return err(
        apiFailure({ kind: 'MALFORMED', message: 'a page item did not match the contract' }),
      );
    }
    items.push(narrowed);
  }

  return ok({ items, pageInfo: { nextCursor, hasMore } });
}

function narrowDramaSummary(value: unknown): DramaSummary | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (typeof record['id'] !== 'string' || typeof record['title'] !== 'string') return null;
  if (typeof record['totalEpisodes'] !== 'number' || typeof record['freeEpisodes'] !== 'number') {
    return null;
  }
  return value as DramaSummary;
}

function narrowDramaDetail(value: unknown): DramaDetail | null {
  const record = asRecord(value);
  if (narrowDramaSummary(value) === null) return null;
  if (typeof record?.['description'] !== 'string') return null;
  if (!Array.isArray(record['seasons'])) return null;
  return value as DramaDetail;
}

function narrowEpisodeItem(value: unknown): EpisodeItem | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (typeof record['id'] !== 'string' || typeof record['dramaId'] !== 'string') return null;
  if (typeof record['globalEpisodeNumber'] !== 'number') return null;
  // `viewerAccess` is the only thing standing between a locked episode and a play button. A
  // missing or malformed one is not a field to default — the whole item is rejected.
  if (narrowViewerAccess(record['viewerAccess']) === null) return null;
  return value as EpisodeItem;
}

function narrowViewerAccess(value: unknown): ViewerAccess | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (typeof record['playable'] !== 'boolean' || typeof record['reason'] !== 'string') return null;
  return value as ViewerAccess;
}

function narrowFeedCard(value: unknown): FeedCard | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (record['cardType'] !== 'CONTINUE_WATCHING' && record['cardType'] !== 'DRAMA') return null;
  if (typeof record['trackingId'] !== 'string') return null;
  if (narrowDramaSummary(record['drama']) === null) return null;

  if (record['cardType'] === 'CONTINUE_WATCHING') {
    const episode = asRecord(record['continueEpisode']);
    // A continue-watching card whose episode is missing is a one-tap resume with nowhere to go.
    if (episode === null || typeof episode['episodeId'] !== 'string') return null;
  }

  return value as FeedCard;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
