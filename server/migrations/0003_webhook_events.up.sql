-- Inbound platform webhook events, stored verbatim *before* verification
-- (`docs/design/minis-integration.md` §6.2, step 1).
--
-- raw_payload is a BLOB so bytes that are not valid UTF-8 survive. A TEXT column that decoded
-- and re-encoded would substitute U+FFFD and make a stored event unverifiable — exactly the
-- case worth replaying. The signature covers those bytes.
--
-- idempotency_key on the event is the last key this delivery claimed, including when it lost.
-- The claim itself lives in webhook_idempotency_keys: first INSERT wins, so a redelivery is a
-- duplicate even after this process restarts. Losing claimants still write the key onto their
-- own row; that is why the event column is not unique. Evicting an old event does not forget
-- a claimed key — the in-memory Set kept them too, and a flood must not reopen a paid order.
--
-- seq is insertion order for the capacity eviction. node:sqlite rejects an index on `rowid`
-- (`no such column: rowid`); two deliveries in one millisecond still need a total order.

CREATE TABLE webhook_events (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  raw_payload BLOB NOT NULL,
  headers TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  verified INTEGER NOT NULL,
  processed INTEGER NOT NULL,
  idempotency_key TEXT,
  rejection_reason TEXT
);

CREATE TABLE webhook_idempotency_keys (
  key TEXT PRIMARY KEY
);
