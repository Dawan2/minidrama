import type { PlatformBridge } from '../platform/types';

/**
 * Interstitial ads: a required capability with no reward.
 *
 * F-4 / AC-MON-10: never on open, never during playback, always with a cooldown. The product
 * call site lives here, not in `platform/`. An absent unit id is a no-op — GATE-4 has not
 * produced one, and inventing a Portal id would cost a review cycle to change (MI-2).
 */

export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;

export interface InterstitialClock {
  now(): number;
}

export interface InterstitialSlotState {
  lastShownAtMs: number | null;
}

export interface MaybeShowInterstitialInput {
  readonly bridge: PlatformBridge;
  /** `null` until GATE-4. Empty string is treated the same as null. */
  readonly adUnitId: string | null;
  readonly state: InterstitialSlotState;
  readonly clock?: InterstitialClock;
  readonly cooldownMs?: number;
}

export type InterstitialOutcome =
  'SHOWN' | 'SKIPPED_NO_ID' | 'SKIPPED_CAPABILITY' | 'SKIPPED_COOLDOWN';

export function createInterstitialSlotState(): InterstitialSlotState {
  return { lastShownAtMs: null };
}

export async function maybeShowInterstitial(
  input: MaybeShowInterstitialInput,
): Promise<InterstitialOutcome> {
  const adUnitId = input.adUnitId;
  if (adUnitId === null || adUnitId.length === 0) {
    return 'SKIPPED_NO_ID';
  }

  if (!input.bridge.canIUse('createInterstitialAd')) {
    return 'SKIPPED_CAPABILITY';
  }

  const now = (input.clock ?? Date).now();
  const cooldown = input.cooldownMs ?? INTERSTITIAL_COOLDOWN_MS;
  if (input.state.lastShownAtMs !== null && now - input.state.lastShownAtMs < cooldown) {
    return 'SKIPPED_COOLDOWN';
  }

  const shown = await input.bridge.showInterstitialAd(adUnitId);
  if (!shown.ok) {
    return 'SKIPPED_CAPABILITY';
  }

  input.state.lastShownAtMs = now;
  return 'SHOWN';
}
