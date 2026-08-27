import { computeViewerAccess, effectivePriceCoins, effectiveUnlockPolicy } from './access.js';
import type { DramaDetail, DramaSummary, EpisodeItem, SeasonSummary } from '@minidrama/shared';
import type { DramaRecord, PositionedEpisode, SeasonRecord } from './types.js';
import type { Viewer } from './viewer.js';

/**
 * Record → view object.
 *
 * This is the layer that decides what the client is *not* told, which matters more than what it is.
 * A view carries no publication status, no asset key, no raw per-season policy and no play handle:
 * those are inputs to server decisions, and shipping them invites a client to redo the decision.
 */

export function toDramaSummary(drama: DramaRecord): DramaSummary {
  return {
    id: drama.id,
    title: drama.title,
    coverUrl: drama.coverUrl,
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
    horizontalCoverUrl: drama.horizontalCoverUrl,
    // An offline season is not shown. Its episodes are not listed either, so advertising it would
    // put a season tab in the UI that opens onto nothing.
    seasons: seasons
      .filter((season) => season.status === 'PUBLISHED')
      .map((season) => toSeasonSummary(season, countsBySeason.get(season.id) ?? 0)),
    // Favourites and watch progress belong to modules that do not exist yet. `favorited: false` is
    // not a safe stand-in: the client renders it as a confirmed empty heart, so a real favourite
    // would appear to have been dropped. `null` says "not known", which the UI can defer on.
    viewer: null,
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
