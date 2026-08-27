import type { VePlayerConfig, VePlayerEventName, VePlayerInstance } from './veplayer-types';

/**
 * A stand-in for the platform player, used by `MockBridge` in browser development and tests.
 *
 * It renders a placeholder element and **never creates a `video` element**. That restraint is the
 * point: native HTML video is prohibited platform-wide and TikTok replaces it with a blocked UI
 * (`docs/architecture/system-overview.md` §5.1). A mock that used `<video>` would make the
 * forbidden thing feel normal in local development and would defeat the bundle scan.
 */
export class MockVePlayer implements VePlayerInstance {
  static readonly instances: MockVePlayer[] = [];

  readonly config: VePlayerConfig;
  destroyed = false;
  playing = false;
  playNextCount = 0;

  readonly #handlers = new Map<VePlayerEventName, Set<(payload?: unknown) => void>>();
  readonly #surface: HTMLElement;

  constructor(config: VePlayerConfig) {
    this.config = config;
    MockVePlayer.instances.push(this);

    this.#surface = config.el.ownerDocument.createElement('div');
    this.#surface.dataset['mockVeplayer'] = 'true';
    this.#surface.dataset['vid'] = config.vid;
    this.#surface.textContent = `MockVePlayer · ${config.albumId}/${config.episodeId}`;
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

  playNext(): void {
    this.playNextCount += 1;
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

  #emit(event: VePlayerEventName, payload?: unknown): void {
    for (const handler of this.#handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}
