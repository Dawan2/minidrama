/**
 * Route table.
 *
 * Hash routing is not a style choice: the deliverable is a static ZIP with no server able to
 * rewrite paths, so a history-mode reload has no safe answer (`docs/architecture/tech-stack.md`
 * T5). Paths are declared here as data so the router and the deep-link resolver cannot drift.
 */
export const ROUTES = {
  home: '/home',
  play: '/play/:episodeId',
  fallback: '/fallback',
} as const;

export type RouteName = keyof typeof ROUTES;

export function playPath(episodeId: string): string {
  return `/play/${encodeURIComponent(episodeId)}`;
}
