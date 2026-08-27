import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import type { AdSessionOutcome, AdUnlockSession } from './ad-sessions.js';

export type AdSessionCreateFailure = 'SESSION_NOT_RECORDED' | 'IDEMPOTENCY_CONFLICT';
export type AdSessionRedeemFailure =
  | 'SESSION_NOT_FOUND'
  | 'ALREADY_REDEEMED'
  | 'SESSION_NOT_RECORDED';

export interface AdSessionRedeemInput {
  readonly outcome: AdSessionOutcome;
  readonly unlockId: string | null;
  readonly atMs: number;
}

export interface AdUnlockSessionStore {
  create(session: AdUnlockSession): Promise<Result<AdUnlockSession, AdSessionCreateFailure>>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AdUnlockSession | undefined>;
  get(id: string): Promise<AdUnlockSession | undefined>;
  redeem(
    id: string,
    input: AdSessionRedeemInput,
  ): Promise<Result<AdUnlockSession, AdSessionRedeemFailure>>;
}

export function createInMemoryAdUnlockSessionStore(): AdUnlockSessionStore {
  const byId = new Map<string, AdUnlockSession>();
  const byIdempotency = new Map<string, string>();

  function key(userId: string, idempotencyKey: string): string {
    return `${userId}\u0000${idempotencyKey}`;
  }

  return {
    async create(session) {
      const index = key(session.userId, session.idempotencyKey);
      const existingId = byIdempotency.get(index);
      if (existingId !== undefined) {
        const existing = byId.get(existingId);
        if (existing === undefined) return err('SESSION_NOT_RECORDED');
        if (existing.episodeId !== session.episodeId) return err('IDEMPOTENCY_CONFLICT');
        return ok(existing);
      }

      byId.set(session.id, session);
      byIdempotency.set(index, session.id);
      return ok(session);
    },

    async findByIdempotencyKey(userId, idempotencyKey) {
      const id = byIdempotency.get(key(userId, idempotencyKey));
      return id === undefined ? undefined : byId.get(id);
    },

    async get(id) {
      return byId.get(id);
    },

    async redeem(id, input) {
      const existing = byId.get(id);
      if (existing === undefined) return err('SESSION_NOT_FOUND');
      if (existing.redeemedAtMs !== null) return err('ALREADY_REDEEMED');

      const redeemed: AdUnlockSession = {
        ...existing,
        redeemedAtMs: input.atMs,
        outcome: input.outcome,
        unlockId: input.unlockId,
      };
      byId.set(id, redeemed);
      return ok(redeemed);
    },
  };
}
