-- Reverse of 0007_catalog.up.sql. Episodes and seasons go first because they
-- reference dramas; DROP TABLE removes their indexes with them.

DROP TABLE IF EXISTS episodes;
DROP TABLE IF EXISTS seasons;
DROP TABLE IF EXISTS dramas;
