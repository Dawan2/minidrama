import { ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import type { Unlock } from './unlocks.js';

/**
 * Where unlock records live.
 *
 * The interface is the `(userId, episodeId)` unique index of `docs/12-domain-model.md` §6.1,
 * expressed as a method: `record` is an insert that reports what it found rather than one that
 * fails on a duplicate, because every caller of it is a *retry path*. TikTok redelivers a payment
 * callback for 72 hours, a stored event can be replayed by hand, and a viewer with two open orders
 * for one episode can pay both. All three must end with one row, and none of them is an error.
 *
 * `record` returns a `Result` even though the in-memory implementation cannot fail, for the same
 * reason the order store's does: the durable table drops in behind it, and the caller is the
 * payment callback, which must not be answered with an exception
 * (`platform-tiktok/paid-trade-orders.ts` — a throw becomes a `500`, the delivery is retried, and
 * the retry is discarded as a duplicate). The SQLite implementation returns `UNLOCK_NOT_RECORDED`
 * when the write cannot be completed.
 *
 * **Nothing evicts.** The order store bounds its map and drops the oldest records, which is
 * survivable there — a forgotten `PENDING` order is a payment to reconcile. Here it would be
 * revoking an episode somebody paid for, silently, under load, so this map only grows. The bound is
 * the process for the in-memory store; the SQLite table is the first durable slice (C3-06) and a
 * row can only be created by a verified payment, so the growth is paid for.
 */

/**
 * The insert did not happen and the caller does not know whether the viewer owns the episode.
 * Reserved for the durable implementation — the in-memory one below never returns it.
 */
export type UnlockRecordFailure = 'UNLOCK_NOT_RECORDED';

export interface UnlockRecordResult {
  /**
   * The stored row. On a duplicate this is the row that was **already there**, not the one that was
   * offered, so a caller writing the order's `unlockId` records the receipt the viewer actually
   * holds rather than an id no table contains.
   */
  readonly unlock: Unlock;
  /** `false` when the viewer already held this episode and nothing was written. */
  readonly created: boolean;
}

export interface UnlockStore {
  record(unlock: Unlock): Promise<Result<UnlockRecordResult, UnlockRecordFailure>>;
  /** The lookup the entitlement decision needs: what this viewer holds for this one episode. */
  findForEpisode(userId: string, episodeId: string): Promise<Unlock | undefined>;
  list(): Promise<readonly Unlock[]>;
}

export function createInMemoryUnlockStore(): UnlockStore {
  /** Keyed by the unique index itself, so the deduplication cannot drift from the schema. */
  const unlocks = new Map<string, Unlock>();

  function key(userId: string, episodeId: string): string {
    return `${userId}\u0000${episodeId}`;
  }

  return {
    async record(unlock) {
      const index = key(unlock.userId, unlock.episodeId);
      const existing = unlocks.get(index);

      if (existing !== undefined) {
        return ok({ unlock: existing, created: false });
      }

      unlocks.set(index, unlock);

      return ok({ unlock, created: true });
    },

    async findForEpisode(userId, episodeId) {
      return unlocks.get(key(userId, episodeId));
    },

    async list() {
      return [...unlocks.values()];
    },
  };
}
