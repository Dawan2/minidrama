-- Ad unlock sessions and the reward log (C4-08 / T0-3c).
--
-- A session is a one-use nonce: the client mints one, shows a *new* ad instance, then redeems it.
-- Redeeming with isEnded false still consumes the nonce, so a skipped view cannot be flipped into
-- a grant by a second POST. Every attempt is logged, including refusals — the dual-track record
-- docs/11-api-and-bridge.md §4.3 asks for.
--
-- GATE-4 ad-unit ids are not a column. This table is not a catalogue of placements, and inventing
-- a unit id here would be the C4-08 regression.

CREATE TABLE ad_unlock_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  drama_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  redeemed_at_ms INTEGER,
  outcome TEXT,
  unlock_id TEXT,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX ad_unlock_sessions_user ON ad_unlock_sessions (user_id, created_at_ms);

-- completed / granted are 0/1. is_ended_reported is 0/1, or NULL when the client sent no boolean.
  completed INTEGER NOT NULL,
  granted INTEGER NOT NULL,
  refusal TEXT,
  at_ms INTEGER NOT NULL
);

CREATE INDEX ad_reward_log_user_granted ON ad_reward_log (user_id, granted, at_ms);
