/**
 * Navigation-bar palettes, matching `styles/app.css`.
 *
 * `setNavigationBarColor` is a platform chrome call, not a CSS variable: the TikTok shell around
 * the WebView does not read `--bg`. The hex values are the same colours the pages already paint,
 * so the bar and the page do not flash a second theme on every route change.
 *
 * Two palettes, because `docs/design/minis-integration.md` IP-12 is enter-player (immersive) /
 * leave (restore). A capability that is missing is skipped at the call site; these objects still
 * name what we *would* have set, so the layout can stay consistent with the CSS fallback.
 */
export const CHROME_NAV_BAR = {
  kind: 'chrome',
  frontColor: '#ffffff',
  backgroundColor: '#0b0b0f',
} as const;

export const IMMERSIVE_NAV_BAR = {
  kind: 'immersive',
  frontColor: '#ffffff',
  backgroundColor: '#000000',
} as const;

export type NavigationBarPalette = typeof CHROME_NAV_BAR | typeof IMMERSIVE_NAV_BAR;

export function navigationBarForPath(pathname: string): NavigationBarPalette {
  return isPlayPath(pathname) ? IMMERSIVE_NAV_BAR : CHROME_NAV_BAR;
}

function isPlayPath(pathname: string): boolean {
  return pathname === '/play' || pathname.startsWith('/play/');
}
