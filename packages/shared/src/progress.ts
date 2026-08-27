/**
 * Watch progress: the two shapes that cross the wire.
 *
 * The write and the read are deliberately *not* the same shape, and the field names say why. A
 * client reporting where it is says `positionSec` — an observation about the past. The server
 * answering where to start says `resumePositionSec` — an instruction about the future, and the same
 * name the playback descriptor carries (`docs/design/playback-contract.md` §3.1), so a client that
 * reads a resume position from either endpoint reads it from the same key.
 */

/**
 * A heartbeat or an exit report. `PUT /v1/progress/episodes/{episodeId}`, upsert.
 *
 * `durationSec` travels with every report because the position is meaningless without it: the
 * completion rule, the clamp and the "far beyond the episode" rejection are all relations between
 * the two, and an episode's duration is a property of the asset the player has and we do not.
 */
export interface WatchProgressReport {
  readonly positionSec: number;
  readonly durationSec: number;
  /**
   * The client's own clock at the moment the position was observed, ISO 8601. It is the
   * last-write-wins key: two devices watching the same episode are adjudicated on this, not on
   * arrival order, because arrival order is a property of the network (`PRG-001`).
   *
   * It is not trusted as a wall clock — see `futureSkewToleranceSec` in the server's merge rules.
   */
  readonly clientUpdatedAt: string;
}

/**
 * Where to resume. `GET /v1/progress/episodes/{episodeId}`.
 *
 * `recorded` exists so that "never watched" and "watched, position 0" are distinguishable. They
 * look identical through `resumePositionSec` alone, and a continue-watching entry point has to tell
 * them apart to decide whether the episode belongs in the list at all (`PRG-002`, `PRG-003`).
 */
export interface EpisodeResumeView {
  readonly episodeId: string;
  /** Always present, always `>= 0`, and `0` when nothing was ever reported. */
  readonly resumePositionSec: number;
  /**
   * Server-computed, from the position/duration ratio. A client-reported `completed` is ignored on
   * the way in (`docs/design/domain-model.md` §4.5) — it is a completion-count metric, so a client
   * that could set it could inflate it.
   */
  readonly completed: boolean;
  readonly recorded: boolean;
  /** The duration the last accepted report carried. Absent when nothing was ever reported. */
  readonly durationSec?: number;
  /** Server time of the last accepted report, ISO 8601. Absent when nothing was ever reported. */
  readonly updatedAt?: string;
}

/**
 * One stored row of `GET /v1/progress/dramas/{dramaId}` (`docs/12-api-contracts.md` §4.7).
 *
 * `episodeNumber` is the drama-wide running order (`globalEpisodeNumber`), the same number the
 * picker grid displays. The per-season `episodeNumber` would name a different episode in every
 * season past the first, which is how a watched mark lands on the wrong cell.
 *
 * Unwatched episodes are absent rather than listed with `completed: false`. The picker treats
 * presence-of-`completed: true` as the mark, and an item for every episode of an 80-episode drama
 * the viewer has never opened would look like a batch of "not watched" answers we do not have.
 */
export interface DramaProgressItem {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly positionSec: number;
  readonly completed: boolean;
}

/**
 * The newest accepted report under this drama, or `null` when `items` is empty.
 *
 * It is a pointer, not a second source of watched marks. The picker paints a cell watched only
 * when that cell's id appears on an item with `completed: true`. Inferring "everything before
 * `lastWatched.episodeNumber` is watched" is how a skip marks thirty cells the viewer never
 * opened.
 */
export interface DramaLastWatched {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly positionSec: number;
}

/**
 * Per-drama watch progress. `GET /v1/progress/dramas/{dramaId}`.
 *
 * `lastWatched` is always present as a key so "we looked and there is nothing" (`null`) is
 * distinguishable from a truncated body that omitted the field.
 */
export interface DramaProgressView {
  readonly items: readonly DramaProgressItem[];
  readonly lastWatched: DramaLastWatched | null;
}
