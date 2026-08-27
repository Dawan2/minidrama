import { describe, expect, it } from 'vitest';

import { encodeFavoritesCursor } from './favorites-cursor.js';
import {
  FAVORITES_LIMIT,
  MAX_DRAMA_ID_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  SEARCH_LIMIT,
  normalizeQueryText,
  parseFavoritesCursor,
  parseFavoritesLimit,
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

describe('parseFavoritesLimit', () => {
  it('defaults when absent', () => {
    expect(parseFavoritesLimit(undefined)).toEqual({ ok: true, value: FAVORITES_LIMIT.fallback });
  });

  it('accepts 1 and the published maximum', () => {
    expect(parseFavoritesLimit('1')).toEqual({ ok: true, value: 1 });
    expect(parseFavoritesLimit(String(FAVORITES_LIMIT.max))).toEqual({
      ok: true,
      value: FAVORITES_LIMIT.max,
    });
  });

  // A list is scrolled where a search result is retyped, so this maximum is the one the pagination
  // convention gives every list endpoint rather than search's deliberately smaller one.
  it('allows a larger page than search does', () => {
    expect(FAVORITES_LIMIT.max).toBeGreaterThan(SEARCH_LIMIT.max);
    expect(parseFavoritesLimit(String(SEARCH_LIMIT.max + 1)).ok).toBe(true);
  });

  it.each([['0'], [String(FAVORITES_LIMIT.max + 1)]])('refuses %s as out of range', (raw) => {
    expect(parseFavoritesLimit(raw)).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'out_of_range' },
    });
  });

  it.each([['1.5'], ['-1'], ['ten'], ['']])('refuses %j as not an integer', (raw) => {
    expect(parseFavoritesLimit(raw)).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'not_an_integer' },
    });
  });

  it('refuses a repeated parameter', () => {
    expect(parseFavoritesLimit(['1', '2'])).toEqual({
      ok: false,
      error: { field: 'limit', reason: 'repeated' },
    });
  });
});

describe('parseFavoritesCursor', () => {
  it('reads a cursor this server issued', () => {
    const cursor = { favoritedAtMs: 1_756_296_000_000, dramaId: 'drm_revenge_0001' };

    expect(parseFavoritesCursor(encodeFavoritesCursor(cursor))).toEqual({
      ok: true,
      value: cursor,
    });
  });

  // Absent is the first page. It is not a failure, and it is the common case.
  it('treats an absent cursor as the first page', () => {
    expect(parseFavoritesCursor(undefined)).toEqual({ ok: true, value: undefined });
  });

  // Falling back to the first page is the tempting alternative and it is silently wrong: the client
  // loops over page one and neither side has anything in its logs to say so.
  it.each([[''], ['not a cursor'], ['aaaa'], ['MTIzOmRybV8x==']])(
    'refuses %j as malformed rather than restarting the list',
    (raw) => {
      expect(parseFavoritesCursor(raw)).toEqual({
        ok: false,
        error: { field: 'cursor', reason: 'malformed' },
      });
    },
  );

  // One bound on a drama id, in one place: a cursor naming an identifier longer than this server
  // ever issues did not come from this server, whatever its encoding says.
  it('refuses a cursor naming a drama id past the identifier bound', () => {
    const forged = encodeFavoritesCursor({
      favoritedAtMs: 1_756_296_000_000,
      dramaId: 'd'.repeat(MAX_DRAMA_ID_LENGTH + 1),
    });

    expect(parseFavoritesCursor(forged)).toEqual({
      ok: false,
      error: { field: 'cursor', reason: 'malformed' },
    });
  });

  it('refuses a repeated parameter', () => {
    expect(parseFavoritesCursor(['a', 'b'])).toEqual({
      ok: false,
      error: { field: 'cursor', reason: 'repeated' },
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
