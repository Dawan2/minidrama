/**
 * How PNL-01 slices a long episode list into tabs.
 *
 * `docs/02-screen-inventory.md` PNL-01: groups of 30, because the product's stated shape is 80+
 * episodes and a single scrolling grid of eighty numbers is how a viewer loses the episode they
 * were looking for. The size is a display decision, not a paging decision — the list is still the
 * cursor-paged `GET /v1/dramas/{dramaId}/episodes` response, concatenated.
 *
 * Grouping is by `globalEpisodeNumber`, never by array index and never by the per-season
 * `episodeNumber`. Using the per-season number would put "season 2 episode 1" in group 1 of every
 * season a drama ever adds.
 */

export const EPISODE_GROUP_SIZE = 30;

/**
 * Zero-based group for a global episode number. Numbers below 1 collapse to group 0 rather than
 * producing a negative index a tab list cannot address.
 */
export function episodeGroupIndex(globalEpisodeNumber: number): number {
  const n = Number.isFinite(globalEpisodeNumber) ? Math.trunc(globalEpisodeNumber) : 1;
  return Math.max(0, Math.floor((n - 1) / EPISODE_GROUP_SIZE));
}

export function episodeGroupCount(maxGlobalEpisodeNumber: number): number {
  if (!Number.isFinite(maxGlobalEpisodeNumber) || maxGlobalEpisodeNumber < 1) {
    return 0;
  }
  return episodeGroupIndex(maxGlobalEpisodeNumber) + 1;
}

/**
 * Inclusive display range for a group, clipped to `maxGlobalEpisodeNumber` so the last tab on an
 * 80-episode drama reads 61–80 rather than 61–90.
 */
export function episodeGroupBounds(
  groupIndex: number,
  maxGlobalEpisodeNumber: number,
): { readonly start: number; readonly end: number } {
  const start = Math.max(0, groupIndex) * EPISODE_GROUP_SIZE + 1;
  const unclippedEnd = start + EPISODE_GROUP_SIZE - 1;
  const end = Math.min(unclippedEnd, Math.max(start, maxGlobalEpisodeNumber));
  return { start, end };
}
