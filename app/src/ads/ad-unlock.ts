import { newIdempotencyKey } from '../unlock/idempotency';
import type { ApiFailure } from '../data/failure';
import type { PlatformBridge } from '../platform/types';
import type { UnlockApi } from '../data/unlock-api';

/**
 * Watch a rewarded ad, then ask the server whether that showing is a grant.
 *
 * **Nothing here unlocks anything.** `bridge.showRewardedAd` resolving with `isEnded: true` is
 * not access — it is a report the server verifies. The client still POSTs when `isEnded` is
 * false so the reward log records the skip. A locally patched episode would be a client-side
 * entitlement.
 */

export const AD_UNLOCK_STAGES = ['SESSION', 'SHOWING', 'GRANTING'] as const;
export type AdUnlockStage = (typeof AD_UNLOCK_STAGES)[number];

export const AD_UNLOCK_FAILURES = [
  'NOT_COMPLETED',
  'QUOTA_EXCEEDED',
  'SIGN_IN_REQUIRED',
  'NOT_FOR_SALE',
  'UNREACHABLE',
  'REFUSED',
  'NO_UNIT',
  'UNSUPPORTED',
] as const;
export type AdUnlockFailure = (typeof AD_UNLOCK_FAILURES)[number];

export type AdUnlockOutcome =
  | { readonly kind: 'UNLOCKED' }
  | { readonly kind: 'ALREADY_UNLOCKED' }
  | { readonly kind: 'ABANDONED' }
  | { readonly kind: 'FAILED'; readonly reason: AdUnlockFailure };

export interface RunAdUnlockInput {
  readonly api: UnlockApi;
  readonly bridge: PlatformBridge;
  readonly episodeId: string;
  readonly adUnitId: string | null;
  readonly onStage?: (stage: AdUnlockStage) => void;
}

export async function runAdUnlock(input: RunAdUnlockInput): Promise<AdUnlockOutcome> {
  if (input.adUnitId === null || input.adUnitId.length === 0) {
    return { kind: 'FAILED', reason: 'NO_UNIT' };
  }
  if (!input.bridge.canIUse('createRewardedVideoAd')) {
    return { kind: 'FAILED', reason: 'UNSUPPORTED' };
  }

  input.onStage?.('SESSION');
  const session = await input.api.createAdSession({
    episodeId: input.episodeId,
    idempotencyKey: newIdempotencyKey(),
  });
  if (!session.ok) {
    return { kind: 'FAILED', reason: classifyAdFailure(session.error) };
  }

  input.onStage?.('SHOWING');
  const showing = await input.bridge.showRewardedAd(input.adUnitId);
  const isEnded = showing.ok && showing.value.isEnded === true;

  input.onStage?.('GRANTING');
  const granted = await input.api.grantAdUnlock({
    sessionId: session.value.sessionId,
    isEnded,
  });
  if (!granted.ok) {
    if (granted.error.code === 'UNLOCK_ALREADY_UNLOCKED') {
      return { kind: 'ALREADY_UNLOCKED' };
    }
    return { kind: 'FAILED', reason: classifyAdFailure(granted.error) };
  }

  return { kind: 'UNLOCKED' };
}

function classifyAdFailure(failure: ApiFailure): AdUnlockFailure {
  if (failure.code === 'AD_NOT_COMPLETED') return 'NOT_COMPLETED';
  if (failure.code === 'AD_QUOTA_EXCEEDED') return 'QUOTA_EXCEEDED';
  if (failure.code === 'AUTH_REQUIRED') return 'SIGN_IN_REQUIRED';
  if (failure.code === 'UNLOCK_POLICY_NOT_ALLOWED') return 'NOT_FOR_SALE';
  if (failure.kind === 'OFFLINE' || failure.kind === 'TIMEOUT') return 'UNREACHABLE';
  return 'REFUSED';
}
