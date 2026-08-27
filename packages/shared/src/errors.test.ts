import { describe, expect, it } from 'vitest';

import {
  API_ERROR_CODES,
  BRIDGE_ERROR_CODES,
  bridgeError,
  isApiErrorCode,
  isBridgeErrorCode,
} from './errors.js';

describe('error codes', () => {
  it('keeps API and bridge namespaces disjoint', () => {
    const overlap = API_ERROR_CODES.filter((code) =>
      (BRIDGE_ERROR_CODES as readonly string[]).includes(code),
    );
    expect(overlap).toEqual([]);
  });

  it('declares every code exactly once', () => {
    const all = [...API_ERROR_CODES, ...BRIDGE_ERROR_CODES];
    expect(new Set(all).size).toBe(all.length);
  });

  it('recognises its own codes and rejects foreign ones', () => {
    expect(isApiErrorCode('EPISODE_LOCKED')).toBe(true);
    expect(isApiErrorCode('BRIDGE_TIMEOUT')).toBe(false);
    expect(isBridgeErrorCode('BRIDGE_TIMEOUT')).toBe(true);
    expect(isBridgeErrorCode('EPISODE_LOCKED')).toBe(false);
  });

  it('omits the cause key entirely when no cause is supplied', () => {
    const withoutCause = bridgeError('BRIDGE_TIMEOUT', 'timed out');
    expect('cause' in withoutCause).toBe(false);

    const raw = { errCode: -1 };
    const withCause = bridgeError('BRIDGE_UNKNOWN', 'unknown', raw);
    expect(withCause.cause).toBe(raw);
  });
});
