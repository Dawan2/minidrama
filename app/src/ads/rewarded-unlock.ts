import type { ApiFailure } from '../data/failure';
import type { AdPlacement, UnlockApi } from '../data/unlock-api';
import type { PlatformBridge } from '../platform/types';

/**
 * Watch a rewarded ad and ask the server to grant the episode.
 *
 * The bridge show is not a grant. `isEnded: false` is still posted, so the nonce is consumed
 * and the server can refuse; the client does not skip the POST and pretend the skip is local.
 * `canIUse` false never calls the SDK. An empty `adUnitId` from the session is treated as
 * unavailable rather than passed through — GATE-4 ids are not invented here.
 */

export type RewardedUnlockFailure =
  | 'UNSUPPORTED'
  | 'UNAVAILABLE'
  | 'NOT_COMPLETED'
  | 'QUOTA'
  | 'ALREADY_UNLOCKED'
  | 'REFUSED'
  | 'UNREACHABLE';

export type RewardedUnlockOutcome =
  | { readonly kind: 'UNLOCKED' }
  | { readonly kind: 'FAILED'; readonly reason: RewardedUnlockFailure };

export interface WatchRewardedAdUnlockInput {
  readonly api: UnlockApi;
  readonly bridge: PlatformBridge;
  readonly episodeId: string;
  readonly placement: AdPlacement;
  readonly newIdempotencyKey?: () => string;
}

export async function watchRewardedAdUnlock(
  input: WatchRewardedAdUnlockInput,
): Promise<RewardedUnlockOutcome> {
  if (!input.bridge.canIUse('createRewardedVideoAd')) {
    return { kind: 'FAILED', reason: 'UNSUPPORTED' };
  }

  const session = await input.api.createAdSession({
    episodeId: input.episodeId,
    placement: input.placement,
  });
  if (!session.ok) {
    return { kind: 'FAILED', reason: classifySession(session.error) };
  }
  if (session.value.adUnitId.length === 0) {
    return { kind: 'FAILED', reason: 'UNAVAILABLE' };
  }

  const shown = await input.bridge.showRewardedAd(session.value.adUnitId);
  if (!shown.ok) {
    return {
      kind: 'FAILED',
      reason: shown.error.code === 'BRIDGE_UNSUPPORTED' ? 'UNSUPPORTED' : 'UNAVAILABLE',
    };
  }

  const grant = await input.api.grantAdUnlock({
    episodeId: input.episodeId,
    nonce: session.value.nonce,
    isEnded: shown.value.isEnded,
    idempotencyKey: (input.newIdempotencyKey ?? defaultIdempotencyKey)(),
  });

  if (!grant.ok) {
    return { kind: 'FAILED', reason: classifyGrant(grant.error, shown.value.isEnded) };
  }

  return { kind: 'UNLOCKED' };
}

function classifySession(failure: ApiFailure): RewardedUnlockFailure {
  if (failure.kind === 'HTTP' && failure.code === 'UNLOCK_AD_UNAVAILABLE') return 'UNAVAILABLE';
  if (failure.kind === 'HTTP' && failure.status === 401) return 'UNAVAILABLE';
  if (failure.kind === 'TIMEOUT' || failure.kind === 'OFFLINE') return 'UNREACHABLE';
  return 'REFUSED';
}

function classifyGrant(failure: ApiFailure, isEnded: boolean): RewardedUnlockFailure {
  if (failure.kind === 'HTTP' && failure.code === 'UNLOCK_AD_NOT_COMPLETED') return 'NOT_COMPLETED';
  if (failure.kind === 'HTTP' && failure.code === 'UNLOCK_AD_QUOTA_EXCEEDED') return 'QUOTA';
  if (failure.kind === 'HTTP' && failure.code === 'UNLOCK_ALREADY_UNLOCKED')
    return 'ALREADY_UNLOCKED';
  if (failure.kind === 'TIMEOUT' || failure.kind === 'OFFLINE') return 'UNREACHABLE';
  if (!isEnded) return 'NOT_COMPLETED';
  return 'REFUSED';
}

function defaultIdempotencyKey(): string {
  return `ad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
