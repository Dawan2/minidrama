import { describe, expect, it } from 'vitest';

import {
  createUnavailableWalletLedgerPort,
  createUnreadableWalletLedgerPort,
} from './ledger-port.js';

const QUERY = { cursor: undefined, limit: 20, type: undefined };

describe('createUnavailableWalletLedgerPort', () => {
  it('reports UNAVAILABLE rather than a guessed empty-because-we-invented-no-spend, for any viewer', async () => {
    const port = createUnavailableWalletLedgerPort();

    const result = await port.listTransactions('user_a', QUERY);

    expect(result).toEqual({ ok: true, value: { kind: 'UNAVAILABLE' } });
  });

  it('does not grow a CONSUME when asked for one', async () => {
    const port = createUnavailableWalletLedgerPort();

    const result = await port.listTransactions('user_a', {
      cursor: undefined,
      limit: 20,
      type: 'CONSUME',
    });

    expect(result).toEqual({ ok: true, value: { kind: 'UNAVAILABLE' } });
  });
});

describe('createUnreadableWalletLedgerPort', () => {
  it('is a fault, not an absence: we could not ask, so we must not quote an empty spend', async () => {
    const port = createUnreadableWalletLedgerPort();

    const result = await port.listTransactions('user_a', QUERY);

    expect(result).toEqual({ ok: false, error: 'LEDGER_UNREADABLE' });
  });
});
