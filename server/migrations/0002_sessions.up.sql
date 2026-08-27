-- Sessions, keyed by a SHA-256 fingerprint of the access token, never by the token itself.
-- A dump of this table must not yield a usable bearer credential (session-store.ts).
--
-- expires_at_ms is the instant the session dies; reading it does not extend it. `id` is
-- insertion order for the ceiling eviction: the oldest live row goes first, after expired
-- rows have been reclaimed. The raw token is not a column.

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX sessions_expires_at ON sessions (expires_at_ms);
