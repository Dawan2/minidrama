import { describe, expect, it, vi } from 'vitest';

import { createCatalogDramaSummaryLookup } from './summary-lookup.js';
import { createInMemoryCatalogStore } from './store.js';
import { toDramaSummary } from './views.js';
import type { CatalogStore } from './store.js';

function countingStore(): {
  readonly store: CatalogStore;
  readonly getDramasCalls: () => number;
  readonly getDramaCalls: () => number;
} {
  const inner = createInMemoryCatalogStore();
  let getDramasCalls = 0;
  let getDramaCalls = 0;

  return {
    getDramasCalls: () => getDramasCalls,
    getDramaCalls: () => getDramaCalls,
    store: {
      listDramas: (query) => inner.listDramas(query),
      getDrama: (dramaId) => {
        getDramaCalls += 1;
        return inner.getDrama(dramaId);
      },
      getDramas: (dramaIds) => {
        getDramasCalls += 1;
        return inner.getDramas(dramaIds);
      },
      listEpisodes: (dramaId) => inner.listEpisodes(dramaId),
      getEpisode: (episodeId) => inner.getEpisode(episodeId),
    },
  };
}

describe('createCatalogDramaSummaryLookup', () => {
  it('projects published dramas through toDramaSummary and omits the rest', async () => {
    const lookup = createCatalogDramaSummaryLookup(createInMemoryCatalogStore());
    const inner = createInMemoryCatalogStore();
    const published = await inner.getDrama('drm_revenge_0001');

    const summaries = await lookup.getDramaSummaries([
      'drm_revenge_0001',
      'drm_offline_0007',
      'drm_draft_0008',
      'drm_missing',
    ]);

    expect([...summaries.keys()]).toEqual(['drm_revenge_0001']);
    expect(summaries.get('drm_revenge_0001')).toEqual(toDramaSummary(published!.drama));
  });

  it('asks the store once however many ids it is given', async () => {
    const counted = countingStore();
    const lookup = createCatalogDramaSummaryLookup(counted.store);
    const ids = Array.from({ length: 20 }, (_, index) => `drm_${String(index).padStart(2, '0')}`);

    await lookup.getDramaSummaries(ids);
    await lookup.getDramaSummaries(ids);

    expect(counted.getDramasCalls()).toBe(2);
    expect(counted.getDramaCalls()).toBe(0);
  });

  it('does not call getDrama at all — that would be the N+1 this exists to prevent', async () => {
    const inner = createInMemoryCatalogStore();
    const getDrama = vi.fn(inner.getDrama.bind(inner));
    const store: CatalogStore = {
      ...inner,
      getDrama,
    };

    await createCatalogDramaSummaryLookup(store).getDramaSummaries([
      'drm_revenge_0001',
      'drm_dynasty_0002',
    ]);

    expect(getDrama).not.toHaveBeenCalled();
  });
});
