import type { DramaSummary } from '@minidrama/shared';

import { toDramaSummary } from './views.js';
import type { CatalogStore } from './store.js';

/**
 * The question the favourites list asks of the catalogue: turn a page of drama ids into the
 * catalogue's own `DramaSummary` objects, in one lookup.
 *
 * Search owns the favourite *rows*; catalog owns the view object. This adapter is the join, and it
 * is the only place a favourite becomes a summary — a second assembler is how `totalEpisodes`
 * starts disagreeing (decision S60). Unpublished and unknown ids are absent from the map, which the
 * list handler reads as `drama: null` so a delisted favourite keeps its place (W8-a).
 */
export interface DramaSummaryLookup {
  getDramaSummaries(dramaIds: readonly string[]): Promise<ReadonlyMap<string, DramaSummary>>;
}

export function createCatalogDramaSummaryLookup(store: CatalogStore): DramaSummaryLookup {
  return {
    async getDramaSummaries(dramaIds) {
      const records = await store.getDramas(dramaIds);
      const summaries = new Map<string, DramaSummary>();

      for (const id of dramaIds) {
        const record = records.get(id);
        if (record === undefined || record.status !== 'PUBLISHED') continue;
        summaries.set(id, toDramaSummary(record));
      }

      return summaries;
    },
  };
}
