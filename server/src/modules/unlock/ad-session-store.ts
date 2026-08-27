import { randomUUID } from 'node:crypto';

import type { AdPlacement } from './ad-placement.js';

/**
 * One nonce for one rewarded-ad show.
 *
 * F-4 permits exactly two placements: after an episode finishes (before the next), and a
 * viewer-initiated skip. A nonce that could be issued for "the unlock panel was open" would
 * let the contract express a prohibited offer. The placement is stored on the session, and
 * the grant endpoint never accepts a placement of its own — it trusts the nonce.
 *
 * A nonce is single-use. Reporting `isEnded: false` consumes it so the same token cannot be
 * retried as `true` without watching another ad. Expiry is fail-closed: a restart that drops
 * the in-memory map means every outstanding nonce is gone, and a grant for one is refused.
 */

export const AD_SESSION_ID_PREFIX = 'ads_';

export interface AdSession {
  readonly id: string;
  readonly nonce: string;
  readonly userId: string;
  readonly episodeId: string;
  readonly dramaId: string;
  readonly placement: AdPlacement;
  readonly adUnitId: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly consumed: boolean;
}

export interface IssueAdSessionInput {
  readonly userId: string;
  readonly episodeId: string;
  readonly dramaId: string;
  readonly placement: AdPlacement;
  readonly adUnitId: string;
  readonly atMs: number;
  readonly ttlMs: number;
}

export interface AdGrantReplay {
  readonly episodeId: string;
  readonly body: unknown;
  readonly status: number;
}

export interface AdSessionStore {
  issue(input: IssueAdSessionInput): AdSession;
  findByNonce(nonce: string): AdSession | undefined;
  consume(nonce: string): AdSession | undefined;
  rememberGrant(userId: string, idempotencyKey: string, replay: AdGrantReplay): void;
  findGrant(userId: string, idempotencyKey: string): AdGrantReplay | undefined;
}

export function newAdSessionId(): string {
  return `${AD_SESSION_ID_PREFIX}${randomUUID().replaceAll('-', '')}`;
}

export function createInMemoryAdSessionStore(): AdSessionStore {
  const byNonce = new Map<string, AdSession>();
  const grants = new Map<string, AdGrantReplay>();

  function grantKey(userId: string, idempotencyKey: string): string {
    return `${userId}\u0000${idempotencyKey}`;
  }

  return {
    issue(input) {
      const session: AdSession = {
        id: newAdSessionId(),
        nonce: randomUUID().replaceAll('-', ''),
        userId: input.userId,
        episodeId: input.episodeId,
        dramaId: input.dramaId,
        placement: input.placement,
        adUnitId: input.adUnitId,
        createdAtMs: input.atMs,
        expiresAtMs: input.atMs + input.ttlMs,
        consumed: false,
      };
      byNonce.set(session.nonce, session);
      return session;
    },

    findByNonce(nonce) {
      return byNonce.get(nonce);
    },

    consume(nonce) {
      const existing = byNonce.get(nonce);
      if (existing === undefined || existing.consumed) return existing;
      const consumed: AdSession = { ...existing, consumed: true };
      byNonce.set(nonce, consumed);
      return consumed;
    },

    rememberGrant(userId, idempotencyKey, replay) {
      grants.set(grantKey(userId, idempotencyKey), replay);
    },

    findGrant(userId, idempotencyKey) {
      return grants.get(grantKey(userId, idempotencyKey));
    },
  };
}
