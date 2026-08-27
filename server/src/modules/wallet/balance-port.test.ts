import { describe, expect, it } from 'vitest';

import {
  createUnavailableWalletBalancePort,
  createUnreadableWalletBalancePort,
} from './balance-port.js';

describe('createUnavailableWalletBalancePort', () => {
  it('reports UNAVAILABLE rather than a guessed zero, for any viewer', async () => {
    const port = createUnavailableWalletBalancePort();

    const result = await port.readBalance('user_a');

    expect(result).toEqual({ ok: true, value: { kind: 'UNAVAILABLE' } });
  });
});

describe('createUnreadableWalletBalancePort', () => {
  it('is a fault, not an absence: we could not ask, so we must not quote', async () => {
    const port = createUnreadableWalletBalancePort();

    const result = await port.readBalance('user_a');

    expect(result).toEqual({ ok: false, error: 'BALANCE_UNREADABLE' });
  });
});
