import type { CatalogStore } from '../catalog/store.js';
import type { DramaRecord } from '../catalog/types.js';

/**
 * The dramas search and favourites can see — a port over `catalog`, not a second catalogue.
 *
 * `SearchableDrama` is field-for-field a subset of `catalog`'s `DramaRecord` — including
 * `stat.playCount`, which is why the nesting is preserved — so a `DramaRecord` satisfies it
 * structurally with no adapter. `createCatalogDramaDirectory` is the production implementation:
 * the same `CatalogStore` the drama page reads, including the sqlite tables migration `0007`
 * already persists. A searchable-only table would be a second catalogue DB.
 *
 * `createSeedDramaDirectory` remains for tests that inject a directory without standing up the
 * catalogue. The seed records below carry the same ids, titles, tags and counters as
 * `SEED_DRAMAS`, so those tests still assert against ids that exist on both sides.
 *
 * What is deliberately *not* modelled here: seasons, episodes, numbering, free windows,
 * `viewerAccess`, cover art. None of them is an input to a keyword match or a favourite row, and
 * every one of them is a rule `catalog` owns.
 */

/** `DRAFT → PUBLISHED ↔ OFFLINE` (`docs/12-domain-model.md` §3.1). Same union as `catalog`'s. */
export type DramaPublicationStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE';

export interface SearchableDrama {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly status: DramaPublicationStatus;
  /** Nested to match `catalog`'s `DramaRecord.stat`, of which this is a subset. */
  readonly stat: { readonly playCount: number };
}

/**
 * The whole catalogue dependency of this slot: list what may be searched, and look one drama up.
 *
 * Async because the implementation behind it is a query, and an interface that promised synchronous
 * answers would have to change — along with every caller — the day it becomes one.
 */
export interface DramaDirectory {
  /**
   * Every drama a search may return. Publication filtering happens here rather than in the ranking
   * so that "an unreviewed drama is not discoverable" is one rule in one place: `E-13` in
   * `docs/14-test-plan.md` §5.2 makes it an acceptance criterion, and a filter that lived in the
   * route would have to be repeated by the next caller of the same data.
   */
  listSearchable(): Promise<readonly SearchableDrama[]>;
  /**
   * One drama in any publication state, or `undefined` when no such drama exists. Favouriting needs
   * to tell "delisted" from "never existed" — they are a `410` and a `404` — so this deliberately
   * does not apply the visibility filter that `listSearchable` does.
   */
  lookup(dramaId: string): Promise<SearchableDrama | undefined>;
}

/**
 * The seed, as a table of cases rather than a demo.
 *
 * | Record | What it pins |
 * |---|---|
 * | `drm_revenge_0001`, `drm_dynasty_0002` | Two dramas share the tag `revenge`, so a tag hit has to be ordered by something |
 * | `drm_suspense_0004` | Title begins with the query in the "the" case, so tier beats popularity |
 * | `drm_family_0006` | Title contains `the` inside a word (`Mother's`), which is what substring matching means |
 * | `drm_offline_0007` | Delisted, and more played than most of the seed: it must appear in no result |
 * | `drm_draft_0008` | Never published: it must appear in no result, and favouriting it is a `404`, not a `410` |
 */
export const SEED_SEARCHABLE_DRAMAS: readonly SearchableDrama[] = [
  {
    id: 'drm_revenge_0001',
    title: 'Reborn at the Banquet',
    tags: ['revenge', 'wealthy-family'],
    status: 'PUBLISHED',
    stat: { playCount: 1_200_000 },
  },
  {
    id: 'drm_dynasty_0002',
    title: 'Twin Moons Dynasty',
    tags: ['revenge', 'time-travel'],
    status: 'PUBLISHED',
    stat: { playCount: 860_000 },
  },
  {
    id: 'drm_sweet_0003',
    title: 'Sweet Trap',
    tags: ['sweet', 'office'],
    status: 'PUBLISHED',
    stat: { playCount: 410_000 },
  },
  {
    id: 'drm_suspense_0004',
    title: 'The Ninth Tenant',
    tags: ['mystery'],
    status: 'PUBLISHED',
    stat: { playCount: 260_000 },
  },
  {
    id: 'drm_comedy_0005',
    title: 'Boss of Noodles',
    tags: ['comedy', 'food'],
    status: 'PUBLISHED',
    stat: { playCount: 95_000 },
  },
  {
    id: 'drm_family_0006',
    title: "Mother's Debt",
    tags: ['family'],
    status: 'PUBLISHED',
    stat: { playCount: 12_000 },
  },
  {
    id: 'drm_offline_0007',
    title: 'Withdrawn Serial',
    tags: ['mystery'],
    status: 'OFFLINE',
    stat: { playCount: 500_000 },
  },
  {
    id: 'drm_draft_0008',
    title: 'Unannounced',
    tags: [],
    status: 'DRAFT',
    stat: { playCount: 0 },
  },
];

export function toSearchableDrama(drama: DramaRecord): SearchableDrama {
  return {
    id: drama.id,
    title: drama.title,
    tags: drama.tags,
    status: drama.status,
    stat: { playCount: drama.stat.playCount },
  };
}

/**
 * The production directory: the catalogue's own records, filtered the way `listDramas` already
 * filters. Search does not keep a parallel table.
 */
export function createCatalogDramaDirectory(store: CatalogStore): DramaDirectory {
  return {
    async listSearchable() {
      const dramas = await store.listDramas({ sort: 'HOT' });
      return dramas.map(toSearchableDrama);
    },

    async lookup(dramaId: string) {
      const found = await store.getDrama(dramaId);
      return found === undefined ? undefined : toSearchableDrama(found.drama);
    },
  };
}

export function createSeedDramaDirectory(
  seed: readonly SearchableDrama[] = SEED_SEARCHABLE_DRAMAS,
): DramaDirectory {
  const byId = new Map(seed.map((drama) => [drama.id, drama]));
  const searchable = seed.filter((drama) => drama.status === 'PUBLISHED');

  return {
    listSearchable(): Promise<readonly SearchableDrama[]> {
      return Promise.resolve(searchable);
    },

    lookup(dramaId: string): Promise<SearchableDrama | undefined> {
      return Promise.resolve(byId.get(dramaId));
    },
  };
}
