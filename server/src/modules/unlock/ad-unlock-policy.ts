/**
 * Fraud caps for ad unlocks.
 *
 * `dailyLimit` is the design-doc example from `docs/design/api-contracts.md` §6.3, not a partner
 * observation and not a Beans rate. Q-G-7 is still unknown; this number is an engineering ceiling
 * so an unbounded grant path cannot mint entitlements all day. A later slot may replace it from
 * configuration after an actual product decision.
 */
export const DESIGN_EXAMPLE_AD_DAILY_LIMIT = 5;

export interface AdUnlockPolicy {
  readonly dailyLimit: number;
}

export function defaultAdUnlockPolicy(): AdUnlockPolicy {
  return { dailyLimit: DESIGN_EXAMPLE_AD_DAILY_LIMIT };
}

export function startOfUtcDayMs(atMs: number): number {
  const date = new Date(atMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
