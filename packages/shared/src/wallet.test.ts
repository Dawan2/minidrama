import { describe, expect, it } from 'vitest';

import type { WalletView } from './wallet.js';

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
