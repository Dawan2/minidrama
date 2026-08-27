import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, mapResult, ok, unwrapOr } from './result.js';
import type { Result } from './result.js';

describe('Result', () => {
  it('narrows an ok result to its value', () => {
    const result: Result<number, string> = ok(1);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(1);
    }
  });

  it('narrows an err result to its error', () => {
    const result: Result<number, string> = err('boom');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBe('boom');
    }
  });

  it('maps only the ok branch', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(mapResult(err<string>('boom'), (n: number) => n * 3)).toEqual(err('boom'));
  });

  it('falls back on the err branch', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err('boom') as Result<number, string>, 0)).toBe(0);
  });
});
