import { randomUUID } from 'node:crypto';

/**
 * A one-use nonce for one ad showing.
 *
 * The client cannot mint an entitlement by posting `isEnded: true`. It has to hold a session this
 * process issued for this viewer and this episode, show a new ad instance, and redeem the nonce.
 * A skipped view still consumes the nonce so the same showing cannot be retried as a grant.
 */

const SESSION_ID_PREFIX = 'ads_';

export const AD_SESSION_OUTCOMES = [
  'GRANTED',
  'NOT_COMPLETED',
  'QUOTA_EXCEEDED',
  'NOT_FOR_SALE',
  'ALREADY_UNLOCKED',
  'INCOMPLETE',
] as const;

export type AdSessionOutcome = (typeof AD_SESSION_OUTCOMES)[number];

export interface AdUnlockSession {
  readonly id: string;
  readonly userId: string;
  readonly episodeId: string;
  readonly dramaId: string;
  readonly idempotencyKey: string;
  readonly createdAtMs: number;
  readonly redeemedAtMs: number | null;
  readonly outcome: AdSessionOutcome | null;
  readonly unlockId: string | null;
}

export interface NewAdUnlockSession {
  readonly id: string;
  readonly userId: string;
  readonly episodeId: string;
  readonly dramaId: string;
  readonly idempotencyKey: string;
  readonly createdAtMs: number;
}

export function createAdUnlockSession(input: NewAdUnlockSession): AdUnlockSession {
  return {
    id: input.id,
    userId: input.userId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    idempotencyKey: input.idempotencyKey,
    createdAtMs: input.createdAtMs,
    redeemedAtMs: null,
    outcome: null,
    unlockId: null,
  };
}

export function newAdSessionId(): string {
  return `${SESSION_ID_PREFIX}${randomUUID().replaceAll('-', '')}`;
}

export function isAdSessionOutcome(value: unknown): value is AdSessionOutcome {
  return typeof value === 'string' && (AD_SESSION_OUTCOMES as readonly string[]).includes(value);
}
