import { err, ok } from '@minidrama/shared';
import type { DramaSearchMatch, Result } from '@minidrama/shared';

import { apiFailure } from './failure';
import type { ApiFailure } from './failure';
import type { HttpClient } from './http';

/**
 * The search read surface, as the client sees it.
 *
 * One endpoint, anonymous — browsing has to work before login, and the Minis client's silent login
 * can fail before the viewer has typed anything (`contracts/openapi.yaml`, `searchDramas`). It is a
 * separate seam from `CatalogApi` because it is a separate module on the server: search answers
 * "which drama did the viewer mean", the catalogue answers "what is in this drama", and folding
 * them into one interface would make every screen test that needs one supply the other.
 *
 * There is no cursor. Relevance order is not a keyset, so a "next page" of a ranking needs a
 * snapshot of that ranking to mean anything; the response says `truncated` instead and the client's
 * move is to narrow the query. That is why this uses `useResource` and not `usePagedResource`.
 */

export const SEARCH_PATH = '/v1/search';

/**
 * The bounds the contract publishes, mirrored here so the input can refuse a query the server would
 * refuse anyway.
 *
 * Mirroring a server rule on the client is normally how two systems start disagreeing, and the one
 * place it is safe is the input edge: these are `minLength` / `maxLength` / `minimum` / `maximum` in
 * the OpenAPI document, they exist to be enforced by a form, and enforcing them costs a round trip
 * that can only end in `400 COMMON_VALIDATION_FAILED`. Nothing about *what matches* is decided here.
 */
export const MAX_SEARCH_QUERY_LENGTH = 64;

/** The server refuses an out-of-range limit rather than clamping it, so the client never sends one. */
export const SEARCH_LIMIT = { fallback: 20, max: 50 } as const;

/**
 * Trim, and collapse runs of whitespace, exactly as the server does before it matches.
 *
 * Case and accents are deliberately untouched: the aggressive folding matching uses is the server's
 * and is never shown to anyone. This form only decides whether there is a query at all, and it is
 * not what gets rendered — the response echoes its own normalised copy and the surface renders that.
 */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ');
}

/**
 * What the client is willing to do with what is in the search box.
 *
 * `EMPTY` is the state this whole module exists to keep separate from a search that matched
 * nothing. An empty box has not been searched; a `200` with no items has. Sending `q=` would get a
 * `400` back and turn "you have not typed anything yet" into an error screen.
 */
export type SearchQueryState =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'TOO_LONG' }
  | { readonly kind: 'READY'; readonly query: string };

export function classifySearchQuery(raw: string): SearchQueryState {
  // Length is checked before normalisation, as the server checks it, so a megabyte of whitespace is
  // refused rather than trimmed into a valid query.
  if (raw.length > MAX_SEARCH_QUERY_LENGTH) {
    return { kind: 'TOO_LONG' };
  }
  const query = normalizeSearchQuery(raw);
  return query === '' ? { kind: 'EMPTY' } : { kind: 'READY', query };
}

/**
 * One hit, as the client models it.
 *
 * Identical to the wire's `DramaSearchHit` but for `matchedOn`, which degrades to `null` when the
 * server reports a tier this build does not know. The contract publishes two today and the ranking
 * behind it already distinguishes four (title prefix, title substring, exact tag, partial tag), so
 * a third value reaching a shipped bundle is a question of when. It must not be cast into the union
 * — that is how an unhandled value reaches a `switch` — and it must not take the screen down
 * either: the tier is a label, and a row whose label we cannot write is still a row the viewer
 * asked for.
 */
export interface SearchHit {
  readonly dramaId: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly matchedOn: DramaSearchMatch | null;
}

export interface SearchResults {
  /** The server's normalised echo of the query, in the viewer's own casing. Rendered as text. */
  readonly query: string;
  readonly items: readonly SearchHit[];
  /** More matched than `limit` allowed through. There is no cursor; the move is to narrow. */
  readonly truncated: boolean;
}

export interface SearchRequest {
  /** Already normalised and non-empty. `classifySearchQuery` is what produces one. */
  readonly query: string;
  readonly limit?: number;
}

export interface SearchApi {
  search(request: SearchRequest): Promise<Result<SearchResults, ApiFailure>>;
}

export function createSearchApi(http: HttpClient): SearchApi {
  return {
    search: async (request) => {
      const body = await http.getJson(SEARCH_PATH, { q: request.query, limit: request.limit });
      return body.ok ? narrowSearchResults(body.value) : body;
    },
  };
}

/**
 * A `200` in the wrong shape is a failure, not a value — caught here rather than at the point of
 * use, where it is a component reading `.map` off `undefined` in a place with no error copy. It
 * reports `MALFORMED`, which classifies as retryable, because a truncated body is far likelier in
 * the field than a server that changed its contract.
 */
function narrowSearchResults(body: unknown): Result<SearchResults, ApiFailure> {
  const record = asRecord(body);
  const rawItems = record?.['items'];
  const query = record?.['query'];
  const truncated = record?.['truncated'];

  if (typeof query !== 'string' || typeof truncated !== 'boolean' || !Array.isArray(rawItems)) {
    return err(
      apiFailure({ kind: 'MALFORMED', message: 'the response was not a search result set' }),
    );
  }

  const items: SearchHit[] = [];
  for (const raw of rawItems) {
    const hit = narrowSearchHit(raw);
    if (hit === null) {
      return err(
        apiFailure({ kind: 'MALFORMED', message: 'a search hit did not match the contract' }),
      );
    }
    items.push(hit);
  }

  return ok({ query, items, truncated });
}

function narrowSearchHit(value: unknown): SearchHit | null {
  const record = asRecord(value);
  if (record === null) return null;

  const { dramaId, title } = record;
  const tags = record['tags'];
  // The identifier is the row's destination and the title is the row itself. Without either there
  // is nothing to render and nowhere to go, so the hit is rejected rather than patched up.
  if (typeof dramaId !== 'string' || dramaId === '' || typeof title !== 'string') return null;
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) return null;

  return {
    dramaId,
    title,
    tags: tags as readonly string[],
    matchedOn: isSearchMatch(record['matchedOn']) ? record['matchedOn'] : null,
  };
}

function isSearchMatch(value: unknown): value is DramaSearchMatch {
  return value === 'TITLE' || value === 'TAG';
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
