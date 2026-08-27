import { SEED_DRAMAS, SEED_EPISODES, SEED_SEASONS } from './fixtures.js';
import { descendingKey } from '../../core/pagination.js';
import { isListed, positionEpisodes } from './numbering.js';
import type { DramaCategory } from '@minidrama/shared';
import type { DramaRecord, EpisodeRecord, PositionedEpisode, SeasonRecord } from './types.js';

/**
 * Catalogue reads.
 *
 * The interface is async and the implementation is a synchronous in-memory scan. That mismatch is
 * the point: every method here becomes one PostgreSQL query, and an interface that promised
 * synchronous answers would have to change — along with every caller — the day it does. Nothing
 * else about the module boundary is expected to move.
 *
 * The store owns three things the routes must not reimplement: which records are visible, what
 * order a list comes back in, and what each episode's global number is. Ordering in particular is
 * a store concern because the sort key and the pagination cursor have to agree, and they only
 * agree if one component owns both.
 *
 * `DATABASE_URL=sqlite:<path>` puts three SQLite tables behind this same interface (the same
 * file as unlock receipts, sessions, webhook events, coin unlock orders, and watch progress);
 * a postgres URL is refused rather than rewritten to a file. The seed is written once, when
 * the table is empty, so a bounce cannot revert an operator-loaded catalogue to the fixture.
 */

export type DramaSort = 'HOT' | 'NEW';

export interface DramaQuery {
  readonly category?: DramaCategory | undefined;
  readonly tag?: string | undefined;
  readonly sort: DramaSort;
}

export interface DramaWithSeasons {
  readonly drama: DramaRecord;
  /** Non-draft seasons, ascending. Offline seasons are included; their episodes are not listed. */
  readonly seasons: readonly SeasonRecord[];
}

export interface CatalogStore {
  /** Published dramas only, ordered by `query.sort`. */
  listDramas(query: DramaQuery): Promise<readonly DramaRecord[]>;
  /** Any status, including draft and offline — the caller decides what that means. */
  getDrama(dramaId: string): Promise<DramaWithSeasons | undefined>;
  /**
   * Many dramas, **one query**. Missing ids are absent from the map, not a failure.
   *
   * This is the lookup the favourites list uses to project `DramaSummary` onto a page of ids
   * (`docs/plan/cycle-3-backlog.md` C3-07, W8-b). Calling `getDrama` per row would move the
   * client's N+1 onto the server, which is not a fix. In SQL it is `WHERE id = ANY($1)`.
   *
   * Unpublished records are returned, same as `getDrama`: the caller decides whether a delisted
   * favourite renders a summary or the unresolved row. Hiding them here would make "gone" and
   * "never existed" indistinguishable.
   */
  getDramas(dramaIds: readonly string[]): Promise<ReadonlyMap<string, DramaRecord>>;
  /** Listed episodes of a drama, in global episode order. */
  listEpisodes(dramaId: string): Promise<readonly PositionedEpisode[]>;
  /** A single episode with its drama, whatever the publication state of either. */
  getEpisode(
    episodeId: string,
  ): Promise<{ drama: DramaRecord; positioned: PositionedEpisode } | undefined>;
}

export interface SeedCatalog {
  readonly dramas: readonly DramaRecord[];
  readonly seasons: readonly SeasonRecord[];
  readonly episodes: readonly EpisodeRecord[];
}

export const SEED_CATALOG: SeedCatalog = {
  dramas: SEED_DRAMAS,
  seasons: SEED_SEASONS,
  episodes: SEED_EPISODES,
};

/**
 * The ordering, expressed once as a comparable key.
 *
 * The list order and the pagination cursor are derived from this single function on purpose: they
 * are the same fact, and a comparator that disagreed with the cursor key by even a rounding step
 * would drop or repeat items across a page boundary. The trailing id is the tiebreak — two dramas
 * with identical play counts must not swap places between two requests.
 */
export function dramaSortKey(sort: DramaSort, drama: DramaRecord): string {
  const primary =
    sort === 'HOT'
      ? descendingKey(drama.stat.playCount)
      : descendingKey(Math.floor(Date.parse(drama.releaseAt) / 1000));

  return `${primary}|${drama.id}`;
}

export function compareDramas(sort: DramaSort, a: DramaRecord, b: DramaRecord): number {
  const keyA = dramaSortKey(sort, a);
  const keyB = dramaSortKey(sort, b);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

export function createInMemoryCatalogStore(seed: SeedCatalog = SEED_CATALOG): CatalogStore {
  const dramasById = new Map(seed.dramas.map((drama) => [drama.id, drama]));

  const seasonsByDrama = new Map<string, readonly SeasonRecord[]>();
  for (const drama of seed.dramas) {
    seasonsByDrama.set(
      drama.id,
      seed.seasons
        .filter((season) => season.dramaId === drama.id && season.status !== 'DRAFT')
        .sort((a, b) => a.seasonNumber - b.seasonNumber),
    );
  }

  // Numbering is derived once, here, rather than per request: it is a property of the drama, and
  // recomputing it per caller is how two callers end up disagreeing about which episode is which.
  const positionedByDrama = new Map<string, readonly PositionedEpisode[]>();
  for (const drama of seed.dramas) {
    positionedByDrama.set(
      drama.id,
      positionEpisodes(
        seed.seasons.filter((season) => season.dramaId === drama.id),
        seed.episodes.filter((episode) => episode.dramaId === drama.id),
      ),
    );
  }

  const episodeIndex = new Map<string, { drama: DramaRecord; positioned: PositionedEpisode }>();
  for (const [dramaId, positioned] of positionedByDrama) {
    const drama = dramasById.get(dramaId);
    if (drama === undefined) continue;
    for (const entry of positioned) {
      episodeIndex.set(entry.episode.id, { drama, positioned: entry });
    }
  }

  return {
    listDramas(query: DramaQuery): Promise<readonly DramaRecord[]> {
      const matches = seed.dramas
        .filter((drama) => drama.status === 'PUBLISHED')
        .filter((drama) => query.category === undefined || drama.category === query.category)
        .filter((drama) => query.tag === undefined || drama.tags.includes(query.tag))
        .sort((a, b) => compareDramas(query.sort, a, b));

      return Promise.resolve(matches);
    },

    getDrama(dramaId: string): Promise<DramaWithSeasons | undefined> {
      const drama = dramasById.get(dramaId);
      if (drama === undefined) return Promise.resolve(undefined);

      return Promise.resolve({ drama, seasons: seasonsByDrama.get(dramaId) ?? [] });
    },

    getDramas(dramaIds: readonly string[]): Promise<ReadonlyMap<string, DramaRecord>> {
      const found = new Map<string, DramaRecord>();
      for (const id of dramaIds) {
        const drama = dramasById.get(id);
        if (drama !== undefined) found.set(id, drama);
      }
      return Promise.resolve(found);
    },

    listEpisodes(dramaId: string): Promise<readonly PositionedEpisode[]> {
      return Promise.resolve((positionedByDrama.get(dramaId) ?? []).filter(isListed));
    },

    getEpisode(
      episodeId: string,
    ): Promise<{ drama: DramaRecord; positioned: PositionedEpisode } | undefined> {
      return Promise.resolve(episodeIndex.get(episodeId));
    },
  };
}
