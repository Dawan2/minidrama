/**
 * VePlayer plugin policy (`docs/product/sitemap-and-ia.md` §4.1, `docs/design/playback-contract.md` §6).
 *
 * Constructor `ignores` is the documented API. Progress and `playbackrate` are **kept by
 * omission** — scrub and 倍速 are plugin-owned (`AC-PL-6`). Un-ignoring the rate plugin does
 * not pick a client ladder: X-26 (scope vs inventory) stays the plugin's rates, not a
 * constant of ours.
 *
 * Names match the official immersive sample in `docs/research/tiktok-minis-official.md` §4.1,
 * minus `playbackrate`. Progress was never in that sample.
 */

export const VEPLAYER_IGNORED_PLUGINS = [
  'moreButtonPlugin',
  'enter',
  'fullscreen',
  'volume',
  'play',
  'pip',
  'replay',
  'sdkDefinitionPlugin',
] as const;

export type VePlayerIgnoredPlugin = (typeof VEPLAYER_IGNORED_PLUGINS)[number];

/** Tap-to-pause stays VePlayer's. Double-click is ours (点赞), so the player must ignore it. */
export const VEPLAYER_CLOSE_VIDEO_CLICK = false;
export const VEPLAYER_CLOSE_VIDEO_DBLCLICK = true;

const PROGRESS_PLUGIN_NAME = /progress/i;
const RATE_PLUGIN_NAME = /playbackrate/i;

/**
 * True when an `ignores` list would hide the progress bar. Product source must not do this:
 * the sheet's 进度条拖拽 is the kept plugin, not a panel of ours.
 */
export function ignoresProgressPlugin(ignores: readonly string[]): boolean {
  return ignores.some((name) => PROGRESS_PLUGIN_NAME.test(name));
}

/**
 * True when an `ignores` list would hide 倍速. Product source must not do this: the sheet's
 * speed control is the kept plugin, not a PNL-05 of ours, and not an HTML media rate.
 */
export function ignoresPlaybackratePlugin(ignores: readonly string[]): boolean {
  return ignores.some((name) => RATE_PLUGIN_NAME.test(name));
}
