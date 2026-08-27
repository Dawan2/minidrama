import type {
  VePlayerConfig,
  VePlayerEventName,
  VePlayerInstance,
  VePlayerPlaylistItem,
} from './veplayer-types';

/**
 * A stand-in for the platform player, used by `MockBridge` in browser development and tests.
 *
 * It renders a placeholder element and **never creates a `video` element**. That restraint is the
 * point: native HTML video is prohibited platform-wide and TikTok replaces it with a blocked UI
 * (`docs/architecture/system-overview.md` §5.1). A mock that used `<video>` would make the
 * forbidden thing feel normal in local development and would defeat the bundle scan.
 *
 * It also *moves* on `playNext()` instead of only counting the call. An episode switch that leaves
 * the placeholder showing the previous episode would let a surface that never advances anything
 * pass its tests, which is the specific bug this mock is here to catch.
 */
export class MockVePlayer implements VePlayerInstance {
  static readonly instances: MockVePlayer[] = [];

  readonly config: VePlayerConfig;
  destroyed = false;
  playing = false;
  playNextCount = 0;
  preloadList: readonly VePlayerPlaylistItem[] = [];

  readonly #handlers = new Map<VePlayerEventName, Set<(payload?: unknown) => void>>();
  readonly #surface: HTMLElement;
  #index = 0;

  constructor(config: VePlayerConfig) {
    this.config = config;
    MockVePlayer.instances.push(this);

    this.#surface = config.el.ownerDocument.createElement('div');
    this.#surface.dataset['mockVeplayer'] = 'true';
    this.#render(config.albumId, config.episodeId, config.vid);
    config.el.appendChild(this.#surface);

    queueMicrotask(() => {
      if (!this.destroyed) {
        this.#emit('ready');
        if (config.autoplay) {
          this.play();
        }
      }
    });
  }

  static reset(): void {
    MockVePlayer.instances.length = 0;
  }

  /** The episode on screen, which is the constructed one until `playNext()` moves it. */
  get currentEpisodeId(): string {
    return this.preloadList[this.#index]?.episodeId ?? this.config.episodeId;
  }

  play(): void {
    if (this.destroyed) {
      return;
    }
    this.playing = true;
    this.#emit('play');
  }

  pause(): void {
    this.playing = false;
    this.#emit('pause');
  }

  setPreloadList(items: readonly VePlayerPlaylistItem[]): void {
    this.preloadList = [...items];
    const position = this.preloadList.findIndex((item) => item.episodeId === this.config.episodeId);
    this.#index = position === -1 ? 0 : position;
  }

  playNext(): void {
    if (this.destroyed) {
      return;
    }
    this.playNextCount += 1;
    const next = this.preloadList[this.#index + 1];
    if (next !== undefined) {
      this.#index += 1;
      this.#render(next.albumId, next.episodeId, next.vid);
    }
    this.playing = true;
    this.#emit('play');
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.playing = false;
    this.#handlers.clear();
    this.#surface.remove();
  }

  on(event: VePlayerEventName, handler: (payload?: unknown) => void): void {
    const existing = this.#handlers.get(event) ?? new Set();
    existing.add(handler);
    this.#handlers.set(event, existing);
  }

  off(event: VePlayerEventName, handler: (payload?: unknown) => void): void {
    this.#handlers.get(event)?.delete(handler);
  }

  emitForTest(event: VePlayerEventName, payload?: unknown): void {
    this.#emit(event, payload);
  }

  #render(albumId: string, episodeId: string, vid: string): void {
    this.#surface.dataset['vid'] = vid;
    this.#surface.dataset['episodeId'] = episodeId;
    this.#surface.textContent = `MockVePlayer · ${albumId}/${episodeId}`;
  }

  #emit(event: VePlayerEventName, payload?: unknown): void {
    for (const handler of this.#handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}
