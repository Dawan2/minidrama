import { computeViewerAccess, effectivePriceCoins, effectiveUnlockPolicy } from './access.js';
import { safeCoverUrl } from './covers.js';
import type { DramaDetail, DramaSummary, EpisodeItem, SeasonSummary } from '@minidrama/shared';
import type { DramaRecord, PositionedEpisode, SeasonRecord } from './types.js';
import type { Viewer } from './viewer.js';

/**
 * Record → view object.
 *
 * This is the layer that decides what the client is *not* told, which matters more than what it is.
 * A view carries no publication status, no asset key, no raw per-season policy and no play handle:
 * those are inputs to server decisions, and shipping them invites a client to redo the decision.
 *
 * It is also the layer where a stored cover URL becomes a URL the WebView will fetch, so every
 * cover leaves through `safeCoverUrl` and none leaves as it was stored. See `covers.ts` for why the
 * check belongs at this boundary rather than at ingestion or in a route.
 */

export function toDramaSummary(drama: DramaRecord): DramaSummary {
  return {
    id: drama.id,
    title: drama.title,
    coverUrl: safeCoverUrl(drama.coverUrl),
    category: drama.category,
    tags: drama.tags,
    totalEpisodes: drama.totalEpisodes,
    freeEpisodes: drama.freeEpisodes,
    isCompleted: drama.isCompleted,
    stat: drama.stat,
  };
}

function toSeasonSummary(season: SeasonRecord, episodeCount: number): SeasonSummary {
  return {
    id: season.id,
    seasonNumber: season.seasonNumber,
    title: season.title,
    episodeCount,
  };
}

export function toDramaDetail(
  drama: DramaRecord,
  seasons: readonly SeasonRecord[],
  episodes: readonly PositionedEpisode[],
  viewer: DramaDetail['viewer'] = null,
): DramaDetail {
  const countsBySeason = new Map<string, number>();
  for (const positioned of episodes) {
    countsBySeason.set(
      positioned.episode.seasonId,
      (countsBySeason.get(positioned.episode.seasonId) ?? 0) + 1,
    );
  }

  return {
    ...toDramaSummary(drama),
    description: drama.description,
    horizontalCoverUrl: safeCoverUrl(drama.horizontalCoverUrl),
    // An offline season is not shown. Its episodes are not listed either, so advertising it would
    // put a season tab in the UI that opens onto nothing.
    seasons: seasons
      .filter((season) => season.status === 'PUBLISHED')
      .map((season) => toSeasonSummary(season, countsBySeason.get(season.id) ?? 0)),
    // Anonymous stays `null` ("not known"), never `{ favorited: false }`: the client renders false
    // as a confirmed empty heart, and we do not know. A signed-in viewer is passed in from the
    // route, which reads the same favourites store the verbs use (W8-c).
    viewer,
  };
}

export function toEpisodeItem(
  positioned: PositionedEpisode,
  drama: DramaRecord,
  viewer: Viewer,
): EpisodeItem {
  return {
    id: positioned.episode.id,
    dramaId: positioned.episode.dramaId,
    seasonId: positioned.episode.seasonId,
    seasonNumber: positioned.seasonNumber,
    episodeNumber: positioned.episode.episodeNumber,
    globalEpisodeNumber: positioned.globalEpisodeNumber,
    title: positioned.episode.title,
    durationSec: positioned.episode.durationSec,
    unlockPolicy: effectiveUnlockPolicy(positioned, drama),
    priceCoins: effectivePriceCoins(positioned, drama),
    viewerAccess: computeViewerAccess(positioned, drama, viewer),
  };
}
