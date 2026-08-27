import { bridgeError, err, ok } from '@minidrama/shared';

import { CAPABILITY_NAMES } from './types';
import { callSdk, resolveSdkNamespace, sdkHas, withTimeout } from './sdk';
import { installFailClosedVideoReplace } from './video-replace';
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

const UNSUPPORTED = (capability: string): ReturnType<typeof bridgeError> =>
  bridgeError('BRIDGE_UNSUPPORTED', `${capability} is not available on this client`);

/**
 * The real bridge. Every method probes its capability, dispatches through `callSdk`, and is
 * bounded by `withTimeout`. Wave 1 wires the shapes and the failure paths; the payload mapping
 * for each capability is filled in against a device in Wave 2.
 */
export class TikTokBridge implements PlatformBridge {
  readonly kind = 'tiktok' as const;

  #namespace: Record<string, unknown> | null = null;
  #ready = false;
  #capabilities: CapabilityReport | null = null;

  constructor(private readonly clientKey: string) {}

  async init(): BridgeResult<void> {
    this.#namespace = resolveSdkNamespace();
    if (this.#namespace === null) {
      return err(
        bridgeError('BRIDGE_NOT_READY', 'TTMinis is not present — is this running inside TikTok?'),
      );
    }

    const result = await withTimeout(
      callSdk<void>(this.#namespace, 'init', { clientKey: this.clientKey }, () => undefined),
      'init',
    );
    if (result.ok) {
      this.#ready = true;
      this.#capabilities = this.#probeCapabilities();
      // Native `<video>` replacement must be fail-closed before any screen renders. Missing or
      // throwing is not a boot failure: the platform default blocked UI is already fail-closed,
      // and this API is a customisation hook, not a capability the rest of the app depends on.
      installFailClosedVideoReplace(this.#namespace);
    }
    return result;
  }

  isReady(): boolean {
    return this.#ready;
  }

  canIUse(capability: CapabilityName): boolean {
    return this.#capabilities?.[capability] === 'available';
  }

  capabilities(): CapabilityReport {
    return this.#capabilities ?? this.#probeCapabilities();
  }

  async login(): BridgeResult<LoginResult> {
    if (!this.canIUse('login')) {
      return err(UNSUPPORTED('login'));
    }
    return withTimeout(
      callSdk<LoginResult>(this.#namespace, 'login', {}, (payload) => ({
        authCode: readString(payload, 'code'),
      })),
      'login',
    );
  }

  async getPlayerCtor(): BridgeResult<VePlayerConstructor> {
    if (!this.canIUse('getPlayer')) {
      return err(UNSUPPORTED('getPlayer'));
    }
    const getPlayer = this.#namespace?.['getPlayer'];
    if (typeof getPlayer !== 'function') {
      return err(UNSUPPORTED('getPlayer'));
    }
    try {
      const ctor = (getPlayer as () => unknown).call(this.#namespace);
      if (typeof ctor !== 'function') {
        return err(bridgeError('BRIDGE_UNKNOWN', 'getPlayer did not return a constructor', ctor));
      }
      // Documented equivalent: the same method also lives on the constructor `getPlayer()`
      // returns. Re-installing the identical callback is idempotent; a constructor without it
      // reports `absent` and playback continues.
      installFailClosedVideoReplace(ctor);
      return ok(ctor as VePlayerConstructor);
    } catch (cause) {
      return err(bridgeError('BRIDGE_UNKNOWN', 'getPlayer threw', cause));
    }
  }

  async showRewardedAd(adUnitId: string): BridgeResult<RewardedAdResult> {
    if (!this.canIUse('createRewardedVideoAd')) {
      return err(UNSUPPORTED('createRewardedVideoAd'));
    }
    // A rewarded ad instance is single-use. It is created here, per call, and dropped after —
    // reusing one is a documented platform footgun (`docs/design/minis-integration.md` §4.3).
    return withTimeout(
      callSdk<RewardedAdResult>(
        this.#namespace,
        'createRewardedVideoAd',
        { adUnitId },
        (payload) => ({ isEnded: readBoolean(payload, 'isEnded') }),
      ),
      'showRewardedAd',
      60_000,
    );
  }

  async showInterstitialAd(adUnitId: string): BridgeResult<void> {
    if (!this.canIUse('createInterstitialAd')) {
      return err(UNSUPPORTED('createInterstitialAd'));
    }
    return withTimeout(
      callSdk<void>(this.#namespace, 'createInterstitialAd', { adUnitId }, () => undefined),
      'showInterstitialAd',
      60_000,
    );
  }

  async pay(tradeOrderId: string): BridgeResult<void> {
    if (!this.canIUse('pay')) {
      return err(UNSUPPORTED('pay'));
    }
    // Resolving here means the sheet closed. It grants nothing: only the server-side webhook
    // credits a wallet (`docs/architecture/system-overview.md` §7.3).
    return withTimeout(
      callSdk<void>(this.#namespace, 'pay', { tradeOrderId }, () => undefined),
      'pay',
      120_000,
    );
  }

  async createSubscription(tradeOrderId: string): BridgeResult<void> {
    if (!this.canIUse('createSubscription')) {
      return err(UNSUPPORTED('createSubscription'));
    }
    return withTimeout(
      callSdk<void>(this.#namespace, 'createSubscription', { tradeOrderId }, () => undefined),
      'createSubscription',
      120_000,
    );
  }

  async setNavigationBarColor(frontColor: string, backgroundColor: string): BridgeResult<void> {
    if (!this.canIUse('setNavigationBarColor')) {
      return err(UNSUPPORTED('setNavigationBarColor'));
    }
    return withTimeout(
      callSdk<void>(
        this.#namespace,
        'setNavigationBarColor',
        { frontColor, backgroundColor },
        () => undefined,
      ),
      'setNavigationBarColor',
    );
  }

  async getMenuButtonRect(): BridgeResult<MenuButtonRect> {
    if (!this.canIUse('getMenuButtonBoundingClientRect')) {
      return err(UNSUPPORTED('getMenuButtonBoundingClientRect'));
    }
    return withTimeout(
      callSdk<MenuButtonRect>(
        this.#namespace,
        'getMenuButtonBoundingClientRect',
        {},
        (payload) => ({
          top: readNumber(payload, 'top'),
          right: readNumber(payload, 'right'),
          bottom: readNumber(payload, 'bottom'),
          left: readNumber(payload, 'left'),
          width: readNumber(payload, 'width'),
          height: readNumber(payload, 'height'),
        }),
      ),
      'getMenuButtonRect',
    );
  }

  #probeCapabilities(): CapabilityReport {
    const entries = CAPABILITY_NAMES.map((capability) => {
      const supported = this.#canIUseViaSdk(capability) ?? sdkHas(this.#namespace, capability);
      return [capability, supported ? 'available' : 'unavailable-this-client'] as const;
    });
    return Object.fromEntries(entries) as CapabilityReport;
  }

  /** Prefers the platform's own `canIUse`; falls back to a presence check when it is absent. */
  #canIUseViaSdk(capability: CapabilityName): boolean | null {
    const canIUse = this.#namespace?.['canIUse'];
    if (typeof canIUse !== 'function') {
      return null;
    }
    try {
      return Boolean((canIUse as (name: string) => unknown).call(this.#namespace, capability));
    } catch {
      return null;
    }
  }
}

function readRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('expected an object payload');
  }
  return payload as Record<string, unknown>;
}

function readString(payload: unknown, key: string): string {
  const value = readRecord(payload)[key];
  if (typeof value !== 'string') {
    throw new TypeError(`expected a string at "${key}"`);
  }
  return value;
}

function readNumber(payload: unknown, key: string): number {
  const value = readRecord(payload)[key];
  if (typeof value !== 'number') {
    throw new TypeError(`expected a number at "${key}"`);
  }
  return value;
}

function readBoolean(payload: unknown, key: string): boolean {
  const value = readRecord(payload)[key];
  if (typeof value !== 'boolean') {
    throw new TypeError(`expected a boolean at "${key}"`);
  }
  return value;
}
