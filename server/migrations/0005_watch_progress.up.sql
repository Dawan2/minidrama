-- Watch progress. The unique index is (user_id, episode_id), which is docs/12-domain-model.md
-- §7.1 expressed as a table: one viewer holds one row per episode, so two devices reporting the
-- same episode converge on one resume position. The merge decision (last-write-wins, backward
-- jitter, sticky completed) lives in mergeReport; save is unconditional, matching the in-memory
-- map. Putting LWW into this upsert would make the sqlite backend disagree with the suite.
--
-- drama_id is omitted: WatchProgressRecord does not carry it, and inventing a column no writer
-- can fill honestly is how a later slot thinks the join is done. GET /v1/progress/dramas/{id}
-- numbers rows through catalog, the same way the in-memory store is read today.
--
-- completed is INTEGER 0/1: SQLite has no boolean, and a TEXT 'true' would make a dump lie.
-- seq is insertion order for the capacity eviction. node:sqlite rejects an index on `rowid`
-- (`no such column: rowid`); a rewrite deletes and re-inserts so the row becomes newest.
--
-- 0004 is reserved for the in-flight orders store. This file is 0005 so the two slots compose.

CREATE TABLE watch_progress (
  seq INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  position_sec INTEGER NOT NULL CHECK (position_sec >= 0),
  duration_sec INTEGER NOT NULL CHECK (duration_sec > 0),
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  client_updated_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE (user_id, episode_id)
);

-- The watch-history list and the per-drama read both filter one viewer, newest accepted report
-- first. In SQL that is this index; the in-memory map scans instead.
CREATE INDEX watch_progress_user_updated ON watch_progress (user_id, updated_at_ms DESC);
