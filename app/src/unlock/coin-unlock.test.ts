import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { runCoinUnlock } from './coin-unlock';
import {
  coinOrder,
  grantedCoinOrder,
  instantPacing,
  paidCoinOrder,
  payingBridge,
  stubUnlockApi,
  unlockFailure,
} from '../testing/unlock-fixtures';
import type {
  CoinUnlockDeps,
  CoinUnlockOutcome,
  CoinUnlockStage,
  UnlockPacing,
} from './coin-unlock';
import type { PayingBridge, StubUnlockApiScript } from '../testing/unlock-fixtures';

interface Harness {
  readonly run: () => Promise<CoinUnlockOutcome>;
  readonly api: ReturnType<typeof stubUnlockApi>;
  readonly bridge: PayingBridge;
  readonly stages: readonly CoinUnlockStage[];
}

function harness(
  script: StubUnlockApiScript,
  overrides: {
    readonly bridge?: PayingBridge;
    readonly pacing?: UnlockPacing;
    readonly abandoned?: () => boolean;
  } = {},
): Harness {
  const api = stubUnlockApi(script);
  const bridge = overrides.bridge ?? payingBridge();
  const stages: CoinUnlockStage[] = [];

  const deps: CoinUnlockDeps = {
    api,
    bridge,
    episodeId: 'ep_test_0004',
    idempotencyKey: 'unl_abc',
    pacing: overrides.pacing ?? instantPacing(),
    onStage: (stage) => stages.push(stage),
    abandoned: overrides.abandoned ?? (() => false),
  };

  return { run: () => runCoinUnlock(deps), api, bridge, stages };
}

describe('the happy path', () => {
  it('orders, pays against the trade order the server named, then confirms', async () => {
    const { run, api, bridge, stages } = harness({
      create: () => ok(coinOrder({ payment: { provider: 'TIKTOK', tradeOrderId: 'trade_7' } })),
      read: () => ok(grantedCoinOrder()),
    });

    await expect(run()).resolves.toEqual({ kind: 'UNLOCKED' });
    expect(api.createCalls).toEqual([{ episodeId: 'ep_test_0004', idempotencyKey: 'unl_abc' }]);
    expect(bridge.payCalls).toEqual(['trade_7']);
    expect(stages).toEqual(['ORDERING', 'PAYING', 'CONFIRMING']);
  });

  it('short-circuits a replayed attempt the server has already granted', async () => {
    const { run, bridge } = harness({ create: () => ok(grantedCoinOrder()) });

    await expect(run()).resolves.toEqual({ kind: 'UNLOCKED' });
    // No second trip through the payment sheet for something already paid for.
    expect(bridge.payCalls).toEqual([]);
  });
});

/**
 * The whole reason this module is shaped the way it is. Each of these is a shortcut that would
 * hand a paid episode over for free, and each one has to keep failing for the flow to be safe.
 */
describe('nothing is granted on the client', () => {
  it('does not report an unlock just because the order was created', async () => {
    const { run } = harness({
      create: () => ok(coinOrder()),
      read: () => ok(coinOrder()),
    });

    await expect(run()).resolves.not.toMatchObject({ kind: 'UNLOCKED' });
  });

  it('does not report an unlock just because the payment sheet closed', async () => {
    const { run } = harness({
      create: () => ok(coinOrder()),
      read: () => ok(coinOrder({ status: 'PENDING' })),
    });

    const outcome = await run();
    expect(outcome).toEqual({
      kind: 'FAILED',
      reason: 'PAYMENT_NOT_CONFIRMED',
      retry: 'SAME_KEY',
      failure: null,
    });
  });

  /**
   * `PAID` means the viewer was charged. It says nothing about whether the episode is playable, and
   * today it never becomes playable — writing the unlock row is a later slot's work. This is the
   * state a successful purchase actually reaches, and it is neither a success nor a failure.
   */
  it('reports a paid order as charged-and-not-granted, not as unlocked', async () => {
    const { run } = harness({
      create: () => ok(coinOrder({ orderId: 'uord_9' })),
      read: () => ok(paidCoinOrder()),
    });

    await expect(run()).resolves.toEqual({ kind: 'AWAITING_UNLOCK', orderId: 'uord_9' });
  });

  // A `FULFILLED` order with no grant is a server-side bookkeeping failure, and the one field that
  // means the episode was bought said it was not. It must not read as an entitlement either.
  it('does not report an unlock for a fulfilled order that granted nothing', async () => {
    const { run } = harness({
      create: () => ok(coinOrder({ orderId: 'uord_9' })),
      read: () => ok(coinOrder({ status: 'FULFILLED', unlockGranted: false })),
    });

    await expect(run()).resolves.toEqual({ kind: 'AWAITING_UNLOCK', orderId: 'uord_9' });
  });

  it('reports an unlock only when the server says unlockGranted', async () => {
    const granting = await harness({
      create: () => ok(coinOrder()),
      read: () => ok(coinOrder({ status: 'PAID', unlockGranted: true })),
    }).run();

    expect(granting).toEqual({ kind: 'UNLOCKED' });
  });
});

describe('a refusal to open the order', () => {
  async function refusedWith(status: number, code: Parameters<typeof unlockFailure>[1]) {
    const { run, bridge } = harness({ create: () => err(unlockFailure(status, code)) });
    const outcome = await run();
    return { outcome, payCalls: bridge.payCalls };
  }

  /** `docs/02-screen-inventory.md` PNL-02: already unlocked is a success, not an error. */
  it('treats an already-unlocked episode as a success', async () => {
    const { outcome } = await refusedWith(409, 'UNLOCK_ALREADY_UNLOCKED');
    expect(outcome).toEqual({ kind: 'ALREADY_UNLOCKED' });
  });

  it('separates a policy refusal from a transport failure', async () => {
    const { outcome } = await refusedWith(422, 'UNLOCK_POLICY_NOT_ALLOWED');
    expect(outcome).toMatchObject({ kind: 'FAILED', reason: 'NOT_FOR_SALE', retry: 'NONE' });
  });

  it('reports a missing account as its own thing', async () => {
    const { outcome } = await refusedWith(401, 'AUTH_REQUIRED');
    expect(outcome).toMatchObject({ reason: 'SIGN_IN_REQUIRED', retry: 'NONE' });
  });

  it('reports a withdrawn episode as gone rather than as a payment problem', async () => {
    expect((await refusedWith(410, 'CONTENT_OFFLINE')).outcome).toMatchObject({
      reason: 'EPISODE_GONE',
    });
    expect((await refusedWith(404, 'CONTENT_NOT_FOUND')).outcome).toMatchObject({
      reason: 'EPISODE_GONE',
    });
  });

  it('offers a same-key retry when the payment rail is merely down', async () => {
    const { outcome } = await refusedWith(503, 'PAYMENT_CHANNEL_UNAVAILABLE');
    expect(outcome).toMatchObject({ reason: 'PAYMENT_UNAVAILABLE', retry: 'SAME_KEY' });
  });

  // The one case where reusing the key cannot work, because the key is what was refused.
  it('asks for a fresh key when the idempotency key was refused', async () => {
    const { outcome } = await refusedWith(409, 'COMMON_IDEMPOTENCY_CONFLICT');
    expect(outcome).toMatchObject({ reason: 'ORDER_CONFLICT', retry: 'FRESH_KEY' });
  });

  it('falls back to the transport classification for a code it does not know', async () => {
    const { outcome } = await refusedWith(503, 'COMMON_SERVICE_UNAVAILABLE');
    expect(outcome).toMatchObject({ reason: 'UNREACHABLE', retry: 'SAME_KEY' });

    const rejected = await refusedWith(400, 'COMMON_VALIDATION_FAILED');
    expect(rejected.outcome).toMatchObject({ reason: 'REFUSED', retry: 'NONE' });
  });

  it('carries the trace id so a viewer report maps to a server trace', async () => {
    const { outcome } = await refusedWith(422, 'UNLOCK_POLICY_NOT_ALLOWED');
    expect(outcome.kind === 'FAILED' && outcome.failure?.traceId).toBe('trace_0001');
  });

  /**
   * A refused sale must not put a payment in front of the viewer. An outcome assertion alone would
   * not catch a flow that paid first and refused afterwards, so the bridge is the witness.
   */
  it('opens no payment for any refusal', async () => {
    for (const [status, code] of [
      [409, 'UNLOCK_ALREADY_UNLOCKED'],
      [422, 'UNLOCK_POLICY_NOT_ALLOWED'],
      [401, 'AUTH_REQUIRED'],
      [410, 'CONTENT_OFFLINE'],
      [503, 'PAYMENT_CHANNEL_UNAVAILABLE'],
    ] as const) {
      const { payCalls } = await refusedWith(status, code);
      expect(payCalls, code).toEqual([]);
    }
  });
});

describe('what the payment sheet said', () => {
  it('stops on a cancelled payment without polling for a charge that never happened', async () => {
    const { run, api } = harness(
      { create: () => ok(coinOrder()) },
      { bridge: payingBridge({ payFails: 'BRIDGE_USER_CANCELLED' }) },
    );

    await expect(run()).resolves.toEqual({ kind: 'CANCELLED' });
    expect(api.readCalls).toEqual([]);
  });

  /**
   * The SDK is not the authority on whether money moved — the verified callback is. An adapter that
   * reports `BRIDGE_UNKNOWN` for a payment that actually succeeded would otherwise leave a charged
   * viewer looking at "payment failed".
   */
  it('confirms a failed payment against the server before believing it', async () => {
    const { run, api } = harness(
      { create: () => ok(coinOrder({ orderId: 'uord_9' })), read: () => ok(paidCoinOrder()) },
      { bridge: payingBridge({ payFails: 'BRIDGE_UNKNOWN' }) },
    );

    await expect(run()).resolves.toEqual({ kind: 'AWAITING_UNLOCK', orderId: 'uord_9' });
    expect(api.readCalls).toEqual(['uord_9']);
  });

  it('does not spend the whole poll budget on a payment the platform refused', async () => {
    const { run, api } = harness(
      { create: () => ok(coinOrder()), read: () => ok(coinOrder()) },
      { bridge: payingBridge({ payFails: 'BRIDGE_UNKNOWN' }), pacing: instantPacing(6) },
    );

    await expect(run()).resolves.toMatchObject({ reason: 'PAYMENT_FAILED', retry: 'SAME_KEY' });
    expect(api.readCalls).toHaveLength(1);
  });

  it('separates a rail that is absent from a payment that was refused', async () => {
    const { run } = harness(
      { create: () => ok(coinOrder()), read: () => ok(coinOrder()) },
      { bridge: payingBridge({ payFails: 'BRIDGE_UNSUPPORTED' }) },
    );

    await expect(run()).resolves.toMatchObject({ reason: 'PAYMENT_UNAVAILABLE' });
  });
});

describe('waiting for a callback we do not control', () => {
  it('polls immediately, before any delay, because the webhook may already have arrived', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
    const { run, api } = harness(
      { create: () => ok(coinOrder()), read: () => ok(grantedCoinOrder()) },
      { pacing: { pollBackoffMs: [1_000, 2_000], sleep } },
    );

    await expect(run()).resolves.toEqual({ kind: 'UNLOCKED' });
    expect(api.readCalls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('backs off between polls and stops at the budget', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
    const { run, api } = harness(
      { create: () => ok(coinOrder()), read: () => ok(coinOrder()) },
      { pacing: { pollBackoffMs: [1_000, 2_000, 4_000], sleep } },
    );

    await run();
    expect(api.readCalls).toHaveLength(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000, 4_000]);
  });

  it('stops as soon as the grant appears', async () => {
    const { run, api } = harness(
      {
        create: () => ok(coinOrder()),
        read: (_orderId, index) => ok(index < 2 ? paidCoinOrder() : grantedCoinOrder()),
      },
      { pacing: instantPacing(6) },
    );

    await expect(run()).resolves.toEqual({ kind: 'UNLOCKED' });
    expect(api.readCalls).toHaveLength(3);
  });

  /**
   * One unanswered read says nothing about a payment that is still in flight. Giving up on the
   * first timeout would report a failure to a viewer whose money is on its way.
   */
  it('keeps polling through a transient read failure', async () => {
    const { run, api } = harness(
      {
        create: () => ok(coinOrder()),
        read: (_orderId, index) =>
          index === 0 ? err(unlockFailure(503, 'COMMON_SERVICE_UNAVAILABLE')) : ok(paidCoinOrder()),
      },
      { pacing: instantPacing(3) },
    );

    await expect(run()).resolves.toMatchObject({ kind: 'AWAITING_UNLOCK' });
    expect(api.readCalls.length).toBeGreaterThan(1);
  });

  /**
   * A vanished order is not a transient answer, and a retry would mint a second payable order for
   * an episode the viewer may already have paid for. So it dead-ends deliberately.
   */
  it('dead-ends on an order that is gone, and offers no retry', async () => {
    const { run, api } = harness(
      {
        create: () => ok(coinOrder()),
        read: () => err(unlockFailure(404, 'PAYMENT_ORDER_NOT_FOUND')),
      },
      { pacing: instantPacing(6) },
    );

    await expect(run()).resolves.toMatchObject({ reason: 'ORDER_LOST', retry: 'NONE' });
    expect(api.readCalls).toHaveLength(1);
  });
});

describe('a panel that closed mid-purchase', () => {
  it('stops before paying', async () => {
    const { run, bridge } = harness({ create: () => ok(coinOrder()) }, { abandoned: () => true });

    await expect(run()).resolves.toEqual({ kind: 'ABANDONED' });
    expect(bridge.payCalls).toEqual([]);
  });

  it('stops the poll loop rather than holding timers for the rest of the budget', async () => {
    let paid = false;
    const { run, api } = harness(
      { create: () => ok(coinOrder()), read: () => ok(coinOrder()) },
      {
        bridge: {
          ...payingBridge(),
          pay: (tradeOrderId: string) => {
            paid = true;
            return payingBridge().pay(tradeOrderId);
          },
        } as PayingBridge,
        pacing: instantPacing(6),
        abandoned: () => paid,
      },
    );

    await expect(run()).resolves.toEqual({ kind: 'ABANDONED' });
    expect(api.readCalls).toEqual([]);
  });
});
