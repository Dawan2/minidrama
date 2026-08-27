-- Catalogue. Three tables behind the existing CatalogStore interface, matching
-- docs/12-domain-model.md §3 as far as DramaRecord / SeasonRecord / EpisodeRecord
-- actually carry. Columns the records do not have — published_at, offline_reason,
-- global_episode_number, a media handle — are omitted: inventing a column no writer
-- can fill honestly is how a later slot thinks the join or GATE-8 is done.
--
-- Numbering stays derived (numbering.ts): an offline season keeps its numbers, a
-- draft is not numbered. Storing global_episode_number here would be a second copy
-- of that rule, and the two would drift.
--
-- tags is JSON text: sqlite has no text[]. is_completed is INTEGER 0/1, not TEXT.
-- price_coins is NULL when the policy does not admit coins, matching the record
-- type rather than the domain model's 0.
--
-- 0006 is reserved for the in-flight favourites store. This file is 0007 so the
-- two slots compose. A gap is fine; the runner sorts by id and applies anything
-- missing.

CREATE TABLE dramas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  horizontal_cover_url TEXT,
  category TEXT NOT NULL CHECK (
    category IN (
      'ROMANCE', 'REVENGE', 'FAMILY', 'SUSPENSE', 'COMEDY', 'FANTASY', 'OTHER'
    )
  ),
  tags TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'OFFLINE')),
  total_seasons INTEGER NOT NULL CHECK (total_seasons >= 0),
  total_episodes INTEGER NOT NULL CHECK (total_episodes >= 0),
  free_episodes INTEGER NOT NULL CHECK (free_episodes >= 0),
  is_completed INTEGER NOT NULL CHECK (is_completed IN (0, 1)),
  release_at TEXT NOT NULL,
  play_count INTEGER NOT NULL CHECK (play_count >= 0),
  favorite_count INTEGER NOT NULL CHECK (favorite_count >= 0),
  score REAL NOT NULL
);

CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  drama_id TEXT NOT NULL REFERENCES dramas (id),
  season_number INTEGER NOT NULL CHECK (season_number >= 1),
  title TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'OFFLINE')),
  UNIQUE (drama_id, season_number)
);

CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  drama_id TEXT NOT NULL REFERENCES dramas (id),
  season_id TEXT NOT NULL REFERENCES seasons (id),
  episode_number INTEGER NOT NULL CHECK (episode_number >= 1),
  title TEXT,
  duration_sec INTEGER NOT NULL CHECK (duration_sec > 0),
  unlock_policy TEXT NOT NULL CHECK (
    unlock_policy IN ('FREE', 'COIN', 'VIP_ONLY', 'COIN_OR_VIP')
  ),
  price_coins INTEGER,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'OFFLINE')),
  UNIQUE (season_id, episode_number),
  CHECK (
    (
      unlock_policy IN ('COIN', 'COIN_OR_VIP')
      AND price_coins IS NOT NULL
      AND price_coins > 0
    )
    OR (
      unlock_policy IN ('FREE', 'VIP_ONLY')
      AND price_coins IS NULL
    )
  )
);

-- listDramas filters published rows; getDramas is WHERE id IN (...).
CREATE INDEX dramas_status ON dramas (status);
CREATE INDEX seasons_drama ON seasons (drama_id, season_number);
CREATE INDEX episodes_drama ON episodes (drama_id);
CREATE INDEX episodes_season ON episodes (season_id, episode_number);
