import { bridgeError, err, ok } from '@minidrama/shared';
import type { BridgeError, Result } from '@minidrama/shared';

import { CAPABILITY_NAMES } from './types';
import { MockVePlayer } from '../player/mock-veplayer';
import type {
  BridgeResult,
  CapabilityName,
  CapabilityReport,
  LoginResult,
  MenuButtonRect,
  PlatformBridge,
  RewardedAdResult,
} from './types';
import type { VePlayerConstructor } from '../player/veplayer-types';

export interface MockBridgeOptions {
  /** Capabilities to report as missing, to exercise the degraded paths without a device. */
  readonly unavailable?: readonly CapabilityName[];
  /** Rewarded ad outcome. `false` models a user who skipped, which must grant nothing. */
  readonly rewardedAdCompletes?: boolean;
}

/**
 * The browser-development, unit-test and E2E implementation.
 *
 * This is not a convenience: without it, every platform-dependent feature is undevelopable and
 * untestable off-device (`docs/architecture/system-overview.md` §1, §11). It is held to the same
 * interface as `TikTokBridge` by the conformance test, so a method added to the real bridge and
 * forgotten here fails the build.
 */
export class MockBridge implements PlatformBridge {
  readonly kind = 'mock' as const;

  #ready = false;
  readonly #unavailable: ReadonlySet<CapabilityName>;
  readonly #rewardedAdCompletes: boolean;

  constructor(options: MockBridgeOptions = {}) {
    this.#unavailable = new Set(options.unavailable ?? []);
    this.#rewardedAdCompletes = options.rewardedAdCompletes ?? true;
  }

  async init(): BridgeResult<void> {
    this.#ready = true;
    return ok(undefined);
  }

  isReady(): boolean {
    return this.#ready;
  }

  canIUse(capability: CapabilityName): boolean {
    return this.#ready && !this.#unavailable.has(capability);
  }

  capabilities(): CapabilityReport {
    const entries = CAPABILITY_NAMES.map(
      (capability) =>
        [capability, this.canIUse(capability) ? 'available' : 'unavailable-this-client'] as const,
    );
    return Object.fromEntries(entries) as CapabilityReport;
  }

  async login(): BridgeResult<LoginResult> {
    return this.#guard('login', () => ok({ authCode: 'mock-auth-code' }));
  }

  async getPlayerCtor(): BridgeResult<VePlayerConstructor> {
    return this.#guard('getPlayer', () => ok(MockVePlayer satisfies VePlayerConstructor));
  }

  async showRewardedAd(_adUnitId: string): BridgeResult<RewardedAdResult> {
    return this.#guard('createRewardedVideoAd', () => ok({ isEnded: this.#rewardedAdCompletes }));
  }

  async showInterstitialAd(_adUnitId: string): BridgeResult<void> {
    return this.#guard('createInterstitialAd', () => ok(undefined));
  }

  async pay(_tradeOrderId: string): BridgeResult<void> {
    return this.#guard('pay', () => ok(undefined));
  }

  async createSubscription(_tradeOrderId: string): BridgeResult<void> {
    return this.#guard('createSubscription', () => ok(undefined));
  }

  async setNavigationBarColor(_frontColor: string, _backgroundColor: string): BridgeResult<void> {
    return this.#guard('setNavigationBarColor', () => ok(undefined));
  }

  async getMenuButtonRect(): BridgeResult<MenuButtonRect> {
    return this.#guard('getMenuButtonBoundingClientRect', () =>
      ok({ top: 8, right: 368, bottom: 40, left: 280, width: 88, height: 32 }),
    );
  }

  #guard<T>(
    capability: CapabilityName,
    produce: () => Result<T, BridgeError>,
  ): Result<T, BridgeError> {
    if (!this.#ready) {
      return err(bridgeError('BRIDGE_NOT_READY', 'init() has not completed'));
    }
    if (!this.canIUse(capability)) {
      return err(
        bridgeError('BRIDGE_UNSUPPORTED', `${capability} is not available on this client`),
      );
    }
    return produce();
  }
}
