-- Reverse of 0006_favorites.up.sql. DROP TABLE removes the unique index and the
-- (user_id, created_at_ms, drama_id) index with it.

DROP TABLE IF EXISTS favorite;
