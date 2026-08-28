import { bridgeError, err, ok } from '@minidrama/shared';
import type { BridgeError, PlaybackDescriptor, Result } from '@minidrama/shared';

import type { PlatformBridge } from '../platform/types';
import type { VePlayerEventName, VePlayerInstance, VePlayerPlaylistItem } from './veplayer-types';
import {
  VEPLAYER_CLOSE_VIDEO_CLICK,
  VEPLAYER_CLOSE_VIDEO_DBLCLICK,
  VEPLAYER_IGNORED_PLUGINS,
} from './veplayer-plugins';

/**
 * The player facade.
 *
 * We do not own the player, we own its *lifecycle*: construction, teardown, and the mapping from
 * player events to our analytics and error handling (`docs/architecture/tech-stack.md` §3). No
 * React state mirrors the player's internal state — the player is the source of truth for
 * playback and we subscribe to it.
 *
 * The three invariants this module exists to hold:
 *   1. exactly one live instance per surface, and `destroy()` always runs;
 *   2. an episode switch happens *on* that instance through `playNext()`, never by building a
 *      second one — a new player per episode throws away the preloaded next episode and pays the
 *      cold first-frame cost the preload module exists to avoid (§5.3, `docs/architecture/
 *      system-overview.md`);
 *   3. a failure to obtain the player degrades to a typed error, never an exception. A user who
 *      never opens the player must not be blocked by a player failure (§3.1).
 */

export interface PlayerFacadeOptions {
  readonly container: HTMLElement;
  /** The episode the instance is built on. */
  readonly descriptor: PlaybackDescriptor;
  /**
   * The rest of the album in viewing order, which is what makes `playNext()` mean something: the
   * player is told the playlist through `setPreloadList` (§5.3) and we keep the same order so the
   * facade can say which episode is on screen without asking the player.
   *
   * Omitted means "this episode and nothing after it" — `playNext()` then has nowhere to go and
   * says so, rather than asking the player for an episode nobody holds a session for.
   */
  readonly upNext?: readonly PlaybackDescriptor[];
  readonly lang?: string;
  readonly autoplay?: boolean;
  readonly onEvent?: (event: VePlayerEventName, payload?: unknown) => void;
}

/**
 * What happened when a caller asked for an episode, which the caller has to know because one of
 * the three answers is "this one is not reachable, rebuild me".
 */
export type EpisodeSwitch =
  | 'UNCHANGED'
  | 'ADVANCED'
  /**
   * `playNext()` is the only switch verb the player gives us, so the only episode reachable from
   * here is the following one. A jump — backwards, across albums, or five episodes ahead — is a
   * new instance, because the alternative is calling `playNext()` in a loop and playing every
   * episode in between, with the events and the analytics that implies.
   */
  | 'OUT_OF_REACH';

export interface PlayerFacade {
  readonly instance: VePlayerInstance;
  /** The episode the retained instance is playing right now. Moves with `playNext()`. */
  currentEpisode(): PlaybackDescriptor;
  play(): void;
  pause(): void;
  /** Advances one episode. `false` — and nothing called on the player — at the end of the queue. */
  playNext(): boolean;
  /**
   * Appends the immediately following entitled descriptor so `playNext()` has somewhere to go.
   *
   * PlayPage learns that descriptor from `gateAdvance`, not from a client-built album. A different
   * episode already queued as next, or a destroyed instance, is `false` and does not call the
   * player. Identifiers only — never a URL.
   */
  enqueueNext(descriptor: PlaybackDescriptor): boolean;
  /**
   * Apply a freshly minted descriptor to the episode already on screen (`PLY-012`).
   *
   * Same episode, same instance, no `playNext` — advancing would start the neighbour. A different
   * episode id is `false` and does not touch the player: that is a 切集, not a re-issue. Does not
   * seek; the kernel already holds the position. `resumePositionSec` on the new body is ignored.
   */
  reissue(descriptor: PlaybackDescriptor): boolean;
  /** Moves the retained instance to `episodeId` when it can get there without being rebuilt. */
  switchToEpisode(episodeId: string): EpisodeSwitch;
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
  let queue: readonly PlaybackDescriptor[] = [descriptor, ...(options.upNext ?? [])];
  let instance: VePlayerInstance | undefined;
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
      // Session resume only. Catalog duration is a heartbeat observation, not a start time,
      // and a 403 never reaches this constructor — PlayPage does not mint a player for a lock.
      startTime: descriptor.resumePositionSec,
      lang: options.lang ?? 'en',
      autoSubtitle: true,
      // Immersive plugin policy. playbackrate is kept (倍速); the plugin owns the ladder (X-26).
      ignores: VEPLAYER_IGNORED_PLUGINS,
      closeVideoClick: VEPLAYER_CLOSE_VIDEO_CLICK,
      closeVideoDblclick: VEPLAYER_CLOSE_VIDEO_DBLCLICK,
    });
    // The player's own copy of the order. Without it `playNext()` is a request to advance through
    // a playlist the player was never given.
    instance.setPreloadList?.(queue.map(toPlaylistItem));
  } catch (cause) {
    // An instance that was built and then failed to configure is still a live instance. Dropping
    // the reference here would leak it with nothing left able to destroy it.
    try {
      instance?.destroy();
    } catch {
      // The player is already failing; a teardown that also throws adds nothing to the report.
    }
    return err(
      bridgeError('BRIDGE_UNKNOWN', 'VePlayer construction or configuration threw', cause),
    );
  }

  const player = instance;
  const { onEvent } = options;
  const subscriptions: [VePlayerEventName, (payload?: unknown) => void][] = [];
  if (onEvent) {
    for (const event of OBSERVED_EVENTS) {
      const handler = (payload?: unknown): void => {
        onEvent(event, payload);
      };
      player.on(event, handler);
      subscriptions.push([event, handler]);
    }
  }

  let cursor = 0;
  let destroyed = false;

  /**
   * Every method is inert after teardown rather than throwing. The calls that arrive late are the
   * ones from a `then` that resolved after the surface unmounted, and a destroyed player is the
   * correct answer to them — not a crash on a screen the user has already left.
   */
  const facade: PlayerFacade = {
    instance: player,
    currentEpisode: () => queue[cursor] ?? descriptor,
    play: () => {
      if (!destroyed) {
        player.play();
      }
    },
    pause: () => {
      if (!destroyed) {
        player.pause();
      }
    },
    playNext: () => {
      if (destroyed || cursor + 1 >= queue.length) {
        return false;
      }
      cursor += 1;
      player.playNext();
      return true;
    },
    enqueueNext: (next) => {
      if (destroyed) {
        return false;
      }
      if (queue[cursor]?.episodeId === next.episodeId) {
        return true;
      }
      const following = queue[cursor + 1];
      if (following !== undefined) {
        return following.episodeId === next.episodeId;
      }
      queue = [...queue, next];
      player.setPreloadList?.(queue.map(toPlaylistItem));
      return true;
    },
    reissue: (next) => {
      if (destroyed) {
        return false;
      }
      const current = queue[cursor];
      if (current === undefined || current.episodeId !== next.episodeId) {
        return false;
      }
      queue = [...queue.slice(0, cursor), next, ...queue.slice(cursor + 1)];
      player.setPreloadList?.(queue.map(toPlaylistItem));
      player.play();
      return true;
    },
    switchToEpisode: (episodeId) => {
      if (destroyed) {
        return 'OUT_OF_REACH';
      }
      if (queue[cursor]?.episodeId === episodeId) {
        return 'UNCHANGED';
      }
      if (queue[cursor + 1]?.episodeId !== episodeId) {
        return 'OUT_OF_REACH';
      }
      cursor += 1;
      player.playNext();
      return 'ADVANCED';
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const [event, handler] of subscriptions) {
        player.off(event, handler);
      }
      subscriptions.length = 0;
      player.destroy();
    },
  };

  return ok(facade);
}

function toPlaylistItem(descriptor: PlaybackDescriptor): VePlayerPlaylistItem {
  return {
    albumId: descriptor.albumId,
    episodeId: descriptor.episodeId,
    vid: descriptor.vid,
    ...(descriptor.playAuthToken === undefined ? {} : { playAuthToken: descriptor.playAuthToken }),
  };
}
