import { ok } from '@minidrama/shared';

import type { DramaProgressCatalogPort } from '../progress/drama-catalog-port.js';
import type { CatalogStore } from './store.js';

/**
 * The catalogue's answer to "which listed episodes does this drama have, in running order".
 *
 * Progress owns the rows; catalog owns the numbers. This adapter is the join, and it is the only
 * place a drama-progress item receives an `episodeNumber`. A second assembler is how season 2
 * episode 1 becomes "episode 1" on the picker.
 *
 * Unpublished and unknown dramas answer with an empty list. That is an answer, not a failure: the
 * picker already has the storefront list, and a withdrawn drama has no cell to mark. Failure is
 * reserved for the unavailable port, which this is not.
 */
export function createCatalogDramaProgressPort(store: CatalogStore): DramaProgressCatalogPort {
  return {
    async listDramaEpisodes(dramaId) {
      const found = await store.getDrama(dramaId);
      if (found === undefined || found.drama.status !== 'PUBLISHED') {
        return ok([]);
      }

      const listed = await store.listEpisodes(dramaId);
      return ok(
        listed.map((positioned) => ({
          episodeId: positioned.episode.id,
          globalEpisodeNumber: positioned.globalEpisodeNumber,
        })),
      );
    },
  };
}
