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
  drama: '/drama/:dramaId',
  play: '/play/:episodeId',
  /**
   * SCR-06 and SCR-07. `#/favorites` (SCR-08) is deliberately absent: the screen does not exist,
   * and a declared path with no route registered behind it resolves to the fallback screen, which
   * would turn the profile's favourites entry into "this page does not exist".
   */
  me: '/me',
  history: '/history',
  fallback: '/fallback',
} as const;

export type RouteName = keyof typeof ROUTES;

/** The three variants of the global fallback screen (`docs/02-screen-inventory.md` SCR-13). */
export const FALLBACK_REASONS = ['NOT_FOUND', 'OFFLINE', 'MAINTENANCE'] as const;

export type FallbackReason = (typeof FALLBACK_REASONS)[number];

export function isFallbackReason(value: string): value is FallbackReason {
  return (FALLBACK_REASONS as readonly string[]).includes(value);
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
