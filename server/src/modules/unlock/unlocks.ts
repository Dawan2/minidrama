import { randomUUID } from 'node:crypto';

import type { UnlockMethod } from '../entitlement/access.js';

/**
 * The unlock record: the durable receipt that a viewer owns an episode.
 *
 * Three records describe one purchase and they are deliberately not the same row. The `UnlockOrder`
 * is an intent, `paidAtMs` on it is a fact about money, and this is the entitlement — the thing
 * `decideEpisodeAccess` reads at step 3 (`modules/entitlement/access.ts`) and the only reason a paid
 * episode ever becomes playable. Collapsing them would make "was charged" and "may watch" the same
 * assertion, and they fail apart: a payment can be verified while the grant is still owed, which is
 * survivable, and the reverse would be content given away.
 *
 * `docs/12-domain-model.md` §6.1 fixes the shape, and two parts of it are load-bearing:
 *
 *   - **`(userId, episodeId)` is unique** — at most one row per viewer per episode. It is what makes
 *     a redelivered callback, a replayed webhook event and a second order for the same episode all
 *     converge on one entitlement instead of accumulating rows that each look like a purchase;
 *   - **`expiresAtMs` is reserved, and a coin unlock does not use it.** Coins bought the episode
 *     permanently (§6.1: Wave 1 has no limited-time unlock), so the field is `null` here. The
 *     decision function treats a past expiry as no entitlement at all, which is why a grant must
 *     never invent one.
 *
 * `costCoins` is the price frozen onto the order, not a number recomputed at grant time: the row has
 * to say what was actually charged. The `WalletTransaction` this would point at through
 * `transactionId` does not exist yet — the platform charged the viewer directly, and the coin ledger
 * is W14 — so the field is absent rather than filled with a plausible id, and `orderId` is the
 * provenance that replaces it until then.
 */

/** `ulk_`, per `docs/12-domain-model.md` §6.1. */
const UNLOCK_ID_PREFIX = 'ulk_';

export interface Unlock {
  readonly id: string;
  readonly userId: string;
  readonly episodeId: string;
  /** Redundant, per §6.1, so "how much of this drama is unlocked" is one query. */
  readonly dramaId: string;
  /**
   * `COIN` from a paid order, `AD` from a redeemed ad session. Operational `GRANT` is still
   * unwritten. The field is the full enum because `decideEpisodeAccess` distinguishes the durable
   * methods from a `VIP` viewing receipt — a distinction that must survive in the row.
   */
  readonly method: UnlockMethod;
  /** What the viewer was actually charged, carried from the order. */
  readonly costCoins: number;
  /**
   * Provenance. A coin unlock names the coin order; an ad unlock names the ad session
   * (`ads_…`). The sqlite column is NOT NULL, so the session id occupies the same field rather
   * than inventing a second coin-order identifier.
   */
  readonly orderId: string;
  readonly grantedAtMs: number;
  /** `null` is permanent, which is what a coin unlock is. */
  readonly expiresAtMs: number | null;
}

export interface NewCoinUnlock {
  readonly id: string;
  readonly userId: string;
  readonly episodeId: string;
  readonly dramaId: string;
  readonly costCoins: number;
  readonly orderId: string;
  readonly grantedAtMs: number;
}

/**
 * A coin unlock is a permanent `COIN` receipt. There is no input for `method` or `expiresAtMs`: a
 * caller that could pass either could write a row that reads as an entitlement to the decision
 * function while being something else entirely. Ad receipts use `createAdUnlock`.
 */
export function createCoinUnlock(input: NewCoinUnlock): Unlock {
  return {
    id: input.id,
    userId: input.userId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    method: 'COIN',
    costCoins: input.costCoins,
    orderId: input.orderId,
    grantedAtMs: input.grantedAtMs,
    expiresAtMs: null,
  };
}

export interface NewAdUnlock {
  readonly id: string;
  readonly userId: string;
  readonly episodeId: string;
  readonly dramaId: string;
  /** The ad session this receipt came from. Written into `orderId`. */
  readonly sessionId: string;
  readonly grantedAtMs: number;
}

/**
 * A permanent `AD` receipt. `costCoins` is 0: the viewer was not charged coins. `expiresAtMs` is
 * null: an ad unlock is not a limited-time window this slot is allowed to invent.
 */
export function createAdUnlock(input: NewAdUnlock): Unlock {
  return {
    id: input.id,
    userId: input.userId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    method: 'AD',
    costCoins: 0,
    orderId: input.sessionId,
    grantedAtMs: input.grantedAtMs,
    expiresAtMs: null,
  };
}

export function newUnlockId(): string {
  return `${UNLOCK_ID_PREFIX}${randomUUID().replaceAll('-', '')}`;
}
