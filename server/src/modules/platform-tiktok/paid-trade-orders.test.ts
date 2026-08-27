import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ERROR_OUTCOMES } from './paid-trade-orders.js';
import type { PaidTradeOrderOutcome } from './paid-trade-orders.js';

/**
 * Operator alerting for a verified payment that did not land where it belongs.
 *
 * `ERROR_OUTCOMES` is the whole of what an operator sees: the callback answers `200` either way, so
 * a dropped member becomes an `info` line nobody reads. W12 found that dropping `NOT_FULFILLED`
 * still left every server test green (`docs/handoff/w12-merge-unlock-grant-tail.md` §5.2). This file
 * is the assertion that was missing.
 */

/**
 * Whether a callback outcome pages a human. Exhaustive on `PaidTradeOrderOutcome`, so adding a
 * member to the type fails typecheck here until it is classified — the decision W9's S70 said the
 * named set was there to force, and that a human-only list does not.
 */
function classifyForOperators(outcome: PaidTradeOrderOutcome): 'error' | 'info' {
  switch (outcome) {
    case 'PAYER_MISMATCH':
    case 'ORDER_NOT_PAYABLE':
    case 'NOT_FULFILLED':
    case 'DUPLICATE_PURCHASE':
      return 'error';
    case 'RECORDED':
    case 'ALREADY_RECORDED':
    case 'NO_MATCHING_ORDER':
      return 'info';
  }
}

describe('ERROR_OUTCOMES', () => {
  it('includes the grant-not-fulfilled outcome, so a paid viewer who owns nothing pages an operator', () => {
    const grantNotFulfilled: PaidTradeOrderOutcome = 'NOT_FULFILLED';

    expect(ERROR_OUTCOMES).toContain(grantNotFulfilled);
  });

  it('is exactly the outcomes that mean an authentic payment arrived and the money is in the wrong place', () => {
    expect([...ERROR_OUTCOMES]).toEqual([
      'PAYER_MISMATCH',
      'ORDER_NOT_PAYABLE',
      'NOT_FULFILLED',
      'DUPLICATE_PURCHASE',
    ]);
  });

  it('agrees with the callback vocabulary: every money-in-the-wrong-place outcome pages, and ordinary traffic does not', () => {
    const vocabulary: readonly PaidTradeOrderOutcome[] = [
      'RECORDED',
      'ALREADY_RECORDED',
      'NO_MATCHING_ORDER',
      'PAYER_MISMATCH',
      'ORDER_NOT_PAYABLE',
      'NOT_FULFILLED',
      'DUPLICATE_PURCHASE',
    ];

    for (const outcome of vocabulary) {
      expect(ERROR_OUTCOMES.includes(outcome)).toBe(classifyForOperators(outcome) === 'error');
    }
  });
});

describe('the verified-payment log line', () => {
  it('takes its level from ERROR_OUTCOMES, so dropping a member is what operators stop seeing', () => {
    const source = readFileSync(fileURLToPath(new URL('./routes.ts', import.meta.url)), 'utf8');

    expect(source).toMatch(/ERROR_OUTCOMES\.includes\(outcome\)\s*\?\s*'error'\s*:\s*'info'/);
  });
});
