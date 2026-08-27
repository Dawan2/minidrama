import { err } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * What a progress row does not know, for the per-drama read.
 *
 * `watch_progress` is keyed `(user_id, episode_id)`. `GET /v1/progress/dramas/{dramaId}` has to
 * answer in drama-wide episode numbers, and those numbers belong to `catalog`. Parsing them out of
 * an episode id, or treating storage order as running order, is how a watched mark lands on the
 * wrong cell — season 2 episode 1 is episode 1 of its season and episode 4 of `drm_dynasty_0002`.
 *
 * So this is a port. History already has one (`catalog-port.ts`) that describes *watched* ids; this
 * one lists a *drama's* listed episodes so the route can read the store by those ids and emit
 * nothing it cannot number. Two ports rather than one method on the history port: history's default
 * still refuses, and wiring this read must not quietly start serving history rows from a fixture.
 *
 * **The default refuses.** An empty list is "this drama has no listed episodes" and also "this
 * viewer has never watched it" after a store miss. Inventing either from an unwired catalogue is
 * the lie the picker would paint as a clean grid of unwatched cells.
 */

/** One listed episode, numbered the way the storefront numbers it. */
export interface DramaEpisodeRef {
  readonly episodeId: string;
  /** Drama-wide running order. The number PNL-01 displays. */
  readonly globalEpisodeNumber: number;
}

export type DramaProgressCatalogFailure = 'CATALOG_UNAVAILABLE';

export interface DramaProgressCatalogPort {
  /**
   * Listed episodes of `dramaId`, in global order.
   *
   * **A missing or unpublished drama is an empty list, not a failure.** The picker already loaded
   * the episode grid from catalog; an unknown id here is "nothing to mark", not a retry. Failure
   * is reserved for "we could not ask", which must not collapse into that empty list.
   */
  listDramaEpisodes(
    dramaId: string,
  ): Promise<Result<readonly DramaEpisodeRef[], DramaProgressCatalogFailure>>;
}

/** The fail-closed default: no catalogue, therefore no numbers, therefore no drama-progress view. */
export function createUnavailableDramaProgressCatalogPort(): DramaProgressCatalogPort {
  return {
    listDramaEpisodes: async () => err('CATALOG_UNAVAILABLE'),
  };
}
