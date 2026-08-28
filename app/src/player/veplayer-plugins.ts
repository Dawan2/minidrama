/**
 * VePlayer plugin policy (`docs/product/sitemap-and-ia.md` §4.1, `docs/design/playback-contract.md` §6).
 *
 * Constructor `ignores` is the documented API. Progress is **kept by omission** — scrubbing is
 * plugin-owned (`AC-PL-6`) and reimplementing it would mean reimplementing seek. The rate plugin
 * stays ignored here: X-26 (scope vs inventory ladders) is unadjudicated, so this slice does
 * not un-ignore 倍速 and does not invent a client rate ladder.
 *
 * Names match the official immersive sample in `docs/research/tiktok-minis-official.md` §4.1.
 */

export const VEPLAYER_IGNORED_PLUGINS = [
  'moreButtonPlugin',
  'enter',
  'fullscreen',
  'volume',
  'play',
  'pip',
  'replay',
  'playbackrate',
  'sdkDefinitionPlugin',
] as const;

export type VePlayerIgnoredPlugin = (typeof VEPLAYER_IGNORED_PLUGINS)[number];

/** Tap-to-pause stays VePlayer's. Double-click is ours (点赞), so the player must ignore it. */
export const VEPLAYER_CLOSE_VIDEO_CLICK = false;
export const VEPLAYER_CLOSE_VIDEO_DBLCLICK = true;

const PROGRESS_PLUGIN_NAME = /progress/i;

/**
 * True when an `ignores` list would hide the progress bar. Product source must not do this:
 * the sheet's 进度条拖拽 is the kept plugin, not a panel of ours.
 */
export function ignoresProgressPlugin(ignores: readonly string[]): boolean {
  return ignores.some((name) => PROGRESS_PLUGIN_NAME.test(name));
}
