/**
 * Placement ids for rewarded and interstitial ads.
 *
 * GATE-4 is unanswered: there are no Portal unit ids in this repository. An empty string, a
 * missing env var, or whitespace is `null`, and the product caller must not show an ad. Inventing
 * a placeholder id here would be the C4-08 regression.
 */

export function readConfiguredAdUnitId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function configuredRewardedAdUnitId(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): string | null {
  return readConfiguredAdUnitId(env['VITE_REWARDED_AD_UNIT_ID']);
}

export function configuredInterstitialAdUnitId(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): string | null {
  return readConfiguredAdUnitId(env['VITE_INTERSTITIAL_AD_UNIT_ID']);
}

export function rewardedAdsAvailable(canShowRewarded: boolean, unitId: string | null): boolean {
  return canShowRewarded && unitId !== null;
}
