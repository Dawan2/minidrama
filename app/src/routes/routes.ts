/**
 * Route table.
 *
 * Hash routing is not a style choice: the deliverable is a static ZIP with no server able to
 * rewrite paths, so a history-mode reload has no safe answer (`docs/architecture/tech-stack.md`
 * T5). Paths are declared here as data so the router and the deep-link resolver cannot drift.
 *
 * The paths match `docs/02-information-architecture.md` §5, including the ones this slot does not
 * implement, so the parameter names and the shape of a deep link are settled once. `:episodeId` is
 * the authoritative locator for playback — a deep link carries one id and the drama is looked up
 * from it (§5), which is why the player route does not take a drama.
 */
export const ROUTES = {
  home: '/home',
  search: '/search',
  drama: '/drama/:dramaId',
  play: '/play/:episodeId',
  /** SCR-06, SCR-07 and SCR-08 — the three personal screens, all built. */
  me: '/me',
  history: '/history',
  favorites: '/favorites',
  fallback: '/fallback',
} as const;

export type RouteName = keyof typeof ROUTES;

/** The three variants of the global fallback screen (`docs/02-screen-inventory.md` SCR-13). */
export const FALLBACK_REASONS = ['NOT_FOUND', 'OFFLINE', 'MAINTENANCE'] as const;

export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export function isFallbackReason(value: string): value is FallbackReason {
  return (FALLBACK_REASONS as readonly string[]).includes(value);
}

/**
 * The search term lives in the route, not in component state.
 *
 * `docs/02-information-architecture.md` §5 wants list state in the query string so that back and a
 * shared link both restore the view the viewer was looking at. It is named `q` after the parameter
 * the endpoint takes, so there is one name for the term from the address bar to the request.
 */
export const SEARCH_QUERY_PARAM = 'q';

export function searchPath(query = ''): string {
  return query === ''
    ? ROUTES.search
    : `${ROUTES.search}?${SEARCH_QUERY_PARAM}=${encodeURIComponent(query)}`;
}

export function dramaPath(dramaId: string): string {
  return `/drama/${encodeURIComponent(dramaId)}`;
}

export function playPath(episodeId: string): string {
  return `/play/${encodeURIComponent(episodeId)}`;
}

export function fallbackPath(reason: FallbackReason): string {
  return `${ROUTES.fallback}?reason=${reason}`;
}
