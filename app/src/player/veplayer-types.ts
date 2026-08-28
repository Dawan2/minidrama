/**
 * Minimal structural types for the platform-supplied VePlayer.
 *
 * VePlayer is not an npm dependency: it arrives on `window.TTMinis` at runtime and we cannot
 * install its typings. These declarations describe only the surface the facade actually uses,
 * reconstructed from `docs/architecture/system-overview.md` §5 and the public player docs. They
 * are deliberately narrow — a wider guess would be a wider lie.
 */

export type VePlayerEventName =
  'ready' | 'play' | 'pause' | 'ended' | 'error' | 'timeupdate' | 'preloadInfo';

export interface VePlayerConfig {
  /** The element the player takes ownership of. React must not render into it afterwards. */
  readonly el: HTMLElement;
  readonly albumId: string;
  readonly episodeId: string;
  readonly vid: string;
  /** Only sent for TikTok clients below 44.5.0. Absent means "the client can play without it". */
  readonly playAuthToken?: string;
  /** Required for the preload module: preload needs MP4 + MSE (§5.3). */
  readonly enableMp4MSE: boolean;
  readonly autoplay: boolean;
  readonly startTime: number;
  /** Documented values: 'en' | 'zh-cn' | 'jp'. English is the fallback. */
  readonly lang: string;
  readonly autoSubtitle: boolean;
  /**
   * Plugin policy (`docs/product/sitemap-and-ia.md` §4.1). Progress is kept by *not* listing it.
   * `playbackrate` stays listed until X-26 is adjudicated — this slice does not un-ignore 倍速.
   */
  readonly ignores: readonly string[];
  /** `false`: tap-to-pause stays VePlayer's (`AC-PL-6`). */
  readonly closeVideoClick: boolean;
  /** `true`: double-click is our 点赞, not the player's like. */
  readonly closeVideoDblclick: boolean;
}

/**
 * One entry of the ordered playlist handed to `setPreloadList`.
 *
 * The identifiers only, and the same ones the constructor takes. There is no URL here for the same
 * reason there is none in `PlaybackDescriptor`: the media plane is not ours (correction A4).
 */
export interface VePlayerPlaylistItem {
  readonly albumId: string;
  readonly episodeId: string;
  readonly vid: string;
  readonly playAuthToken?: string;
}

export interface VePlayerInstance {
  play(): void;
  pause(): void;
  /** Episode switching reuses one instance; a new instance per episode defeats preload (§4.3). */
  playNext(): void;
  destroy(): void;
  on(event: VePlayerEventName, handler: (payload?: unknown) => void): void;
  off(event: VePlayerEventName, handler: (payload?: unknown) => void): void;
  /**
   * The ordered episodes the player preloads and advances through (§5.3). Optional because it
   * belongs to the preload module, which needs MP4 + MSE and is therefore absent below the MSE bar
   * (risk M-3). A client without it plays and switches; it just starts each episode cold, so this
   * is feature-detected rather than assumed.
   */
  setPreloadList?(items: readonly VePlayerPlaylistItem[]): void;
}

export type VePlayerConstructor = new (config: VePlayerConfig) => VePlayerInstance;
