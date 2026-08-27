import { describe, expect, it } from 'vitest';

import { parseWalletTransactionsQuery, WALLET_TRANSACTIONS_LIMIT } from './query.js';

describe('parseWalletTransactionsQuery', () => {
  it('defaults limit to 20 and leaves type and cursor unset', () => {
    expect(parseWalletTransactionsQuery({})).toEqual({
      ok: true,
      value: { cursor: undefined, limit: 20, type: undefined },
    });
  });

  it('accepts a type the domain names and refuses one it does not', () => {
    expect(parseWalletTransactionsQuery({ type: 'CONSUME' })).toEqual({
      ok: true,
      value: { cursor: undefined, limit: 20, type: 'CONSUME' },
    });
    expect(parseWalletTransactionsQuery({ type: 'SPEND' })).toEqual({
      ok: false,
      error: { field: 'type', reason: 'unknown' },
    });
  });

  it('refuses a repeated parameter rather than guessing which value to keep', () => {
    expect(parseWalletTransactionsQuery({ type: ['RECHARGE', 'CONSUME'] })).toEqual({
      ok: false,
      error: { field: 'type', reason: 'repeated' },
    });
    expect(parseWalletTransactionsQuery({ cursor: ['a', 'b'] })).toEqual({
      ok: false,
      error: { field: 'cursor', reason: 'repeated' },
    });
  });

  it('refuses an empty cursor rather than treating it as the first page', () => {
    expect(parseWalletTransactionsQuery({ cursor: '' })).toEqual({
      ok: false,
      error: { field: 'cursor', reason: 'malformed' },
    });
  });

  it('refuses a limit outside 1..100 rather than clamping it', () => {
    expect(WALLET_TRANSACTIONS_LIMIT).toEqual({ fallback: 20, max: 100 });
    expect(parseWalletTransactionsQuery({ limit: '0' })).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'out_of_range' },
    });
    expect(parseWalletTransactionsQuery({ limit: '101' })).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'out_of_range' },
    });
    expect(parseWalletTransactionsQuery({ limit: '20' })).toEqual({
      ok: true,
      value: { cursor: undefined, limit: 20, type: undefined },
    });
  });
});
