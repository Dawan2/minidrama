import type { EpisodeRecord, PositionedEpisode, SeasonRecord } from './types.js';

/**
 * Global episode numbering, and the visibility rules that ride on it.
 *
 * The catalogue keeps seasons (`docs/12-domain-model.md` §3.2) but the storefront is flat: the
 * episode list is "the drama, in running order", because a short drama is watched as one continuous
 * thing and most have exactly one season (W1B decision 10, `docs/handoff/w1-work-b.md`).
 *
 * That makes `globalEpisodeNumber` — not the per-season `episodeNumber` — the number that means
 * anything to a viewer, and therefore the number the free window is measured in. The per-season
 * reading of "first N free" is the expensive bug hiding in this module: under it, a drama that adds
 * a second season gives away that season's first N episodes too, for as many seasons as it ever
 * ships. `episodeNumber` is only unique within a season; a rule keyed on it is not a rule about the
 * drama at all.
 *
 * Two ordering decisions follow, both about stability rather than aesthetics:
 *
 * 1. **A numbered episode keeps its number when it goes offline.** Renumbering after a takedown
 *    would make "episode 7" a different episode tomorrow — breaking deep links, saved progress and
 *    the free window all at once — so offline episodes hold their place.
 * 2. **Drafts are not numbered.** They have never been published, so nothing refers to them, and
 *    counting them would push published episodes out of the free window while they sit unreleased.
 */

/**
 * Assigns global numbers over every non-draft episode of every non-draft season, ordered by
 * `(seasonNumber, episodeNumber)`.
 *
 * The result is sorted in that order, which is also the order the flattened episode list is served
 * in and the ascending sort key pagination walks.
 */
export function positionEpisodes(
  seasons: readonly SeasonRecord[],
  episodes: readonly EpisodeRecord[],
): readonly PositionedEpisode[] {
  const numberedSeasons = new Map(
    seasons.filter((season) => season.status !== 'DRAFT').map((season) => [season.id, season]),
  );

  const ordered = episodes
    .filter((episode) => episode.status !== 'DRAFT' && numberedSeasons.has(episode.seasonId))
    .map((episode) => ({ episode, season: numberedSeasons.get(episode.seasonId) as SeasonRecord }))
    .sort(
      (a, b) =>
        a.season.seasonNumber - b.season.seasonNumber ||
        a.episode.episodeNumber - b.episode.episodeNumber,
    );

  return ordered.map((entry, index) => ({
    episode: entry.episode,
    seasonNumber: entry.season.seasonNumber,
    seasonStatus: entry.season.status,
    globalEpisodeNumber: index + 1,
  }));
}

/**
 * Whether an episode appears in the storefront at all.
 *
 * An offline *episode* stays listed — the grid would otherwise skip a number and claim the drama is
 * shorter than it is — and is reported `UNAVAILABLE`. An offline *season* takes its episodes with
 * it, because the domain model makes a season's visibility govern its episodes (§3.2) and a season
 * is pulled as a unit.
 */
export function isListed(positioned: PositionedEpisode): boolean {
  return positioned.seasonStatus !== 'OFFLINE';
}

/** True when the drama-level free window covers this position. */
export function isWithinFreeWindow(globalEpisodeNumber: number, freeEpisodes: number): boolean {
  return globalEpisodeNumber <= freeEpisodes;
}
