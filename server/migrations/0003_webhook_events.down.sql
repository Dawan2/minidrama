-- Reverse of 0003_webhook_events.up.sql. DROP TABLE removes the unique index on id with it.

DROP TABLE IF EXISTS webhook_idempotency_keys;
DROP TABLE IF EXISTS webhook_events;
