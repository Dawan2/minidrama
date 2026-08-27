import {
  DRAMA_CATEGORIES,
  UNLOCK_POLICIES,
  type DramaCategory,
  type UnlockPolicy,
} from '@minidrama/shared';

import type { SqliteDatabase } from '../../db/sqlite.js';
import { isListed, positionEpisodes } from './numbering.js';
import { compareDramas, SEED_CATALOG, type CatalogStore, type SeedCatalog } from './store.js';
import type {
  DramaRecord,
  EpisodeRecord,
  PositionedEpisode,
  PublicationStatus,
  SeasonRecord,
} from './types.js';

/**
 * The durable `CatalogStore`: three SQLite tables behind the same interface as the in-memory
 * scan. The seed is written once, when the `dramas` table is empty, so a process restart keeps
 * whatever is in the file rather than reverting to the fixture. Re-seeding on every boot would
 * make "durable" mean "the same as memory, plus a file we never read".
 *
 * Numbering is still derived (`positionEpisodes`). `getDramas` is one `WHERE id IN (...)`
 * statement, not one statement per id — calling `getDrama` per row would move the client's N+1
 * onto the server, which is not a fix (C3-07 / W8-b).
 *
 * `node:sqlite` is synchronous underneath; the interface stays async so a later Postgres swap
 * does not touch callers.
 */

const PUBLICATION_STATUSES = ['DRAFT', 'PUBLISHED', 'OFFLINE'] as const;

const DRAMA_COLUMNS = `
  id, title, description, cover_url, horizontal_cover_url, category, tags, status,
  total_seasons, total_episodes, free_episodes, is_completed, release_at,
  play_count, favorite_count, score
`;

const SEASON_COLUMNS = `id, drama_id, season_number, title, status`;

const EPISODE_COLUMNS = `
  id, drama_id, season_id, episode_number, title, duration_sec, unlock_policy, price_coins, status
`;

const COUNT_DRAMAS_SQL = `SELECT COUNT(*) AS n FROM dramas`;

const LIST_PUBLISHED_SQL = `
  SELECT ${DRAMA_COLUMNS} FROM dramas WHERE status = 'PUBLISHED'
`;

const GET_DRAMA_SQL = `SELECT ${DRAMA_COLUMNS} FROM dramas WHERE id = ?`;

const SEASONS_FOR_DRAMA_SQL = `
  SELECT ${SEASON_COLUMNS} FROM seasons WHERE drama_id = ? ORDER BY season_number ASC
`;

const EPISODES_FOR_DRAMA_SQL = `SELECT ${EPISODE_COLUMNS} FROM episodes WHERE drama_id = ?`;

const GET_EPISODE_SQL = `SELECT ${EPISODE_COLUMNS} FROM episodes WHERE id = ?`;

const INSERT_DRAMA_SQL = `
  INSERT INTO dramas (
    id, title, description, cover_url, horizontal_cover_url, category, tags, status,
    total_seasons, total_episodes, free_episodes, is_completed, release_at,
    play_count, favorite_count, score
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_SEASON_SQL = `
  INSERT INTO seasons (id, drama_id, season_number, title, status) VALUES (?, ?, ?, ?, ?)
`;

const INSERT_EPISODE_SQL = `
  INSERT INTO episodes (
    id, drama_id, season_id, episode_number, title, duration_sec, unlock_policy, price_coins, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * One SELECT for a page of ids. Exported so a test can assert the placeholder count scales
 * with the page and the statement count does not.
 */
export function dramasByIdsSql(count: number): string {
  if (count < 1) {
    throw new Error('dramasByIdsSql requires at least one id');
  }
  const placeholders = Array.from({ length: count }, () => '?').join(', ');
  return `SELECT ${DRAMA_COLUMNS} FROM dramas WHERE id IN (${placeholders})`;
}

export function createSqliteCatalogStore(
  db: SqliteDatabase,
  seed: SeedCatalog = SEED_CATALOG,
): CatalogStore {
  if (asCount(db.prepare(COUNT_DRAMAS_SQL).get()?.['n']) === 0) {
    writeSeed(db, seed);
  }

  const listPublished = db.prepare(LIST_PUBLISHED_SQL);
  const getDramaStmt = db.prepare(GET_DRAMA_SQL);
  const seasonsForDrama = db.prepare(SEASONS_FOR_DRAMA_SQL);
  const episodesForDrama = db.prepare(EPISODES_FOR_DRAMA_SQL);
  const getEpisodeStmt = db.prepare(GET_EPISODE_SQL);

  const seasonsOf = (dramaId: string): SeasonRecord[] =>
    seasonsForDrama.all(dramaId).flatMap((row) => {
      const season = readSeason(row);
      return season === undefined ? [] : [season];
    });

  const episodesOf = (dramaId: string): EpisodeRecord[] =>
    episodesForDrama.all(dramaId).flatMap((row) => {
      const episode = readEpisode(row);
      return episode === undefined ? [] : [episode];
    });

  const positionedOf = (dramaId: string): readonly PositionedEpisode[] =>
    positionEpisodes(seasonsOf(dramaId), episodesOf(dramaId));

  return {
    async listDramas(query) {
      const matches = listPublished
        .all()
        .flatMap((row) => {
          const drama = readDrama(row);
          return drama === undefined ? [] : [drama];
        })
        .filter((drama) => query.category === undefined || drama.category === query.category)
        .filter((drama) => query.tag === undefined || drama.tags.includes(query.tag))
        .sort((a, b) => compareDramas(query.sort, a, b));

      return matches;
    },

    async getDrama(dramaId) {
      const drama = readDrama(getDramaStmt.get(dramaId));
      if (drama === undefined) return undefined;

      const seasons = seasonsOf(dramaId)
        .filter((season) => season.status !== 'DRAFT')
        .sort((a, b) => a.seasonNumber - b.seasonNumber);

      return { drama, seasons };
    },

    async getDramas(dramaIds) {
      const found = new Map<string, DramaRecord>();
      if (dramaIds.length === 0) return found;

      const unique = [...new Set(dramaIds)];
      const byId = new Map<string, DramaRecord>();
      for (const row of db.prepare(dramasByIdsSql(unique.length)).all(...unique)) {
        const drama = readDrama(row);
        if (drama !== undefined) byId.set(drama.id, drama);
      }

      // Insertion order follows the request, matching the in-memory Map. SQL IN does not.
      for (const id of dramaIds) {
        const drama = byId.get(id);
        if (drama !== undefined && !found.has(id)) found.set(id, drama);
      }
      return found;
    },

    async listEpisodes(dramaId) {
      return positionedOf(dramaId).filter(isListed);
    },

    async getEpisode(episodeId) {
      const episode = readEpisode(getEpisodeStmt.get(episodeId));
      if (episode === undefined || episode.status === 'DRAFT') return undefined;

      const drama = readDrama(getDramaStmt.get(episode.dramaId));
      if (drama === undefined) return undefined;

      const positioned = positionedOf(drama.id).find((entry) => entry.episode.id === episode.id);
      if (positioned === undefined) return undefined;

      return { drama, positioned };
    },
  };
}

function writeSeed(db: SqliteDatabase, seed: SeedCatalog): void {
  const insertDrama = db.prepare(INSERT_DRAMA_SQL);
  const insertSeason = db.prepare(INSERT_SEASON_SQL);
  const insertEpisode = db.prepare(INSERT_EPISODE_SQL);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const drama of seed.dramas) {
      insertDrama.run(
        drama.id,
        drama.title,
        drama.description,
        drama.coverUrl,
        drama.horizontalCoverUrl,
        drama.category,
        JSON.stringify(drama.tags),
        drama.status,
        drama.totalSeasons,
        drama.totalEpisodes,
        drama.freeEpisodes,
        drama.isCompleted ? 1 : 0,
        drama.releaseAt,
        drama.stat.playCount,
        drama.stat.favoriteCount,
        drama.stat.score,
      );
    }
    for (const season of seed.seasons) {
      insertSeason.run(season.id, season.dramaId, season.seasonNumber, season.title, season.status);
    }
    for (const episode of seed.episodes) {
      insertEpisode.run(
        episode.id,
        episode.dramaId,
        episode.seasonId,
        episode.episodeNumber,
        episode.title,
        episode.durationSec,
        episode.unlockPolicy,
        episode.priceCoins,
        episode.status,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function readDrama(row: Record<string, unknown> | undefined): DramaRecord | undefined {
  if (row === undefined) return undefined;

  const id = asString(row['id']);
  const title = asString(row['title']);
  const description = asString(row['description']);
  const coverUrl = asString(row['cover_url']);
  const horizontalCoverUrl = asNullableString(row['horizontal_cover_url']);
  const category = asCategory(row['category']);
  const tags = asTags(row['tags']);
  const status = asPublicationStatus(row['status']);
  const totalSeasons = asNumber(row['total_seasons']);
  const totalEpisodes = asNumber(row['total_episodes']);
  const freeEpisodes = asNumber(row['free_episodes']);
  const isCompleted = asBoolean(row['is_completed']);
  const releaseAt = asString(row['release_at']);
  const playCount = asNumber(row['play_count']);
  const favoriteCount = asNumber(row['favorite_count']);
  const score = asNumber(row['score']);

  if (
    id === undefined ||
    title === undefined ||
    description === undefined ||
    coverUrl === undefined ||
    horizontalCoverUrl === undefined ||
    category === undefined ||
    tags === undefined ||
    status === undefined ||
    totalSeasons === undefined ||
    totalEpisodes === undefined ||
    freeEpisodes === undefined ||
    isCompleted === undefined ||
    releaseAt === undefined ||
    playCount === undefined ||
    favoriteCount === undefined ||
    score === undefined
  ) {
    return undefined;
  }

  return {
    id,
    title,
    description,
    coverUrl,
    horizontalCoverUrl,
    category,
    tags,
    status,
    totalSeasons,
    totalEpisodes,
    freeEpisodes,
    isCompleted,
    releaseAt,
    stat: { playCount, favoriteCount, score },
  };
}

function readSeason(row: Record<string, unknown> | undefined): SeasonRecord | undefined {
  if (row === undefined) return undefined;

  const id = asString(row['id']);
  const dramaId = asString(row['drama_id']);
  const seasonNumber = asNumber(row['season_number']);
  const title = asNullableString(row['title']);
  const status = asPublicationStatus(row['status']);

  if (
    id === undefined ||
    dramaId === undefined ||
    seasonNumber === undefined ||
    title === undefined ||
    status === undefined
  ) {
    return undefined;
  }

  return { id, dramaId, seasonNumber, title, status };
}

function readEpisode(row: Record<string, unknown> | undefined): EpisodeRecord | undefined {
  if (row === undefined) return undefined;

  const id = asString(row['id']);
  const dramaId = asString(row['drama_id']);
  const seasonId = asString(row['season_id']);
  const episodeNumber = asNumber(row['episode_number']);
  const title = asNullableString(row['title']);
  const durationSec = asNumber(row['duration_sec']);
  const unlockPolicy = asUnlockPolicy(row['unlock_policy']);
  const priceCoins = asNullableNumber(row['price_coins']);
  const status = asPublicationStatus(row['status']);

  if (
    id === undefined ||
    dramaId === undefined ||
    seasonId === undefined ||
    episodeNumber === undefined ||
    title === undefined ||
    durationSec === undefined ||
    unlockPolicy === undefined ||
    priceCoins === undefined ||
    status === undefined
  ) {
    return undefined;
  }

  return {
    id,
    dramaId,
    seasonId,
    episodeNumber,
    title,
    durationSec,
    unlockPolicy,
    priceCoins,
    status,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asNumber(value);
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 0n) return false;
  if (value === 1 || value === 1n) return true;
  return undefined;
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

function asTags(value: unknown): readonly string[] | undefined {
  const raw = asString(value);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== 'string')) {
      return undefined;
    }
    return parsed as string[];
  } catch {
    return undefined;
  }
}

function asCategory(value: unknown): DramaCategory | undefined {
  return typeof value === 'string' && (DRAMA_CATEGORIES as readonly string[]).includes(value)
    ? (value as DramaCategory)
    : undefined;
}

function asUnlockPolicy(value: unknown): UnlockPolicy | undefined {
  return typeof value === 'string' && (UNLOCK_POLICIES as readonly string[]).includes(value)
    ? (value as UnlockPolicy)
    : undefined;
}

function asPublicationStatus(value: unknown): PublicationStatus | undefined {
  return typeof value === 'string' && (PUBLICATION_STATUSES as readonly string[]).includes(value)
    ? (value as PublicationStatus)
    : undefined;
}
