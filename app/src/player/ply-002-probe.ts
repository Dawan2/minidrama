/**
 * PLY-002 — the equivalent-WebView MSE/EME probe this codebase can own without a device.
 *
 * C3's third exit (`docs/plan/wave-protocol.md` §5.1, `docs/verify/cycle-3-report.md` §0) asks for
 * an MSE/EME conclusion from an independent Android Chromium WebView and iOS WKWebView, written
 * back so B-8 / U-16 drop from "unknown" to "pending TikTok-host retest" (`PLY-003`, gated on M1).
 *
 * This process is neither of those hosts, and it is not a TikTok WebView. Feature-detecting
 * `MediaSource` here (jsdom, Node, a desktop browser) and calling the result a C3 probe would be
 * a fake pass: COR-1 already restated MSE as a *preload* question, and preload-hit rate is a
 * per-OS-version measurement that does not exist until those hosts run. Constructing
 * `MediaSource` / `ManagedMediaSource` ourselves would also be the thing the media-plane decision
 * bans — VePlayer owns MSE, we own the constructor flag `enableMp4MSE`.
 *
 * So the probe is fail-closed: host availability stays `unmeasured`, we never construct MSE, and
 * the contract tests next to this file pin the three properties we *can* enforce off-device —
 * `getPlayer` ctor, fail-closed replace-element, and no media URL reaching VePlayer.
 *
 * Remaining unknown: `docs/gates/ply-002.md`. Not `[x]`.
 */

/** The only VePlayer key that is allowed to mention MP4/MSE: a construction flag, not a locator. */
export const VEPLAYER_MSE_FLAG = 'enableMp4MSE' as const;

/**
 * Names that mean "here is where the bytes are".
 *
 * Same idea as `app/src/data/playback-api.ts`, applied to what the facade *hands the player*.
 * `enableMp4MSE` matches `mp4` and is allow-listed at the call site — it is not a URL.
 */
export const MEDIA_HANDLE_KEY =
  /url|uri|src|href|m3u8|mp4|mpd|hls|dash|cdn|manifest|playlist|playUrl|definition|quality|bitrate|resolution/i;

export const MEDIA_HANDLE_VALUE = /https?:\/\/|\.m3u8|\.mp4|\.mpd|\.ts\b|blob:|mse:/i;

export const PLY_002_REQUIRED_HOSTS = ['android-chromium-webview', 'ios-wkwebview'] as const;

export type Ply002HostStatus = 'unmeasured';

export interface Ply002HostMeasurement {
  readonly status: Ply002HostStatus;
  readonly reason: 'NOT_EQUIVALENT_WEBVIEW_AND_NOT_TIKTOK_WEBVIEW';
  readonly requiredHosts: typeof PLY_002_REQUIRED_HOSTS;
  /** Always false: constructing MSE is how we would start owning the media plane. */
  readonly constructedMediaSource: false;
}

/**
 * Report that this process cannot answer PLY-002's host question.
 *
 * Does not read `MediaSource` / `ManagedMediaSource` / `navigator.requestMediaKeySystemAccess`.
 * Those answers from jsdom are not the equivalent-WebView measurement the exit criterion named.
 */
export function measurePly002EquivalentHost(): Ply002HostMeasurement {
  return {
    status: 'unmeasured',
    reason: 'NOT_EQUIVALENT_WEBVIEW_AND_NOT_TIKTOK_WEBVIEW',
    requiredHosts: PLY_002_REQUIRED_HOSTS,
    constructedMediaSource: false,
  };
}

export function leakingMediaHandleKeys(
  record: Record<string, unknown>,
  extraAllowed: readonly string[] = [],
): readonly string[] {
  const allowed = new Set<string>([VEPLAYER_MSE_FLAG, ...extraAllowed]);
  return Object.keys(record).filter((key) => !allowed.has(key) && MEDIA_HANDLE_KEY.test(key));
}

export function leakingMediaHandleValues(record: Record<string, unknown>): readonly string[] {
  const leaks: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === 'el') {
      continue;
    }
    if (typeof value === 'string' && MEDIA_HANDLE_VALUE.test(value)) {
      leaks.push(`${key}=${value}`);
    }
  }
  return leaks;
}
