import type { PlatformBridge } from '../platform/types';

/**
 * D6 interstitial call site. Conservative: never interrupts playback. The caller chooses a
 * natural break (leaving the player). Without a configured unit id the function is a no-op —
 * GATE-4 is unanswered and inventing one is the C4-08 regression.
 *
 * Showing is fire-and-forget. A failure is not a grant (there is nothing to grant) and is not
 * surfaced as a playback error.
 */
export async function offerInterstitialIfConfigured(
  bridge: PlatformBridge,
  unitId: string | null,
): Promise<'shown' | 'skipped'> {
  if (unitId === null || unitId.length === 0) return 'skipped';
  if (!bridge.canIUse('createInterstitialAd')) return 'skipped';
  await bridge.showInterstitialAd(unitId);
  return 'shown';
}
