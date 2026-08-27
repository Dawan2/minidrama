/**
 * How this process learns ad-unit ids and the daily grant cap.
 *
 * GATE-4 is what produces real Portal placement ids. Until then both ids are `null`, and the
 * session endpoint answers `UNLOCK_AD_UNAVAILABLE` rather than minting a nonce for an id that
 * does not exist. A placeholder string in this file would be a product id that costs a review
 * cycle to change (MI-2) and is the C4-08 regression.
 *
 * `dailyLimit` is the number in `docs/design/api-contracts.md` §6.3's example (`5`). It is a
 * risk-control floor from the design contract, not an observed AM quota, and tests that exceed
 * it must turn red.
 */

export const AD_PLACEMENTS = ['AFTER_EPISODE', 'MANUAL_SKIP'] as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export function isAdPlacement(value: unknown): value is AdPlacement {
  return typeof value === 'string' && (AD_PLACEMENTS as readonly string[]).includes(value);
}

export interface AdPlacementConfig {
  /**
   * Rewarded-video placement id, handed to `TTMinis.createRewardedVideoAd`. `null` until GATE-4
   * supplies one. Never a constant in a type, and never copied from `priceCoins`.
   */
  readonly rewardedAdUnitId: string | null;
  /**
   * Interstitial placement id. The client call site reads this the same way: absent means do
   * not show. Not used by the grant endpoint — interstitials do not unlock episodes.
   */
  readonly interstitialAdUnitId: string | null;
  /** Per-user, per-UTC-day cap on `AD` unlock rows. */
  readonly dailyLimit: number;
  /** How long a nonce is valid for one show. */
  readonly sessionTtlMs: number;
}

/** Fail-closed defaults: no Portal ids, design-doc daily cap, ten-minute nonce. */
export const DEFAULT_AD_PLACEMENT: AdPlacementConfig = {
  rewardedAdUnitId: null,
  interstitialAdUnitId: null,
  dailyLimit: 5,
  sessionTtlMs: 10 * 60 * 1000,
};

export function isUsableAdUnitId(value: string | null): value is string {
  return value !== null && value.length > 0;
}
