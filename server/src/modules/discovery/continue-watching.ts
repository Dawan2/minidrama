import type { ContinueWatchingEntry, ContinueWatchingSource } from './feed.js';
import type { WatchProgressStore } from '../progress/store.js';

/**
 * The HOME feed's continue-watching rail, from the heartbeat table.
 *
 * The composer and the route already knew how to lead with a `CONTINUE_WATCHING` card and how to
 * drop a card that pointed at delisted content. What they did not have was a source: Wave 1 left
 * the rail empty because the progress module did not exist yet, and an invented rail for a viewer
 * nobody resolved is worse than an absent one. Heartbeats now write. Playback sessions now read.
 * This is the same table, the same key `(userId, episodeId)`, and the same newest-first order the
 * history list uses.
 *
 * Fail-closed properties, each with a test:
 *
 *   - **anonymous is empty and does not read the store.** A shared "anonymous" account would put
 *     every signed-out caller on the same rail;
 *   - **another viewer's rows are unreachable.** The store keys on user id; this module does not
 *     re-query by episode;
 *   - **a stored position that is not a non-negative integer is dropped**, not forwarded as a
 *     seek. Playback does the same for `resumePositionSec`;
 *   - **completed is not a restart.** A finished episode still resumes where it was stored. Inventing
 *     `0` would be a guess the heartbeat table already refused.
 */

/**
 * How many progress rows are read to build the rail.
 *
 * Same compromise as `WATCH_HISTORY_SCAN_LIMIT`: grouping by drama happens *after* the catalogue
 * confirms the episode still exists, so a viewer whose newest hundreds of rows all belong to one
 * drama would otherwise occupy the whole bound with a single card. The durable path can replace
 * this with `DISTINCT ON (drama_id)` later; until then the bound is real.
 */
export const CONTINUE_WATCHING_SCAN_LIMIT = 500;

function isResumePosition(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createProgressContinueWatchingSource(
  store: WatchProgressStore,
): ContinueWatchingSource {
  return {
    async forViewer(userId) {
      if (userId === null || userId.length === 0) return [];

      const rows = await store.list(userId, CONTINUE_WATCHING_SCAN_LIMIT);
      const entries: ContinueWatchingEntry[] = [];

      for (const row of rows) {
        if (!isResumePosition(row.positionSec)) continue;
        entries.push({ episodeId: row.episodeId, positionSec: row.positionSec });
      }

      return entries;
    },
  };
}
