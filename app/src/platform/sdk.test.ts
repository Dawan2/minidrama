import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { BridgeError, Result } from '@minidrama/shared';

import { callSdk, resolveSdkNamespace, sdkHas, withTimeout } from './sdk';

describe('resolveSdkNamespace', () => {
  it('returns null outside TikTok', () => {
    expect(resolveSdkNamespace({})).toBeNull();
  });

  it('prefers the bare namespace when it carries getPlayer', () => {
    const bare = { getPlayer: () => undefined };
    expect(resolveSdkNamespace({ TTMinis: bare })).toBe(bare);
  });

  // Open item O-1: the mini-games docs nest the surface under `TTMinis.game`.
  it('falls back to the nested game namespace', () => {
    const nested = { getPlayer: () => undefined };
    expect(resolveSdkNamespace({ TTMinis: { game: nested } })).toBe(nested);
  });

  it('detects method presence', () => {
    expect(sdkHas({ login: () => undefined }, 'login')).toBe(true);
    expect(sdkHas({ login: 'not-a-function' }, 'login')).toBe(false);
    expect(sdkHas(null, 'login')).toBe(false);
  });
});

describe('withTimeout', () => {
  it('passes a settled result through', async () => {
    const result = await withTimeout(Promise.resolve(ok(1)), 'op', 50);
    expect(result).toEqual(ok(1));
  });

  // U-06: the SDK is not documented to guarantee a callback, so a hung call must not hang the UI.
  it('turns a call that never settles into BRIDGE_TIMEOUT', async () => {
    const never = new Promise<Result<number, BridgeError>>(() => {
      /* intentionally never settles */
    });
    const result = await withTimeout(never, 'op', 10);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('BRIDGE_TIMEOUT');
  });

  it('clears its timer once the operation settles', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeout(Promise.resolve(err({ code: 'BRIDGE_UNKNOWN', message: 'x' })), 'op', 50);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe('callSdk', () => {
  it('reports a missing method as unsupported', async () => {
    const result = await callSdk({}, 'login', {}, () => 'never');
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNSUPPORTED');
  });

  it('normalizes the success callback', async () => {
    const namespace = {
      login: (options: Record<string, unknown>) => {
        (options['success'] as (payload: unknown) => void)({ code: 'abc' });
      },
    };
    const result = await callSdk(namespace, 'login', {}, (payload) => payload);
    expect(result.ok && result.value).toEqual({ code: 'abc' });
  });

  it('forwards call options to the SDK method', async () => {
    const spy = vi.fn((options: Record<string, unknown>) => {
      (options['success'] as (payload: unknown) => void)(undefined);
    });
    await callSdk({ pay: spy }, 'pay', { tradeOrderId: 'order-1' }, () => undefined);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ tradeOrderId: 'order-1' });
  });

  // U-05: the failure payload shape is undocumented, so it is carried opaquely and never parsed.
  it('carries an unrecognised failure payload as an opaque cause', async () => {
    const payload = { errCode: -1, weird: true };
    const namespace = {
      login: (options: Record<string, unknown>) => {
        (options['fail'] as (value: unknown) => void)(payload);
      },
    };
    const result = await callSdk(namespace, 'login', {}, () => 'never');
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNKNOWN');
    expect(!result.ok && result.error.cause).toBe(payload);
  });

  it('turns a synchronous throw into a result', async () => {
    const namespace = {
      login: () => {
        throw new Error('sdk exploded');
      },
    };
    const result = await callSdk(namespace, 'login', {}, () => 'never');
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNKNOWN');
  });

  it('turns a malformed success payload into a result', async () => {
    const namespace = {
      login: (options: Record<string, unknown>) => {
        (options['success'] as (payload: unknown) => void)(null);
      },
    };
    const result = await callSdk(namespace, 'login', {}, (payload) => {
      if (payload === null) {
        throw new TypeError('null payload');
      }
      return payload;
    });
    expect(!result.ok && result.error.code).toBe('BRIDGE_UNKNOWN');
  });

  it('ignores a second callback from a double-calling SDK', async () => {
    const namespace = {
      login: (options: Record<string, unknown>) => {
        (options['success'] as (payload: unknown) => void)({ code: 'first' });
        (options['fail'] as (payload: unknown) => void)({ code: 'second' });
      },
    };
    const result = await callSdk(namespace, 'login', {}, (payload) => payload);
    expect(result.ok && result.value).toEqual({ code: 'first' });
  });
});
