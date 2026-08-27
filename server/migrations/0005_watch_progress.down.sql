-- Reverse of 0005_watch_progress.up.sql. DROP TABLE removes the unique index and the
-- (user_id, updated_at_ms) index with it.

DROP TABLE IF EXISTS watch_progress;
