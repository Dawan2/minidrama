import { describe, expect, it } from 'vitest';

import {
  WALLET_TRANSACTION_TYPES,
  isWalletTransactionType,
  type WalletTransaction,
  type WalletView,
} from './wallet.js';

describe('WalletView', () => {
  it('can be an empty object, which is the unavailable figure rather than zero', () => {
    const view: WalletView = {};
    expect(view.coinBalance).toBeUndefined();
    expect(view.bonusBalance).toBeUndefined();
    expect(view.totalBalance).toBeUndefined();
  });

  it('can quote a platform zero, which is a real empty wallet', () => {
    const view: WalletView = { coinBalance: 0, bonusBalance: 0, totalBalance: 0 };
    expect(view.totalBalance).toBe(0);
  });
});

describe('WalletTransaction', () => {
  it('names the four types the domain model allows and no spend invented on the type', () => {
    expect(WALLET_TRANSACTION_TYPES).toEqual(['RECHARGE', 'CONSUME', 'REWARD', 'REFUND']);
    expect(isWalletTransactionType('CONSUME')).toBe(true);
    expect(isWalletTransactionType('SPEND')).toBe(false);
  });

  it('can omit deltas rather than invent a zero movement', () => {
    const row: WalletTransaction = { id: 'txn_1', type: 'RECHARGE' };
    expect(row.coinDelta).toBeUndefined();
    expect(row.bonusDelta).toBeUndefined();
  });
});
