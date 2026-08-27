import { bridgeError, err, ok } from '@minidrama/shared';
import type { BridgeError, PlaybackDescriptor, Result } from '@minidrama/shared';

import type { PlatformBridge } from '../platform/types';
import type { VePlayerEventName, VePlayerInstance } from './veplayer-types';

/**
 * The player facade.
 *
 * We do not own the player, we own its *lifecycle*: construction, teardown, and the mapping from
 * player events to our analytics and error handling (`docs/architecture/tech-stack.md` §3). No
 * React state mirrors the player's internal state — the player is the source of truth for
 * playback and we subscribe to it.
 *
 * The two invariants this module exists to hold:
 *   1. exactly one live instance per surface, and `destroy()` always runs;
 *   2. a failure to obtain the player degrades to a typed error, never an exception. A user who
 *      never opens the player must not be blocked by a player failure (§3.1).
 */

export interface PlayerFacadeOptions {
  readonly container: HTMLElement;
  readonly descriptor: PlaybackDescriptor;
  readonly lang?: string;
  readonly autoplay?: boolean;
  readonly onEvent?: (event: VePlayerEventName, payload?: unknown) => void;
}

export interface PlayerFacade {
  readonly instance: VePlayerInstance;
  play(): void;
  pause(): void;
  playNext(): void;
  /** Idempotent. Safe to call from a React cleanup that may run twice under StrictMode. */
  destroy(): void;
}

const OBSERVED_EVENTS: readonly VePlayerEventName[] = [
  'ready',
  'play',
  'pause',
  'ended',
  'error',
  'timeupdate',
  'preloadInfo',
];

export async function createPlayerFacade(
  bridge: PlatformBridge,
  options: PlayerFacadeOptions,
): Promise<Result<PlayerFacade, BridgeError>> {
  const ctorResult = await bridge.getPlayerCtor();
  if (!ctorResult.ok) {
    return ctorResult;
  }

  const { descriptor } = options;
  let instance: VePlayerInstance;
  try {
    instance = new ctorResult.value({
      el: options.container,
      albumId: descriptor.albumId,
      episodeId: descriptor.episodeId,
      vid: descriptor.vid,
      // Present only for TikTok clients below 44.5.0. `exactOptionalPropertyTypes` makes the
      // difference between "absent" and "undefined" a compile error, which is what we want here:
      // sending an explicit `undefined` token to the player is not the same as omitting it.
      ...(descriptor.playAuthToken === undefined
        ? {}
        : { playAuthToken: descriptor.playAuthToken }),
      // Preload needs MP4 + MSE. Turning this off silently costs first-frame time (§5.3).
      enableMp4MSE: true,
      autoplay: options.autoplay ?? true,
      startTime: descriptor.resumePositionSec,
      lang: options.lang ?? 'en',
      autoSubtitle: true,
    });
  } catch (cause) {
    return err(bridgeError('BRIDGE_UNKNOWN', 'VePlayer construction threw', cause));
  }

  const { onEvent } = options;
  const subscriptions: [VePlayerEventName, (payload?: unknown) => void][] = [];
  if (onEvent) {
    for (const event of OBSERVED_EVENTS) {
      const handler = (payload?: unknown): void => {
        onEvent(event, payload);
      };
      instance.on(event, handler);
      subscriptions.push([event, handler]);
    }
  }

  let destroyed = false;
  const facade: PlayerFacade = {
    instance,
    play: () => {
      instance.play();
    },
    pause: () => {
      instance.pause();
    },
    playNext: () => {
      instance.playNext();
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const [event, handler] of subscriptions) {
        instance.off(event, handler);
      }
      subscriptions.length = 0;
      instance.destroy();
    },
  };

  return ok(facade);
}
