import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ok, type PlaybackDescriptor } from '@minidrama/shared';
import { createPlayerFacade } from './player-facade';
import { createProgressHeartbeat } from './progress-heartbeat';
import { verticalSwipe } from './episode-swipe';
import { translate } from '../core/i18n';
import type { PlatformBridge } from '../platform/types';
import type { PlayerFacade } from './player-facade';
import type { ProgressHeartbeat, ProgressHeartbeatReport } from './progress-heartbeat';

export interface PlayerSurfaceProps {
  readonly bridge: PlatformBridge;
  /**
   * The album in viewing order. Referentially stable per album: it is what the player is given as
   * its preload list, so a new array on every render would be a new player on every render.
   */
  readonly playlist: readonly PlaybackDescriptor[];
  /** Which entry is on screen. A change here is an episode switch, not a new player. */
  readonly episodeId: string;
  /**
   * Watch-progress write. Absent in tests that only care about construction. PlayPage always
   * passes it: the interval is `GET /v1/config`'s `progressHeartbeatSec`, the write is
   * `PUT /v1/progress/episodes/{episodeId}`. A missing reporter is not a guessed 0 position.
   */
  readonly progress?: {
    readonly report: ProgressHeartbeatReport;
    readonly intervalSec: number;
  };
  /**
   * Current episode finished. PlayPage gates 连播 from here (`AC-PL-5`): a lock holds this
   * instance; an entitled next is `playNext` on it (`AC-PL-3`).
   */
  readonly onEnded?: () => void;
  /** Finger-up 切集. Ignored when omitted. Origin is this surface, not the player chrome. */
  readonly onSwipeNext?: () => void;
  /** Finger-down 切集. `playNext` cannot go backwards; PlayPage rebuilds. */
  readonly onSwipePrevious?: () => void;
}

export interface PlayerSurfaceHandle {
  /**
   * Queue the immediately following entitled descriptor on the live instance. No-ops until the
   * player exists; the create effect applies a pending descriptor before reconciling the route.
   */
  enqueueNext(descriptor: PlaybackDescriptor): void;
}

type SurfaceState = 'loading' | 'playing' | 'unavailable';

/**
 * Hands a container element to a foreign renderer and tears it down deterministically.
 *
 * One effect creates the player and one cleanup destroys it. React never renders into the
 * container after the player takes it, and — the part that matters — **the episode is not one of
 * that effect's dependencies**. Moving to the next episode goes through `switchToEpisode`, which
 * advances the retained instance; only an episode the instance cannot reach from where it is
 * rebuilds one, and rebuilding is an explicit generation bump rather than a re-render side effect.
 *
 * The playlist is read from a ref at construct time for the same reason: appending the next
 * entitled descriptor (autoplay / 连播) must not destroy the instance that just finished.
 */
export const PlayerSurface = forwardRef<PlayerSurfaceHandle, PlayerSurfaceProps>(
  function PlayerSurface(
    { bridge, playlist, episodeId, progress, onEnded, onSwipeNext, onSwipePrevious },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const facadeRef = useRef<PlayerFacade | null>(null);
    const heartbeatRef = useRef<ProgressHeartbeat | null>(null);
    const progressRef = useRef(progress);
    progressRef.current = progress;
    const onEndedRef = useRef(onEnded);
    onEndedRef.current = onEnded;
    const onSwipeNextRef = useRef(onSwipeNext);
    onSwipeNextRef.current = onSwipeNext;
    const onSwipePreviousRef = useRef(onSwipePrevious);
    onSwipePreviousRef.current = onSwipePrevious;
    const swipeOriginY = useRef<number | null>(null);
    const playlistRef = useRef(playlist);
    playlistRef.current = playlist;
    const pendingNextRef = useRef<PlaybackDescriptor | null>(null);
    /** The episode the route wants, readable from the create effect without becoming a dependency. */
    const wantedEpisodeRef = useRef(episodeId);
    const [state, setState] = useState<SurfaceState>('loading');
    const [generation, setGeneration] = useState(0);

    useImperativeHandle(ref, () => ({
      enqueueNext(descriptor: PlaybackDescriptor): void {
        const facade = facadeRef.current;
        if (facade === null) {
          pendingNextRef.current = descriptor;
          return;
        }
        facade.enqueueNext(descriptor);
      },
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const album = playlistRef.current;
      const startIndex = album.findIndex((entry) => entry.episodeId === wantedEpisodeRef.current);
      const descriptor = album[startIndex === -1 ? 0 : startIndex];
      if (descriptor === undefined) {
        // Nothing to play is not a player failure, but it degrades to the same screen: one surface,
        // one degraded state, and a message that offers a way on rather than an empty black frame.
        setState('unavailable');
        return;
      }

      let facade: PlayerFacade | null = null;
      let cancelled = false;
      const progressOptions = progressRef.current;
      const heartbeat =
        progressOptions === undefined
          ? null
          : createProgressHeartbeat({
              episodeId: wantedEpisodeRef.current,
              intervalSec: progressOptions.intervalSec,
              report: (id, report) => {
                const current = progressRef.current;
                // The surface unmounted or a test dropped the reporter. Not a guessed 0 position.
                return current === undefined
                  ? Promise.resolve(ok(undefined))
                  : current.report(id, report);
              },
              subscribeHidden: (flush) => {
                const onHidden = (): void => {
                  if (document.visibilityState === 'hidden') {
                    flush();
                  }
                };
                const onPageHide = (): void => {
                  flush();
                };
                document.addEventListener('visibilitychange', onHidden);
                window.addEventListener('pagehide', onPageHide);
                return () => {
                  document.removeEventListener('visibilitychange', onHidden);
                  window.removeEventListener('pagehide', onPageHide);
                };
              },
            });
      heartbeatRef.current = heartbeat;

      void createPlayerFacade(bridge, {
        container,
        descriptor,
        upNext: album.slice((startIndex === -1 ? 0 : startIndex) + 1),
        onEvent: (event, payload) => {
          heartbeat?.observe(event, payload);
          if (event === 'ended') {
            onEndedRef.current?.();
          }
        },
      }).then((result) => {
        if (cancelled) {
          // The effect was cleaned up while the player was being constructed. Destroy immediately,
          // or the instance leaks with no reference to it.
          if (result.ok) {
            result.value.destroy();
          }
          return;
        }
        if (!result.ok) {
          heartbeat?.dispose();
          setState('unavailable');
          return;
        }
        facade = result.value;
        facadeRef.current = result.value;
        const pending = pendingNextRef.current;
        if (pending !== null) {
          result.value.enqueueNext(pending);
          pendingNextRef.current = null;
        }
        setState('playing');
        // The route can move while the player is being built, and the switch effect below found no
        // facade to talk to when it did. This is that reconciliation, not a duplicate of it.
        if (result.value.switchToEpisode(wantedEpisodeRef.current) === 'OUT_OF_REACH') {
          setGeneration((current) => current + 1);
        }
      });

      return () => {
        cancelled = true;
        heartbeat?.dispose();
        if (heartbeatRef.current === heartbeat) {
          heartbeatRef.current = null;
        }
        facade?.destroy();
        facade = null;
        facadeRef.current = null;
      };
    }, [bridge, generation]);

    useEffect(() => {
      wantedEpisodeRef.current = episodeId;
      heartbeatRef.current?.setEpisode(episodeId);
      const facade = facadeRef.current;
      if (facade === null) {
        return;
      }
      if (facade.switchToEpisode(episodeId) === 'OUT_OF_REACH') {
        setGeneration((current) => current + 1);
      }
    }, [episodeId]);

    return (
      <section
        className="player-surface"
        data-testid="player-surface"
        data-state={state}
        data-episode-id={episodeId}
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          swipeOriginY.current = touch === undefined ? null : touch.clientY;
        }}
        onTouchEnd={(event) => {
          const startY = swipeOriginY.current;
          swipeOriginY.current = null;
          if (startY === null) {
            return;
          }
          const touch = event.changedTouches[0];
          if (touch === undefined) {
            return;
          }
          const direction = verticalSwipe(startY, touch.clientY);
          if (direction === 'up') {
            onSwipeNextRef.current?.();
          }
          if (direction === 'down') {
            onSwipePreviousRef.current?.();
          }
        }}
      >
        <div ref={containerRef} data-testid="player-container" className="player-surface__mount" />
        {state === 'unavailable' ? (
          <p role="alert" data-testid="player-unavailable">
            {translate('player.unavailable')}
          </p>
        ) : null}
      </section>
    );
  },
);
