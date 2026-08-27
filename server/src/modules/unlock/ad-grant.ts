import { createAdUnlock, newUnlockId } from './unlocks.js';
import { newAdRewardLogId } from './ad-reward-log.js';
import { startOfUtcDayMs } from './ad-unlock-policy.js';
import type { AdCompletionVerifier } from './ad-completion.js';
import type { AdRewardLogStore } from './ad-reward-log.js';
import type { AdSessionOutcome } from './ad-sessions.js';
import type { AdUnlockPolicy } from './ad-unlock-policy.js';
import type { AdUnlockSession } from './ad-sessions.js';
import type { AdUnlockSessionStore } from './ad-session-store.js';
import type { EpisodeAccess } from '../entitlement/access.js';
import type { Unlock } from './unlocks.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * Turning a redeemed ad session into an entitlement — or refusing to.
 *
 * The client event is an input to the verifier, not a grant. A POST with `isEnded: true` that the
 * verifier does not complete writes a log row and nothing in `unlocks`. A skipped view consumes
 * the nonce so it cannot be retried as a completion. Quota is counted from *granted* rows only,
 * so a skipped view does not burn the day's cap.
 */

export type AdGrantStatus =
  | 'GRANTED'
  | 'ALREADY_GRANTED'
  | 'NOT_COMPLETED'
  | 'QUOTA_EXCEEDED'
  | 'NOT_FOR_SALE'
  | 'ALREADY_UNLOCKED'
  | 'SESSION_NOT_FOUND'
  | 'INCOMPLETE';

export interface AdGrantQuota {
  readonly usedToday: number;
  readonly dailyLimit: number;
}

export type AdGrant =
  | { readonly status: 'GRANTED'; readonly unlock: Unlock; readonly quota: AdGrantQuota }
  | { readonly status: 'ALREADY_GRANTED'; readonly unlock: Unlock; readonly quota: AdGrantQuota }
  | { readonly status: 'NOT_COMPLETED' }
  | { readonly status: 'QUOTA_EXCEEDED'; readonly quota: AdGrantQuota }
  | { readonly status: 'NOT_FOR_SALE' }
  | { readonly status: 'ALREADY_UNLOCKED' }
  | { readonly status: 'SESSION_NOT_FOUND' }
  | { readonly status: 'INCOMPLETE' };

export interface RedeemAdUnlockInput {
  readonly sessionStore: AdUnlockSessionStore;
  readonly logStore: AdRewardLogStore;
  readonly unlockStore: UnlockStore;
  readonly verifier: AdCompletionVerifier;
  readonly policy: AdUnlockPolicy;
  readonly session: AdUnlockSession;
  readonly access: EpisodeAccess;
  readonly isEnded: unknown;
  readonly atMs: number;
  readonly newUnlockId?: () => string;
  readonly newLogId?: () => string;
}

export async function redeemAdUnlock(input: RedeemAdUnlockInput): Promise<AdGrant> {
  const { session } = input;

  if (session.userId.length === 0) return { status: 'SESSION_NOT_FOUND' };

  if (session.redeemedAtMs !== null) {
    return replay(input, session);
  }

  const verdict = await input.verifier.verify({
    sessionId: session.id,
    userId: session.userId,
    episodeId: session.episodeId,
    isEnded: input.isEnded,
  });

  if (input.access.reason === 'UNLOCKED') {
    return finish(input, {
      outcome: 'ALREADY_UNLOCKED',
      granted: false,
      completed: verdict.completed,
      isEndedReported: verdict.isEndedReported,
      refusal: 'ALREADY_UNLOCKED',
      status: { status: 'ALREADY_UNLOCKED' },
    });
  }

  if (input.access.playable || !input.access.unlockOptions.includes('COINS')) {
    return finish(input, {
      outcome: 'NOT_FOR_SALE',
      granted: false,
      completed: verdict.completed,
      isEndedReported: verdict.isEndedReported,
      refusal: 'NOT_FOR_SALE',
      status: { status: 'NOT_FOR_SALE' },
    });
  }

  if (!verdict.completed) {
    return finish(input, {
      outcome: 'NOT_COMPLETED',
      granted: false,
      completed: false,
      isEndedReported: verdict.isEndedReported,
      refusal: 'NOT_COMPLETED',
      status: { status: 'NOT_COMPLETED' },
    });
  }

  const sinceMs = startOfUtcDayMs(input.atMs);
  const usedToday = await input.logStore.countGrantedSince(session.userId, sinceMs);
  const quota = { usedToday, dailyLimit: input.policy.dailyLimit };

  if (usedToday >= input.policy.dailyLimit) {
    return finish(input, {
      outcome: 'QUOTA_EXCEEDED',
      granted: false,
      completed: true,
      isEndedReported: verdict.isEndedReported,
      refusal: 'QUOTA_EXCEEDED',
      status: { status: 'QUOTA_EXCEEDED', quota: { ...quota } },
    });
  }

  const unlock = createAdUnlock({
    id: (input.newUnlockId ?? newUnlockId)(),
    userId: session.userId,
    episodeId: session.episodeId,
    dramaId: session.dramaId,
    sessionId: session.id,
    grantedAtMs: input.atMs,
  });

  const recorded = await input.unlockStore.record(unlock);
  if (!recorded.ok) {
    return finish(input, {
      outcome: 'INCOMPLETE',
      granted: false,
      completed: true,
      isEndedReported: verdict.isEndedReported,
      refusal: 'INCOMPLETE',
      status: { status: 'INCOMPLETE' },
    });
  }

  const stored = recorded.value.unlock;
  const created = recorded.value.created;
  const grantedQuota = {
    usedToday: usedToday + (created ? 1 : 0),
    dailyLimit: input.policy.dailyLimit,
  };

  return finish(input, {
    outcome: 'GRANTED',
    granted: created,
    completed: true,
    isEndedReported: verdict.isEndedReported,
    refusal: null,
    unlockId: stored.id,
    status: created
      ? { status: 'GRANTED', unlock: stored, quota: grantedQuota }
      : { status: 'ALREADY_GRANTED', unlock: stored, quota: grantedQuota },
  });
}

interface FinishInput {
  readonly outcome: AdSessionOutcome;
  readonly granted: boolean;
  readonly completed: boolean;
  readonly isEndedReported: boolean | null;
  readonly refusal: string | null;
  readonly unlockId?: string;
  readonly status: AdGrant;
}

async function finish(input: RedeemAdUnlockInput, next: FinishInput): Promise<AdGrant> {
  const redeemed = await input.sessionStore.redeem(input.session.id, {
    outcome: next.outcome,
    unlockId: next.unlockId ?? null,
    atMs: input.atMs,
  });

  if (!redeemed.ok && redeemed.error === 'ALREADY_REDEEMED') {
    const latest = await input.sessionStore.get(input.session.id);
    if (latest !== undefined) return replay(input, latest);
    return { status: 'INCOMPLETE' };
  }

  if (!redeemed.ok) {
    return { status: redeemed.error === 'SESSION_NOT_FOUND' ? 'SESSION_NOT_FOUND' : 'INCOMPLETE' };
  }

  const logged = await input.logStore.append({
    id: (input.newLogId ?? newAdRewardLogId)(),
    userId: input.session.userId,
    episodeId: input.session.episodeId,
    sessionId: input.session.id,
    isEndedReported: next.isEndedReported,
    completed: next.completed,
    granted: next.granted,
    refusal: next.refusal,
    atMs: input.atMs,
  });

  if (!logged.ok && next.granted) {
    return { status: 'INCOMPLETE' };
  }

  return next.status;
}

async function replay(input: RedeemAdUnlockInput, session: AdUnlockSession): Promise<AdGrant> {
  if (session.outcome === 'GRANTED' && session.unlockId !== null) {
    const existing = await input.unlockStore.findForEpisode(session.userId, session.episodeId);
    if (existing === undefined) return { status: 'INCOMPLETE' };
    const usedToday = await input.logStore.countGrantedSince(
      session.userId,
      startOfUtcDayMs(input.atMs),
    );
    return {
      status: 'ALREADY_GRANTED',
      unlock: existing,
      quota: { usedToday, dailyLimit: input.policy.dailyLimit },
    };
  }

  if (session.outcome === 'NOT_COMPLETED') return { status: 'NOT_COMPLETED' };
  if (session.outcome === 'QUOTA_EXCEEDED') {
    const usedToday = await input.logStore.countGrantedSince(
      session.userId,
      startOfUtcDayMs(input.atMs),
    );
    return {
      status: 'QUOTA_EXCEEDED',
      quota: { usedToday, dailyLimit: input.policy.dailyLimit },
    };
  }
  if (session.outcome === 'ALREADY_UNLOCKED') return { status: 'ALREADY_UNLOCKED' };
  if (session.outcome === 'NOT_FOR_SALE') return { status: 'NOT_FOR_SALE' };
  return { status: 'INCOMPLETE' };
}
