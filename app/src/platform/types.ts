import type { BridgeError, Result } from '@minidrama/shared';

import type { VePlayerConstructor } from '../player/veplayer-types';

/**
 * The capabilities the app probes at boot. Names match the `TTMinis` methods they gate, because
 * `canIUse` takes the method name and a translation table would be one more thing to get wrong.
 *
 * Nothing outside `src/platform/` may call an SDK method without a capability check first: an
 * older TikTok client simply does not have some of these, and calling a missing one is the
 * classic mini-app crash (`docs/architecture/system-overview.md` §3.3).
 */
export const CAPABILITY_NAMES = [
  'login',
  'authorize',
  'getPlayer',
  'createRewardedVideoAd',
  'createInterstitialAd',
  'pay',
  'createSubscription',
  'setNavigationBarColor',
  'getMenuButtonBoundingClientRect',
] as const;

export type CapabilityName = (typeof CAPABILITY_NAMES)[number];

/**
 * Three states, not two. "Missing on this client" and "switched off by remote config" lead to the
 * same UI outcome but completely different operational responses, so they are never merged.
 */
export type CapabilityState = 'available' | 'unavailable-this-client' | 'disabled-by-config';

export type CapabilityReport = Readonly<Record<CapabilityName, CapabilityState>>;

export interface MenuButtonRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface LoginResult {
  /** Short-lived code. Exchanged for an `open_id` server-side; never inspected by the client. */
  readonly authCode: string;
}

export interface RewardedAdResult {
  /** Only `true` may be reported to the server as a completed view. */
  readonly isEnded: boolean;
}

export type BridgeResult<T> = Promise<Result<T, BridgeError>>;

/**
 * The whole platform surface, in one interface, with two implementations.
 *
 * Rules that hold for every method:
 *   - it resolves, it never rejects;
 *   - it never returns a raw SDK payload;
 *   - it checks `canIUse` for its own capability before dispatching.
 */
export interface PlatformBridge {
  readonly kind: 'tiktok' | 'mock';

  init(): BridgeResult<void>;
  isReady(): boolean;
  canIUse(capability: CapabilityName): boolean;
  capabilities(): CapabilityReport;

  login(): BridgeResult<LoginResult>;

  /**
   * Resolves the VePlayer constructor. Deliberately *not* called at boot in a blocking way: a
   * user who never opens the player must not be blocked by a player failure (§3.1).
   */
  getPlayerCtor(): BridgeResult<VePlayerConstructor>;

  showRewardedAd(adUnitId: string): BridgeResult<RewardedAdResult>;
  showInterstitialAd(adUnitId: string): BridgeResult<void>;

  pay(tradeOrderId: string): BridgeResult<void>;
  createSubscription(tradeOrderId: string): BridgeResult<void>;

  setNavigationBarColor(frontColor: string, backgroundColor: string): BridgeResult<void>;
  getMenuButtonRect(): BridgeResult<MenuButtonRect>;
}

/**
 * Every method name on the interface, as data, so the conformance test can iterate them.
 * `satisfies` keeps the list honest in one direction; `BridgeMethodCoverage` below keeps it
 * honest in the other, so adding a method to `PlatformBridge` without listing it here fails
 * `pnpm typecheck` rather than silently skipping the conformance test.
 */
export const BRIDGE_METHOD_NAMES = [
  'init',
  'isReady',
  'canIUse',
  'capabilities',
  'login',
  'getPlayerCtor',
  'showRewardedAd',
  'showInterstitialAd',
  'pay',
  'createSubscription',
  'setNavigationBarColor',
  'getMenuButtonRect',
] as const satisfies readonly Exclude<keyof PlatformBridge, 'kind'>[];

export type BridgeMethodName = (typeof BRIDGE_METHOD_NAMES)[number];

type UnlistedBridgeMethod = Exclude<keyof PlatformBridge, 'kind' | BridgeMethodName>;

export type BridgeMethodCoverage = UnlistedBridgeMethod extends never ? true : never;

export const BRIDGE_METHODS_ARE_FULLY_LISTED: BridgeMethodCoverage = true;
