import { ok } from '@minidrama/shared';

import type { KnownWalletBalance, WalletBalance, WalletBalancePort } from './balance-port.js';

/**
 * A port that quotes a figure for some viewers and reports unavailable for everyone else.
 *
 * Tests inject this so the success path — a platform zero, a split balance, a lone total — is
 * asserted against the real route rather than against the mapper alone.
 */
export function createScriptedWalletBalancePort(
  balances: Readonly<Record<string, WalletBalance>>,
): WalletBalancePort {
  return {
    readBalance: async (userId) => ok(balances[userId] ?? { kind: 'UNAVAILABLE' }),
  };
}

export function knownBalance(overrides: Omit<KnownWalletBalance, 'kind'> = {}): KnownWalletBalance {
  return { kind: 'KNOWN', ...overrides };
}
