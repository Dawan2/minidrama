import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';

import {
  MAX_SEARCH_QUERY_LENGTH,
  SEARCH_LIMIT,
  SEARCH_PATH,
  classifySearchQuery,
  createSearchApi,
  normalizeSearchQuery,
} from './search-api';
import { apiFailure } from './failure';
import type { HttpReader } from './http';

function httpStub(body: unknown): HttpReader {
  return { getJson: () => Promise.resolve(ok(body)) };
}

function results(items: readonly unknown[], overrides: Record<string, unknown> = {}): unknown {
  return { query: 'heiress', items, truncated: false, ...overrides };
}

const HIT = {
  dramaId: 'drm_test_0001',
  title: 'The Heiress Returns',
  tags: ['revenge'],
  matchedOn: 'TITLE',
};

describe('the search endpoint', () => {
  it('publishes the path the server registered', () => {
    expect(SEARCH_PATH).toBe('/v1/search');
  });

  // The contract publishes these, and the server refuses rather than clamping. A client that
  // invented its own would spend a round trip discovering that.
  it('mirrors the bounds the contract publishes', () => {
    expect(MAX_SEARCH_QUERY_LENGTH).toBe(64);
    expect(SEARCH_LIMIT).toEqual({ fallback: 20, max: 50 });
  });
});

describe('deciding whether there is a query at all', () => {
  it('trims and collapses whitespace, as the server does before it matches', () => {
    expect(normalizeSearchQuery('  twin   moons ')).toBe('twin moons');
  });

  it('leaves case and accents alone, because this form is not the one that matches', () => {
    expect(normalizeSearchQuery('Café DYNASTY')).toBe('Café DYNASTY');
  });

  // The whole point of the separation: an empty box has not been searched, and a `200` with no
  // items has. Sending `q=` would earn a 400 and render the first as the third.
  it('reports an empty box as EMPTY rather than as a query', () => {
    expect(classifySearchQuery('')).toEqual({ kind: 'EMPTY' });
    expect(classifySearchQuery('   ')).toEqual({ kind: 'EMPTY' });
    expect(classifySearchQuery('\t\n ')).toEqual({ kind: 'EMPTY' });
  });

  it('reports a real query with its normalised form', () => {
    expect(classifySearchQuery('  twin  moons ')).toEqual({ kind: 'READY', query: 'twin moons' });
  });

  it('accepts a query exactly at the published maximum', () => {
    const query = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH);
    expect(classifySearchQuery(query)).toEqual({ kind: 'READY', query });
  });

  // Length before normalisation, so a megabyte of whitespace is refused rather than trimmed into a
  // valid query — the server checks it in that order for the same reason.
  it('refuses an over-long query before trimming it into a valid one', () => {
    expect(classifySearchQuery('a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1))).toEqual({
      kind: 'TOO_LONG',
    });
    expect(classifySearchQuery(' '.repeat(MAX_SEARCH_QUERY_LENGTH + 1))).toEqual({
      kind: 'TOO_LONG',
    });
  });
});

describe('the search client', () => {
  it('sends the query as q', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(results([]))));
    await createSearchApi({ getJson }).search({ query: 'twin moons' });

    expect(getJson).toHaveBeenCalledWith(SEARCH_PATH, { q: 'twin moons', limit: undefined });
  });

  it('sends a limit when one is asked for', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(results([]))));
    await createSearchApi({ getJson }).search({ query: 'twin', limit: SEARCH_LIMIT.max });

    expect(getJson).toHaveBeenCalledWith(SEARCH_PATH, { q: 'twin', limit: 50 });
  });

  it('passes a transport failure through untouched', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 400, message: 'q is invalid' });
    const api = createSearchApi({ getJson: () => Promise.resolve({ ok: false, error: failure }) });

    expect(await api.search({ query: 'x' })).toEqual({ ok: false, error: failure });
  });

  it('reads a result set in the documented shape', async () => {
    const api = createSearchApi(httpStub(results([HIT], { truncated: true })));
    const result = await api.search({ query: 'heiress' });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toEqual({
      query: 'heiress',
      truncated: true,
      items: [
        {
          dramaId: 'drm_test_0001',
          title: 'The Heiress Returns',
          tags: ['revenge'],
          matchedOn: 'TITLE',
        },
      ],
    });
  });

  // Nothing matched is a normal answer, not an error. The screen has a state for it.
  it('reads an empty result set as a value', async () => {
    const result = await createSearchApi(httpStub(results([]))).search({ query: 'zzz' });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.items : null).toEqual([]);
  });

  /**
   * The contract publishes two tiers and the ranking behind it already distinguishes four (title
   * prefix, title substring, exact tag, partial tag), so a third value reaching a shipped bundle is
   * a question of when. It must not be cast into the union, and it must not take the screen down.
   */
  it('degrades an unrecognised match tier to null instead of rejecting the hit', async () => {
    const api = createSearchApi(httpStub(results([{ ...HIT, matchedOn: 'TAG_EXACT' }])));
    const result = await api.search({ query: 'heiress' });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.items[0]?.matchedOn : 'unreached').toBeNull();
    expect(result.ok ? result.value.items[0]?.dramaId : null).toBe('drm_test_0001');
  });
});

describe('a 200 in the wrong shape', () => {
  it.each([
    ['not an object', 42],
    ['an array', [HIT]],
    ['missing items', { query: 'x', truncated: false }],
    ['items that are not an array', { query: 'x', items: {}, truncated: false }],
    ['no echoed query', { items: [], truncated: false }],
    ['no truncated flag', { query: 'x', items: [] }],
  ])('is a failure rather than a value: %s', async (_label, body) => {
    const result = await createSearchApi(httpStub(body)).search({ query: 'x' });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  // The identifier is the row's destination and the title is the row itself. A hit without either
  // is a link to nowhere, so the response is refused rather than rendered with a hole in it.
  it.each([
    ['no drama id', { title: 'x', tags: [], matchedOn: 'TITLE' }],
    ['an empty drama id', { ...HIT, dramaId: '' }],
    ['no title', { dramaId: 'drm_1', tags: [], matchedOn: 'TITLE' }],
    ['tags that are not strings', { ...HIT, tags: [1, 2] }],
    ['no tags at all', { dramaId: 'drm_1', title: 'x', matchedOn: 'TITLE' }],
  ])('rejects a hit with %s', async (_label, hit) => {
    const result = await createSearchApi(httpStub(results([hit]))).search({ query: 'x' });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  // MALFORMED classifies as retryable, on the reasoning that a truncated body is far likelier in
  // the field than a server that changed its contract.
  it('carries no status, because the response itself was fine', async () => {
    const result = await createSearchApi(httpStub({})).search({ query: 'x' });

    expect(result.ok ? null : result.error.status).toBeNull();
  });
});
