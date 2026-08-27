import { bridgeError, err, ok } from '@minidrama/shared';
import type { BridgeErrorCode, Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import { MockBridge } from '../platform/mock-bridge';
import type { ApiFailure } from '../data/failure';
import type {
  AdUnlockGrant,
  AdUnlockSession,
  CoinOrder,
  CreateAdGrantRequest,
  CreateAdSessionRequest,
  CreateCoinOrderRequest,
  UnlockApi,
} from '../data/unlock-api';
import type { MockBridgeOptions } from '../platform/mock-bridge';
import type { PlatformBridge } from '../platform/types';
import type { UnlockPacing } from '../unlock/coin-unlock';

/**
 * Test doubles for the unlock orders and for the payment rail.
 *
 * Test-only, like everything else in this directory — `import-hygiene.test.ts` keeps it out of the
 * bundle.
 *
 * The stub implements `UnlockApi` rather than `fetch` for the same reason the catalogue stub does:
 * the panel's states are a property of the panel, and asserting them through HTTP status codes
 * would test the transport once per state. `unlock-api.test.ts` tests the transport once.
 */

export function coinOrder(overrides: Partial<CoinOrder> = {}): CoinOrder {
  return {
    orderId: 'uord_0000000000000001',
    status: 'PENDING',
    episodeId: 'ep_test_0004',
    priceCoins: 30,
    unlockGranted: false,
    payment: { provider: 'TIKTOK', tradeOrderId: 'trade_0000000000000001' },
    ...overrides,
  };
}

/** A paid order that bought nothing yet: the real end state of a purchase today. */
export function paidCoinOrder(overrides: Partial<CoinOrder> = {}): CoinOrder {
  return coinOrder({ status: 'PAID', ...overrides });
}

/** The only shape that means the episode was actually bought. */
export function grantedCoinOrder(overrides: Partial<CoinOrder> = {}): CoinOrder {
  return coinOrder({ status: 'FULFILLED', unlockGranted: true, ...overrides });
}

export interface StubUnlockApiScript {
  readonly create?: (
    request: CreateCoinOrderRequest,
    callIndex: number,
  ) => Result<CoinOrder, ApiFailure>;
  readonly read?: (orderId: string, callIndex: number) => Result<CoinOrder, ApiFailure>;
  readonly adSession?: (
    request: CreateAdSessionRequest,
    callIndex: number,
  ) => Result<AdUnlockSession, ApiFailure>;
  readonly adGrant?: (
    request: CreateAdGrantRequest,
    callIndex: number,
  ) => Result<AdUnlockGrant, ApiFailure>;
}

export interface StubUnlockApi extends UnlockApi {
  readonly createCalls: readonly CreateCoinOrderRequest[];
  readonly readCalls: readonly string[];
  readonly adSessionCalls: readonly CreateAdSessionRequest[];
  readonly adGrantCalls: readonly CreateAdGrantRequest[];
}

const UNSCRIPTED = apiFailure({
  kind: 'MALFORMED',
  message: 'the stub has no script for this call',
});

export function stubUnlockApi(script: StubUnlockApiScript = {}): StubUnlockApi {
  const createCalls: CreateCoinOrderRequest[] = [];
  const readCalls: string[] = [];
  const adSessionCalls: CreateAdSessionRequest[] = [];
  const adGrantCalls: CreateAdGrantRequest[] = [];

  return {
    createCalls,
    readCalls,
    adSessionCalls,
    adGrantCalls,

    createCoinOrder: (request) => {
      const index = createCalls.length;
      createCalls.push(request);
      return Promise.resolve(script.create?.(request, index) ?? err(UNSCRIPTED));
    },

    fetchCoinOrder: (orderId) => {
      const index = readCalls.length;
      readCalls.push(orderId);
      return Promise.resolve(script.read?.(orderId, index) ?? err(UNSCRIPTED));
    },

    createAdSession: (request) => {
      const index = adSessionCalls.length;
      adSessionCalls.push(request);
      return Promise.resolve(script.adSession?.(request, index) ?? err(UNSCRIPTED));
    },

    grantAdUnlock: (request) => {
      const index = adGrantCalls.length;
      adGrantCalls.push(request);
      return Promise.resolve(script.adGrant?.(request, index) ?? err(UNSCRIPTED));
    },
  };
}

/** `{ kind: 'HTTP', status, code }`, which is what every server refusal looks like to the panel. */
export function unlockFailure(
  status: number,
  code: ApiFailure['code'],
  traceId = 'trace_0001',
): ApiFailure {
  return apiFailure({
    kind: 'HTTP',
    status,
    ...(code === null ? {} : { code }),
    message: `HTTP ${String(status)}`,
    traceId,
  });
}

export interface PayingBridgeOptions {
  /** The bridge error `pay` answers with. Absent means the payment succeeds. */
  readonly payFails?: BridgeErrorCode;
  readonly unavailable?: MockBridgeOptions['unavailable'];
  readonly rewardedAdCompletes?: boolean;
}

export interface PayingBridge extends PlatformBridge {
  readonly payCalls: readonly string[];
}

/**
 * A ready `MockBridge` whose `pay` is observable and scriptable, and which delegates everything
 * else — so a method added to `PlatformBridge` and forgotten here fails the type check rather than
 * silently doing nothing.
 *
 * The trade order ids it was called with are the assertion behind "a VIP episode never opens a coin
 * payment": an empty `payCalls` is the only proof that nothing was put in front of the viewer.
 */
export function payingBridge(options: PayingBridgeOptions = {}): PayingBridge {
  const payCalls: string[] = [];
  const inner = new MockBridge({
    ...(options.unavailable === undefined ? {} : { unavailable: options.unavailable }),
    ...(options.rewardedAdCompletes === undefined
      ? {}
      : { rewardedAdCompletes: options.rewardedAdCompletes }),
  });
  void inner.init();

  return {
    kind: inner.kind,
    payCalls,

    init: () => inner.init(),
    isReady: () => inner.isReady(),
    canIUse: (capability) => inner.canIUse(capability),
    capabilities: () => inner.capabilities(),
    login: () => inner.login(),
    getPlayerCtor: () => inner.getPlayerCtor(),
    showRewardedAd: (adUnitId) => inner.showRewardedAd(adUnitId),
    showInterstitialAd: (adUnitId) => inner.showInterstitialAd(adUnitId),
    createSubscription: (tradeOrderId) => inner.createSubscription(tradeOrderId),
    setNavigationBarColor: (front, back) => inner.setNavigationBarColor(front, back),
    getMenuButtonRect: () => inner.getMenuButtonRect(),

    pay: (tradeOrderId) => {
      payCalls.push(tradeOrderId);
      return Promise.resolve(
        options.payFails === undefined
          ? ok(undefined)
          : err(bridgeError(options.payFails, 'the payment did not complete')),
      );
    },
  };
}

/** No waiting, and as many polls as the caller asked for. */
export function instantPacing(polls = 1): UnlockPacing {
  return {
    pollBackoffMs: Array.from({ length: Math.max(polls - 1, 0) }, () => 0),
    sleep: () => Promise.resolve(),
  };
}
