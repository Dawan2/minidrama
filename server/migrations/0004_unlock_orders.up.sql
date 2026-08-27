-- Coin unlock orders: the intent to buy an episode, correlated later by trade_order_id.
-- Three unique indexes, matching the in-memory store and docs/handoff/w2-work-k.md:
--   id, (user_id, idempotency_key), trade_order_id.
-- The last is what makes a payment callback single-valued.
--
-- seq is insertion order for the capacity eviction. node:sqlite rejects an index on `rowid`
-- (`no such column: rowid`); two orders in one millisecond still need a total order.
-- Status only moves through advanceUnlockOrder; the CHECK is a dump-time backstop, not a
-- second transition table.

CREATE TABLE unlock_orders (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  drama_id TEXT NOT NULL,
  price_coins INTEGER NOT NULL,
  trade_order_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FULFILLED')),
  created_at_ms INTEGER NOT NULL,
  paid_at_ms INTEGER,
  fulfilled_at_ms INTEGER,
  unlock_id TEXT,
  UNIQUE (user_id, idempotency_key)
);
