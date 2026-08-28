import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ok, type PlaybackDescriptor } from '@minidrama/shared';
import { createPlayerFacade } from './player-facade';
import { createProgressHeartbeat } from './progress-heartbeat';
import { createStallWatchdog } from './player-stall';
import { createStartWatchdog } from './player-start';
import { isHorizontalScrub, verticalSwipe } from './episode-swipe';
import { isDoubleTap, type TapPoint } from './episode-double-tap';
import { translate } from '../core/i18n';
import type { PlatformBridge } from '../platform/types';
import type { PlayerFacade } from './player-facade';
import type { ProgressHeartbeat, ProgressHeartbeatReport } from './progress-heartbeat';
import type { StallChrome, StallPacing } from './player-stall';
import type { StartChrome, StartPacing } from './player-start';

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
  /**
   * Double-tap 点赞. A single tap is still VePlayer's (`AC-PL-6`). PlayPage owns the write
   * (idempotent follow). Ignored when omitted.
   */
  readonly onDoubleTap?: () => void;
  /**
   * VePlayer `error`. PlayPage owns the silent re-issue (`PLY-012`). The payload is not
   * classified here: it is undocumented and must not decide locked vs blocked vs transport.
   */
  readonly onPlayerFatal?: () => void;
  /**
   * S7 stall retry (`AC-PL-7`). PlayPage remints the route episode. Ignored when omitted.
   * The overlay stays on this surface so the last frame is not torn down.
   */
  readonly onStallRetry?: () => void;
  /**
   * CN-10 / J12-7 start or switch timeout. PlayPage remints the route episode.
   * Ignored when omitted. The last frame stays; the episode is not skipped.
   */
  readonly onStartTimeout?: () => void;
  /** Test seam. Production uses `Date.now` / `setInterval`. */
  readonly stall?: StallPacing;
  /** Test seam for the start/switch wait. Separate from stall so the clocks do not steal ticks. */
  readonly start?: StartPacing;
}

export interface PlayerSurfaceHandle {
  /**
   * Queue the immediately following entitled descriptor on the live instance. No-ops until the
   * player exists; the create effect applies a pending descriptor before reconciling the route.
   */
  enqueueNext(descriptor: PlaybackDescriptor): void;
  /**
   * Hand a freshly minted descriptor to the live instance for the episode already on screen.
   * No-ops until the player exists. A pending re-issue is applied when construction finishes.
   */
  reissue(descriptor: PlaybackDescriptor): void;
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
    {
      bridge,
      playlist,
      episodeId,
      progress,
      onEnded,
      onSwipeNext,
      onSwipePrevious,
      onDoubleTap,
      onPlayerFatal,
      onStallRetry,
      onStartTimeout,
      stall,
      start,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const facadeRef = useRef<PlayerFacade | null>(null);
    const heartbeatRef = useRef<ProgressHeartbeat | null>(null);
    const stallRef = useRef<ReturnType<typeof createStallWatchdog> | null>(null);
    const startRef = useRef<ReturnType<typeof createStartWatchdog> | null>(null);
    const progressRef = useRef(progress);
    progressRef.current = progress;
    const stallPacingRef = useRef(stall);
    stallPacingRef.current = stall;
    const startPacingRef = useRef(start);
    startPacingRef.current = start;
    const onEndedRef = useRef(onEnded);
    onEndedRef.current = onEnded;
    const onSwipeNextRef = useRef(onSwipeNext);
    onSwipeNextRef.current = onSwipeNext;
    const onSwipePreviousRef = useRef(onSwipePrevious);
    onSwipePreviousRef.current = onSwipePrevious;
    const onDoubleTapRef = useRef(onDoubleTap);
    onDoubleTapRef.current = onDoubleTap;
    const onPlayerFatalRef = useRef(onPlayerFatal);
    onPlayerFatalRef.current = onPlayerFatal;
    const onStallRetryRef = useRef(onStallRetry);
    onStallRetryRef.current = onStallRetry;
    const onStartTimeoutRef = useRef(onStartTimeout);
    onStartTimeoutRef.current = onStartTimeout;
    const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
    const lastTap = useRef<TapPoint | null>(null);
    const playlistRef = useRef(playlist);
    playlistRef.current = playlist;
    const pendingNextRef = useRef<PlaybackDescriptor | null>(null);
    const pendingReissueRef = useRef<PlaybackDescriptor | null>(null);
    /** The episode the route wants, readable from the create effect without becoming a dependency. */
    const wantedEpisodeRef = useRef(episodeId);
    const [state, setState] = useState<SurfaceState>('loading');
    const [generation, setGeneration] = useState(0);
    const [stallChrome, setStallChrome] = useState<StallChrome>('none');
    const [startChrome, setStartChrome] = useState<StartChrome>('none');

    useImperativeHandle(ref, () => ({
      enqueueNext(descriptor: PlaybackDescriptor): void {
        const facade = facadeRef.current;
        if (facade === null) {
          pendingNextRef.current = descriptor;
          return;
        }
        facade.enqueueNext(descriptor);
      },
      reissue(descriptor: PlaybackDescriptor): void {
        const facade = facadeRef.current;
        if (facade === null) {
          pendingReissueRef.current = descriptor;
          return;
        }
        startRef.current?.arm();
        if (!facade.reissue(descriptor)) {
          startRef.current?.reset();
        }
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
              // Session resume, not catalog duration. A pre-seek tick at 0 must not LWW-wipe
              // another device's position (`PRG-001`).
              resumePositionSec: descriptor.resumePositionSec,
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
      const pacing = stallPacingRef.current;
      const stallWatchdog = createStallWatchdog({
        onChrome: (chrome) => {
          if (!cancelled) {
            setStallChrome(chrome);
          }
        },
        ...(pacing?.now === undefined ? {} : { now: pacing.now }),
        ...(pacing?.schedule === undefined ? {} : { schedule: pacing.schedule }),
      });
      stallRef.current = stallWatchdog;
      setStallChrome('none');
      const startPacing = startPacingRef.current;
      const startWatchdog = createStartWatchdog({
        onChrome: (chrome) => {
          if (!cancelled) {
            setStartChrome(chrome);
          }
        },
        ...(startPacing?.now === undefined ? {} : { now: startPacing.now }),
        ...(startPacing?.schedule === undefined ? {} : { schedule: startPacing.schedule }),
      });
      startRef.current = startWatchdog;
      setStartChrome('none');
      startWatchdog.arm();

      void createPlayerFacade(bridge, {
        container,
        descriptor,
        upNext: album.slice((startIndex === -1 ? 0 : startIndex) + 1),
        onEvent: (event, payload) => {
          heartbeat?.observe(event, payload);
          stallWatchdog.observe(event, payload);
          startWatchdog.observe(event, payload);
          if (event === 'ended') {
            onEndedRef.current?.();
          }
          if (event === 'error') {
            // Do not inspect `payload`. VePlayer ERROR is undocumented; classification is the
            // re-issued session (`docs/design/playback-contract.md` §5.2).
            onPlayerFatalRef.current?.();
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
          startWatchdog.reset();
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
        const pendingReissue = pendingReissueRef.current;
        if (pendingReissue !== null) {
          startWatchdog.arm();
          result.value.reissue(pendingReissue);
          pendingReissueRef.current = null;
        }
        setState('playing');
        // The route can move while the player is being built, and the switch effect below found no
        // facade to talk to when it did. This is that reconciliation, not a duplicate of it.
        if (result.value.switchToEpisode(wantedEpisodeRef.current) === 'OUT_OF_REACH') {
          startWatchdog.reset();
          setGeneration((current) => current + 1);
        }
      });

      return () => {
        cancelled = true;
        heartbeat?.dispose();
        if (heartbeatRef.current === heartbeat) {
          heartbeatRef.current = null;
        }
        stallWatchdog.dispose();
        if (stallRef.current === stallWatchdog) {
          stallRef.current = null;
        }
        startWatchdog.dispose();
        if (startRef.current === startWatchdog) {
          startRef.current = null;
        }
        facade?.destroy();
        facade = null;
        facadeRef.current = null;
      };
    }, [bridge, generation]);

    useEffect(() => {
      wantedEpisodeRef.current = episodeId;
      const resume =
        playlistRef.current.find((entry) => entry.episodeId === episodeId)?.resumePositionSec ?? 0;
      heartbeatRef.current?.setEpisode(episodeId, resume);
      const facade = facadeRef.current;
      if (facade === null) {
        return;
      }
      if (facade.currentEpisode().episodeId === episodeId) {
        return;
      }
      startRef.current?.arm();
      if (facade.switchToEpisode(episodeId) === 'OUT_OF_REACH') {
        startRef.current?.reset();
        setGeneration((current) => current + 1);
      }
    }, [episodeId]);

    return (
      <section
        className="player-surface"
        data-testid="player-surface"
        data-state={state}
        data-episode-id={episodeId}
        onDoubleClick={() => {
          lastTap.current = null;
          onDoubleTapRef.current?.();
        }}
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          pointerOrigin.current =
            touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const origin = pointerOrigin.current;
          pointerOrigin.current = null;
          if (origin === null) {
            return;
          }
          const touch = event.changedTouches[0];
          if (touch === undefined) {
            return;
          }
          if (
            Number.isFinite(origin.x) &&
            Number.isFinite(touch.clientX) &&
            isHorizontalScrub(origin, { x: touch.clientX, y: touch.clientY })
          ) {
            // Kept progress plugin. Do not steal the drag as 切集 and do not preventDefault.
            return;
          }
          const direction = verticalSwipe(origin.y, touch.clientY);
          if (direction === 'up') {
            lastTap.current = null;
            onSwipeNextRef.current?.();
            return;
          }
          if (direction === 'down') {
            lastTap.current = null;
            onSwipePreviousRef.current?.();
            return;
          }
          const point: TapPoint = { x: touch.clientX, y: touch.clientY, atMs: Date.now() };
          const previous = lastTap.current;
          lastTap.current = point;
          if (previous !== null && isDoubleTap(previous, point)) {
            lastTap.current = null;
            onDoubleTapRef.current?.();
          }
        }}
      >
        <div ref={containerRef} data-testid="player-container" className="player-surface__mount" />
        {stallChrome === 'none' ? null : (
          <div className="player-stall" data-phase={stallChrome} data-testid="player-stall">
            <span
              aria-hidden="true"
              className="player-stall__indicator"
              data-testid="player-stall-indicator"
            />
            <p className="player-stall__copy" role="status">
              {translate('player.stalled')}
            </p>
            {stallChrome === 'retry' ? (
              <button
                className="player-stall__retry"
                data-testid="player-stall-retry"
                type="button"
                onClick={() => {
                  stallRef.current?.reset();
                  onStallRetryRef.current?.();
                }}
              >
                {translate('state.retry')}
              </button>
            ) : null}
          </div>
        )}
        {startChrome === 'none' ? null : (
          <div className="player-start" data-phase={startChrome} data-testid="player-start">
            <span
              aria-hidden="true"
              className="player-start__indicator"
              data-testid="player-start-indicator"
            />
            <p className="player-start__copy" role="status">
              {translate(startChrome === 'timeout' ? 'player.startTimeout' : 'player.starting')}
            </p>
            {startChrome === 'timeout' ? (
              <button
                className="player-start__retry"
                data-testid="player-start-retry"
                type="button"
                onClick={() => {
                  startRef.current?.reset();
                  onStartTimeoutRef.current?.();
                }}
              >
                {translate('state.retry')}
              </button>
            ) : null}
          </div>
        )}
        {state === 'unavailable' ? (
          <p role="alert" data-testid="player-unavailable">
            {translate('player.unavailable')}
          </p>
        ) : null}
      </section>
    );
  },
);
