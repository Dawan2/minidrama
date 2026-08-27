-- Favourites. The unique index is (user_id, drama_id), which is the primary key
-- `favorites.ts` already named: one viewer holds one row per drama, so a double-tapped
-- favourite button is not a second row. The insert is `INSERT … ON CONFLICT DO NOTHING`,
-- which keeps the original `created_at_ms` — "following since" is a fact about the
-- viewer's history, and a retry is not a new decision.
--
-- created_at_ms is epoch milliseconds, the same unit the in-memory store records. Postgres
-- will store a timestamptz; sqlite does not have one, and a TEXT ISO string would make the
-- keyset comparison a lexicographic one.
--
-- seq is insertion order for the capacity eviction. node:sqlite rejects an index on `rowid`
-- (`no such column: rowid`). A repeated add must not take a new seq — ON CONFLICT DO NOTHING
-- leaves the row where it is, matching the in-memory Map that does not re-insert.
--
-- 0004 is reserved for the in-flight orders store. 0005 is watch progress. This file is
-- 0006 so the three slots compose.

CREATE TABLE favorite (
  seq INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  drama_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE (user_id, drama_id)
);

-- The list is one viewer, most recently followed first, tiebroken on drama_id so the order
-- is total. In SQL that is this index; the in-memory map scans instead.
CREATE INDEX favorite_user_created ON favorite (user_id, created_at_ms DESC, drama_id DESC);
