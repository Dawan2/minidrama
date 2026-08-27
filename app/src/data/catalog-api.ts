import type {
  DramaCategory,
  DramaDetail,
  DramaSummary,
  EpisodeItem,
  FeedCard,
  FeedScene,
  Page,
  Result,
  ViewerAccess,
} from '@minidrama/shared';

import { asRecord, narrow, narrowPage } from './narrow';
import type { ApiFailure } from './failure';
import type { HttpReader } from './http';

/**
 * The catalogue read surface, as the client sees it.
 *
 * Five endpoints, all anonymous-capable (`docs/12-api-contracts.md` §4.3, §4.8). The interface is
 * declared separately from the HTTP implementation because every screen test in this slot supplies
 * its own: a page's five states are a property of the page, and asserting them through a stubbed
 * `fetch` would be testing the transport twice.
 *
 * The paths are the ones the server registered in Wave 2 slot D and are written out rather than
 * assembled, so a rename shows up in a diff of this file. `GET /v1/episodes/{episodeId}` is the
 * lookup the player route needs: a deep link carries one episode id and the drama is recovered
 * from it (`docs/02-information-architecture.md` §5), which is why PNL-01 does not invent a
 * second way to ask.
 */

export const FEED_PATH = '/v1/recommendations/feed';
export const DRAMAS_PATH = '/v1/dramas';

export function dramaEndpoint(dramaId: string): string {
  return `/v1/dramas/${encodeURIComponent(dramaId)}`;
}

export function episodesEndpoint(dramaId: string): string {
  return `${dramaEndpoint(dramaId)}/episodes`;
}

export function episodeEndpoint(episodeId: string): string {
  return `/v1/episodes/${encodeURIComponent(episodeId)}`;
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

export interface DramasRequest {
  readonly category?: DramaCategory;
  readonly tag?: string;
  readonly sort?: 'HOT' | 'NEW';
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CatalogApi {
  fetchFeed(request: FeedRequest): Promise<Result<Page<FeedCard>, ApiFailure>>;
  fetchDramas(request: DramasRequest): Promise<Result<Page<DramaSummary>, ApiFailure>>;
  fetchDrama(dramaId: string): Promise<Result<DramaDetail, ApiFailure>>;
  fetchEpisode(episodeId: string): Promise<Result<EpisodeItem, ApiFailure>>;
  fetchEpisodes(request: EpisodesRequest): Promise<Result<Page<EpisodeItem>, ApiFailure>>;
}

/** Takes the read half of the transport, so a catalogue call cannot become a write. */
export function createCatalogApi(http: HttpReader): CatalogApi {
  return {
    fetchFeed: async (request) => {
      const body = await http.getJson(FEED_PATH, {
        scene: request.scene,
        cursor: request.cursor,
        limit: request.limit,
      });
      return body.ok ? narrowPage(body.value, narrowFeedCard) : body;
    },

    fetchDramas: async (request) => {
      const body = await http.getJson(DRAMAS_PATH, {
        category: request.category,
        tag: request.tag,
        sort: request.sort,
        cursor: request.cursor,
        limit: request.limit,
      });
      return body.ok ? narrowPage(body.value, narrowDramaSummary) : body;
    },

    fetchDrama: async (dramaId) => {
      const body = await http.getJson(dramaEndpoint(dramaId));
      return body.ok ? narrow(body.value, narrowDramaDetail) : body;
    },

    fetchEpisode: async (episodeId) => {
      const body = await http.getJson(episodeEndpoint(episodeId));
      return body.ok ? narrow(body.value, narrowEpisodeItem) : body;
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
 * The generic half — what counts as a page, and what a shape mismatch reports — lives in
 * `narrow.ts` and is shared with the other read clients. What stays here is the catalogue's own
 * knowledge: which fields of which view object a surface actually depends on. There is no schema
 * validation generated from the contract yet (`docs/handoff/w2-work-d.md` §4), so these are
 * hand-written and check the fields that drive a decision or an identifier, not every leaf.
 *
 * `narrowDramaSummary` is exported because a drama summary is not only a catalogue shape: the watch
 * history embeds one per entry (`docs/12-api-contracts.md` §4.7), and a second opinion about what a
 * valid summary looks like is a second thing to keep in step with the contract.
 */
export function narrowDramaSummary(value: unknown): DramaSummary | null {
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
