import type { DramaSummary } from './catalog.js';

/**
 * The watch-history list: "what was I watching", one row per drama.
 *
 * `GET /v1/users/me/watch-history` answers a `Page<WatchHistoryEntry>` sorted `watchedAt`
 * descending (`docs/12-api-contracts.md` §4.7). It is per-drama rather than per-episode on purpose:
 * the underlying storage is keyed `(userId, episodeId)` and a viewer who watched eleven episodes of
 * one drama has eleven rows, which is a resume list nobody asked for. The drama is the unit the
 * screen renders, so the newest row per drama is the one that survives into the list.
 *
 * This is the only list read in the product that is **not** anonymous-capable. History belongs to a
 * session, so the three honest answers are a list, an empty list, and `401` — three different
 * screens, and the reason the endpoint must never answer an empty page to a caller it could not
 * identify.
 */
export interface WatchHistoryEntry {
  readonly drama: DramaSummary;
  /**
   * Counted in `globalEpisodeNumber`, the number the client displays everywhere else. The
   * per-season number would name a different episode in every season past the first.
   */
  readonly lastEpisodeNumber: number;
  /** Where to resume, in whole seconds. Always present: a stored row always has a position. */
  readonly lastPositionSec: number;
  /** ISO-8601, server time of the last accepted report. The sort key; clients never reorder by it. */
  readonly watchedAt: string;
  /**
   * The episode to resume.
   *
   * `docs/12-api-contracts.md` §4.7 lists four fields and none of them can address the player:
   * `#/play/:episodeId` takes an episode id, and an episode *number* is not one
   * (`docs/02-information-architecture.md` §5). Without this field the one-tap resume that is the
   * entire product purpose of the screen (`docs/02-user-journeys.md` J3, J8) cannot be built, so
   * the client registered it as a contract gap and read it tolerantly
   * (`docs/handoff/w3-work-m.md` §5). It is answered here, and it is never absent: every row in
   * this list is derived from a stored progress row, and that row is keyed by the episode id.
   */
  readonly lastEpisodeId: string;
}
