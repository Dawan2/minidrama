-- Unlock receipts. The unique index is (user_id, episode_id), which is docs/12-domain-model.md
-- §6.1 expressed as a table: one viewer holds one row per episode, so a redelivered payment,
-- a replayed webhook event, and a second order for the same episode all converge on one receipt.
--
-- expires_at_ms is reserved and a coin unlock leaves it NULL (permanent). cost_bonus and
-- transaction_id are omitted until the coin ledger exists; inventing either would be a column
-- that no writer can fill honestly.

CREATE TABLE unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  drama_id TEXT NOT NULL,
  method TEXT NOT NULL,
  cost_coins INTEGER NOT NULL,
  order_id TEXT NOT NULL,
  granted_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER,
  UNIQUE (user_id, episode_id)
);

-- drama_id is redundant on purpose (§6.1): "how much of this drama is unlocked" is one query.
CREATE INDEX unlocks_user_drama ON unlocks (user_id, drama_id);
