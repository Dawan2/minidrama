import { DRAMA_CATEGORIES } from '@minidrama/shared';
import type { DramaCategory } from '@minidrama/shared';

import { ROUTES } from './routes';

/**
 * The browse list's identity, as the route carries it.
 *
 * `docs/02-information-architecture.md` §5 wants category, tag and sort in the query string so
 * back and a shared link restore the same grid. The names match `GET /v1/dramas` exactly — one
 * spelling from the address bar to the request — and an unknown value is dropped rather than
 * forwarded. The server answers `400` for an invented category; sending one would turn a mistyped
 * deep link into an error screen.
 */

export const BROWSE_CATEGORY_PARAM = 'category';
export const BROWSE_TAG_PARAM = 'tag';
export const BROWSE_SORT_PARAM = 'sort';

export const BROWSE_SORTS = ['HOT', 'NEW'] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];

/** Matches the catalogue route: longer than this is `400`, not a tag. */
export const BROWSE_MAX_TAG_LENGTH = 64;

export interface BrowseQuery {
  readonly category: DramaCategory | undefined;
  readonly tag: string | undefined;
  readonly sort: BrowseSort;
}

export const DEFAULT_BROWSE_QUERY: BrowseQuery = {
  category: undefined,
  tag: undefined,
  sort: 'HOT',
};

export function isDramaCategory(value: string): value is DramaCategory {
  return (DRAMA_CATEGORIES as readonly string[]).includes(value);
}

export function isBrowseSort(value: string): value is BrowseSort {
  return (BROWSE_SORTS as readonly string[]).includes(value);
}

export function parseBrowseQuery(params: { get(name: string): string | null }): BrowseQuery {
  const categoryRaw = params.get(BROWSE_CATEGORY_PARAM);
  const tagRaw = params.get(BROWSE_TAG_PARAM);
  const sortRaw = params.get(BROWSE_SORT_PARAM);

  return {
    category: categoryRaw !== null && isDramaCategory(categoryRaw) ? categoryRaw : undefined,
    tag: parseTag(tagRaw),
    sort: sortRaw !== null && isBrowseSort(sortRaw) ? sortRaw : 'HOT',
  };
}

function parseTag(raw: string | null): string | undefined {
  if (raw === null) {
    return undefined;
  }
  const tag = raw.trim();
  if (tag.length < 1 || tag.length > BROWSE_MAX_TAG_LENGTH) {
    return undefined;
  }
  return tag;
}

/**
 * Only the non-default filters. `sort=HOT` is the server default, so putting it in the URL would
 * make two spellings of the same view (`#/browse` and `#/browse?sort=HOT`) and a "clear" that
 * left it behind.
 */
export function browseSearchParams(query: BrowseQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.category !== undefined) {
    params[BROWSE_CATEGORY_PARAM] = query.category;
  }
  if (query.tag !== undefined) {
    params[BROWSE_TAG_PARAM] = query.tag;
  }
  if (query.sort !== 'HOT') {
    params[BROWSE_SORT_PARAM] = query.sort;
  }
  return params;
}

export function browsePath(
  query: {
    readonly category?: DramaCategory;
    readonly tag?: string;
    readonly sort?: BrowseSort;
  } = {},
): string {
  const encoded = new URLSearchParams(
    browseSearchParams({
      category: query.category,
      tag: query.tag,
      sort: query.sort ?? 'HOT',
    }),
  ).toString();
  return encoded === '' ? ROUTES.browse : `${ROUTES.browse}?${encoded}`;
}

export function browseRequestKey(query: BrowseQuery): string {
  return `browse:${query.sort}:${query.category ?? ''}:${query.tag ?? ''}`;
}

export function browseHasFilters(query: BrowseQuery): boolean {
  return query.category !== undefined || query.tag !== undefined || query.sort !== 'HOT';
}
