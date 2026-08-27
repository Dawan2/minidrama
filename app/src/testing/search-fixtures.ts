import { ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import type { ApiFailure } from '../data/failure';
import type { SearchApi, SearchHit, SearchRequest, SearchResults } from '../data/search-api';

/**
 * Test doubles for search.
 *
 * **Nothing outside `src/testing/` and the test files may import from here** —
 * `import-hygiene.test.ts` enforces it, because a fixture reachable from a screen is a fixture that
 * ships inside the bundle the platform scans.
 *
 * The stub implements `SearchApi`, which is the seam the screen depends on. Stubbing `fetch`
 * instead would put HTTP status codes in the middle of every state assertion; the transport is
 * tested once, in `http.test.ts`, and the narrowing once, in `search-api.test.ts`.
 */

export function searchHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    dramaId: 'drm_test_0001',
    title: 'The Heiress Returns',
    tags: ['revenge', 'billionaire'],
    matchedOn: 'TITLE',
    ...overrides,
  };
}

export function searchResults(
  items: readonly SearchHit[],
  overrides: Partial<Omit<SearchResults, 'items'>> = {},
): SearchResults {
  return { query: 'heiress', truncated: false, ...overrides, items };
}

export interface StubSearchApiScript {
  readonly search?: (
    request: SearchRequest,
    callIndex: number,
  ) => Result<SearchResults, ApiFailure>;
}

export interface StubSearchApi extends SearchApi {
  readonly searchCalls: readonly SearchRequest[];
}

export function stubSearchApi(script: StubSearchApiScript = {}): StubSearchApi {
  const searchCalls: SearchRequest[] = [];

  return {
    searchCalls,

    search: (request) => {
      const index = searchCalls.length;
      searchCalls.push(request);
      return Promise.resolve(script.search?.(request, index) ?? ok(searchResults([])));
    },
  };
}

/** A `200` whose body is not the documented shape, as the client reports one. */
export function malformedFailure(): ApiFailure {
  return apiFailure({ kind: 'MALFORMED', message: 'the response was not a search result set' });
}
