import { describe, expect, it } from 'vitest';

import {
  MAX_DRAMA_ID_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  SEARCH_LIMIT,
  normalizeQueryText,
  parseSearchLimit,
  singleQueryValue,
  validateDramaId,
  validateSearchQuery,
} from './validation.js';

/**
 * The input edge: what a caller may say, and what each refusal is called.
 *
 * Every value tested here arrives from a query string or a path segment, so every one of them is
 * attacker-controlled. The reasons matter as much as the statuses: the route puts them in
 * `details.fields[]`, which is what a client developer reads instead of guessing.
 */

describe('normalizeQueryText', () => {
  it('trims and collapses whitespace without touching case', () => {
    expect(normalizeQueryText('  Twin   Moons  ')).toBe('Twin Moons');
  });

  it.each([
    ['a\tb', 'a b'],
    ['a\nb', 'a b'],
    ['a\u00a0b', 'a b'],
  ])('collapses %j to %j', (input, expected) => {
    expect(normalizeQueryText(input)).toBe(expected);
  });
});

describe('validateSearchQuery', () => {
  it('accepts a normalised query', () => {
    const result = validateSearchQuery('  Sweet   Trap ');

    expect(result).toEqual({ ok: true, value: 'Sweet Trap' });
  });

  // An unsent search is not a search for nothing. Answering "no results" would make an empty box
  // indistinguishable from a query that genuinely matched nothing, which is the one state the
  // empty-result screen exists for.
  it.each([undefined, '', '   ', '\t\n'])('refuses %j as required', (raw) => {
    const result = validateSearchQuery(raw);

    expect(result).toEqual({ ok: false, error: { field: 'q', reason: 'required' } });
  });

  it('accepts a query at the bound and refuses one past it', () => {
    expect(validateSearchQuery('q'.repeat(MAX_SEARCH_QUERY_LENGTH)).ok).toBe(true);

    expect(validateSearchQuery('q'.repeat(MAX_SEARCH_QUERY_LENGTH + 1))).toEqual({
      ok: false,
      error: { field: 'q', reason: 'out_of_range' },
    });
  });

  // Bounded before trimming, so a megabyte of whitespace is refused rather than normalised into a
  // valid query — the work of normalising it is the work being bounded.
  it('bounds the raw query, not the trimmed one', () => {
    const result = validateSearchQuery(` ${' '.repeat(MAX_SEARCH_QUERY_LENGTH)}sweet `);

    expect(result).toEqual({ ok: false, error: { field: 'q', reason: 'out_of_range' } });
  });

  it('refuses a repeated parameter rather than guessing which one was meant', () => {
    const result = validateSearchQuery(['sweet', 'trap']);

    expect(result).toEqual({ ok: false, error: { field: 'q', reason: 'repeated' } });
  });
});

describe('parseSearchLimit', () => {
  it('defaults when absent', () => {
    expect(parseSearchLimit(undefined)).toEqual({ ok: true, value: SEARCH_LIMIT.fallback });
  });

  it('accepts 1 and the published maximum', () => {
    expect(parseSearchLimit('1')).toEqual({ ok: true, value: 1 });
    expect(parseSearchLimit(String(SEARCH_LIMIT.max))).toEqual({
      ok: true,
      value: SEARCH_LIMIT.max,
    });
  });

  // Refused rather than clamped: a client that asks for 500 and silently gets 50 believes it has
  // seen every match, and nothing ever tells it otherwise.
  it.each([['0'], [String(SEARCH_LIMIT.max + 1)]])('refuses %s as out of range', (raw) => {
    expect(parseSearchLimit(raw)).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'out_of_range' },
    });
  });

  it.each([['1.5'], ['-1'], ['ten'], [''], ['1e3'], ['0x10']])(
    'refuses %j as not an integer',
    (raw) => {
      expect(parseSearchLimit(raw)).toEqual({
        ok: false,
        error: { field: 'limit', reason: 'not_an_integer' },
      });
    },
  );

  it('refuses a repeated parameter', () => {
    expect(parseSearchLimit(['1', '2'])).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'repeated' },
    });
  });
});

describe('singleQueryValue', () => {
  it('passes an absent parameter through as undefined', () => {
    expect(singleQueryValue(undefined, 'q')).toEqual({ ok: true, value: undefined });
  });

  it('names the field it was asked about', () => {
    expect(singleQueryValue(['a', 'b'], 'limit')).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'repeated' },
    });
  });
});

describe('validateDramaId', () => {
  it('accepts an identifier at the bound', () => {
    expect(validateDramaId('d'.repeat(MAX_DRAMA_ID_LENGTH)).ok).toBe(true);
  });

  it('refuses one past the bound, below Fastify’s own parameter limit', () => {
    expect(validateDramaId('d'.repeat(MAX_DRAMA_ID_LENGTH + 1))).toEqual({
      ok: false,
      error: { field: 'dramaId', reason: 'out_of_range' },
    });
  });

  it.each([undefined, '', 42, null])('refuses %j as required', (raw) => {
    expect(validateDramaId(raw)).toEqual({
      ok: false,
      error: { field: 'dramaId', reason: 'required' },
    });
  });
});
