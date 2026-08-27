import { err } from '@minidrama/shared';
import type { DramaSummary, Result } from '@minidrama/shared';

/**
 * What a progress row does not know.
 *
 * `watch_progress` is keyed `(user_id, episode_id)` and holds a position, a duration and two
 * timestamps. A history row is a *drama* — a cover, a title, "continue episode 12" — so producing
 * one needs the episode's drama, the episode's position in that drama's running order, and the
 * drama's own summary. All three belong to `catalog`, and none of them belongs here.
 *
 * So this is a port rather than a query. The `catalog` module is in flight in an adjacent slot
 * (`PRG-003`), and the alternatives to an interface were both worse: waiting for it leaves the
 * history screen on a `404`, and reaching into its tables from `progress` would be the shared-table
 * coupling the modular monolith exists to prevent (`docs/architecture/system-overview.md` §7.1).
 * When the module lands, one adapter implements this and `buildApp` passes it — no route changes.
 *
 * **The default refuses.** It does not answer "no facts": an empty answer is indistinguishable from
 * "this viewer has watched nothing", and the one thing the history screen must be able to tell apart
 * from an empty list is a fault (`docs/handoff/w3-work-m.md` §5). Refusing is a `503` the client
 * renders as a retry; guessing would be a lie the client renders as "you have never watched
 * anything", and the viewer's answer to that is to stop looking.
 */

/** Everything a history row needs about one watched episode, beyond the stored progress. */
export interface WatchedEpisodeFacts {
  /**
   * The drama, as the wire carries it. Taken from `catalog` verbatim rather than rebuilt here: a
   * second place that assembles a `DramaSummary` is a second place for its counters to be wrong.
   */
  readonly drama: DramaSummary;
  /**
   * The episode's position within its **drama**, across seasons. This is the number the client
   * displays and the number the free window is measured in; the per-season `episodeNumber` would
   * name a different episode in every season past the first.
   */
  readonly globalEpisodeNumber: number;
}

/** Ours to fix, and not the caller's business — hence one failure and not a vocabulary. */
export type WatchedEpisodeFactsFailure = 'CATALOG_UNAVAILABLE';

export interface WatchHistoryCatalogPort {
  /**
   * Describes as many of `episodeIds` as the catalogue can.
   *
   * **A missing key is an answer, not a failure.** An episode that was deleted, or whose drama is
   * no longer published, has no history row to render: the client cannot open it, so offering it a
   * cover and a resume button would be offering a dead end. Those rows are dropped from the list
   * while the rest are served, which is why this returns a map keyed by episode id rather than a
   * list the caller has to re-align.
   */
  loadWatchedEpisodeFacts(
    episodeIds: readonly string[],
  ): Promise<Result<ReadonlyMap<string, WatchedEpisodeFacts>, WatchedEpisodeFactsFailure>>;
}

/** The fail-closed default: no catalogue, therefore no history rows and no pretence of any. */
export function createUnavailableWatchHistoryCatalogPort(): WatchHistoryCatalogPort {
  return {
    loadWatchedEpisodeFacts: async () => err('CATALOG_UNAVAILABLE'),
  };
}
