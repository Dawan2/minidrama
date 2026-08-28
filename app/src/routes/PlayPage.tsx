import { Link, useNavigate, useParams } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { ok } from '@minidrama/shared';
import type { EpisodeItem, Page, PlaybackDescriptor } from '@minidrama/shared';

import { EpisodePicker } from '../picker/EpisodePicker';
import {
  EMPTY_LOCKED_POSTER,
  LockedChrome,
  posterFromDrama,
  type LockedPoster,
} from '../player/locked-chrome';
import { PlayerSurface } from '../player/PlayerSurface';
import { RetryableError, Skeleton, TerminalError } from '../components/states';
import { gateAdvance } from './advance-gate';
import { classifyReissue, exhaustedReissueError, planFatalReissue } from '../player/player-fatal';
import { ROUTES, playPath } from './routes';
import { translate } from '../core/i18n';
import { UnlockPanel } from '../unlock/UnlockPanel';
import { isPlaybackLock } from '../data/playback-api';
import { useCatalogApi } from '../data/catalog-api-context';
import { useClientConfig } from '../config/client-config-context';
import { useFavoritesApi } from '../data/favorites-api-context';
import { usePlaybackApi } from '../data/playback-api-context';
import { useProgressApi } from '../data/progress-api-context';
import { useResource } from '../data/use-resource';
import type { ProgressHeartbeatReport } from '../player/progress-heartbeat';
import type { PlayerSurfaceHandle } from '../player/PlayerSurface';
import type { PlatformBridge } from '../platform/types';
import type { PurchaseCapabilities } from '../catalog/access-presentation';
import type { Resource } from '../data/use-resource';
import type { SurfaceError } from '../data/failure';
import type { TranslationKey } from '../core/i18n';
import type { UnlockPacing } from '../unlock/coin-unlock';
import type { AdPlacement } from '../data/unlock-api';
import type { StallPacing } from '../player/player-stall';
import type { StartPacing } from '../player/player-start';

/**
 * SCR-05, the player screen.
 *
 * The screen owns the *queue*; the player owns playback. A deep link mints a session for the
 * *route* episode (D-16). 连播, 切集, swipe, and `ended` mint a session for the *next* episode
 * *before* VePlayer is told to move: a 403 opens PNL-02 on top of the episode that is already on
 * screen (`AC-PL-5`) and never constructs a demo album (`docs/verify/cycle-3-report.md` D-16).
 *
 * An entitled immediate next is `enqueueNext` + `playNext` on the retained instance (`AC-PL-3`).
 * The route updates so the back destination stays the same (`replace`). A jump the instance
 * cannot reach still rebuilds — `playNext` only goes forwards.
 *
 * The descriptor comes only from `POST /v1/playback/sessions`. There is no client-built playlist:
 * a demo album would play a catalogue id the server had refused. Fail-closed: a session that does
 * not issue a descriptor does not start VePlayer. `resumePositionSec` becomes VePlayer `startTime`;
 * omitted or `0` starts at the beginning. Catalog `durationSec` is never a seek target. A 403 is
 * not a descriptor, so it never seeks.
 *
 * Watch progress is a heartbeat on that same instance (`PUT /v1/progress/episodes/{episodeId}`),
 * throttled to `GET /v1/config`'s `progressHeartbeatSec`, flushed on pause / hide / unmount, and
 * never a client-computed `completed` or a guessed 0 when the player has not spoken. A pre-seek
 * tick at 0 after a non-zero session resume is not a watch: reporting it would last-write-wins
 * over the other device's position (`PRG-001`).
 *
 * PNL-05 (quality / speed) stays deleted: VePlayer plugins own those (`AC-PL-6`).
 * Double-tap 点赞 follows the current drama (`PUT /v1/dramas/{id}/favorite`). A single tap
 * is still VePlayer's pause. 倍速 stays plugin-owned (X-26).
 *
 * PLAYER_FATAL (`PLY-012`) re-mints the route episode once and applies the fresh descriptor
 * on the retained instance. A failed mint overlays retry copy on the last frame — it does
 * not unmount VePlayer into a blank surface. The ERROR payload is not classified.
 *
 * S7 stall (`AC-PL-7`) is inferred from a `timeupdate` gap, not from a buffering event
 * VePlayer does not document. Indicator at 1.5 s, retry at 8 s, last frame stays. Retry
 * remints the route episode. Definition is never changed (`AC-PL-6`).
 *
 * Start / switch first-frame wait (`CN-10`, J12-2 / J12-7): construction or an
 * entitled switch with no `PLAY` yet shows an indicator at 300 ms and a retry
 * at 15 s. The last frame stays. The episode is never skipped. Retry remints
 * the route episode. Definition is never changed.
 *
 * S6 locked (`PLY-011` remainder): cover + lock mark under PNL-02. The empty
 * `player-locked` stub is not that chrome. VePlayer stays unmounted. Recharge stays
 * off. 倍速 / scrub stay plugin-owned (X-26).
 */

const EMPTY_EPISODES: Page<EpisodeItem> = {
  items: [],
  pageInfo: { nextCursor: null, hasMore: false },
};

const PLAYER_TERMINAL_KEYS = {
  NOT_FOUND: 'player.notFound',
  OFFLINE: 'player.offline',
  REJECTED: 'player.rejected',
} as const satisfies Record<'NOT_FOUND' | 'OFFLINE' | 'REJECTED', TranslationKey>;

type FatalOverlay =
  | { readonly kind: 'RETRYABLE'; readonly error: SurfaceError }
  | { readonly kind: 'TERMINAL'; readonly error: Extract<SurfaceError, { kind: 'TERMINAL' }> }
  | { readonly kind: 'BLOCKED' };

export interface PlayPageProps {
  readonly bridge: PlatformBridge;
  /** Passed through to PNL-02. Present so a test can shorten the payment poll budget. */
  readonly unlockPacing?: UnlockPacing;
  /** Passed through to the stall watchdog. Present so a test can drive S7 without a wall clock. */
  readonly stallPacing?: StallPacing;
  /** Passed through to the start/switch watchdog. Present so a test can drive CN-10 without a wall clock. */
  readonly startPacing?: StartPacing;
}

export function PlayPage({
  bridge,
  unlockPacing,
  stallPacing,
  startPacing,
}: PlayPageProps): React.JSX.Element {
  const { episodeId = '' } = useParams();
  const navigate = useNavigate();
  const playbackApi = usePlaybackApi();
  const catalogApi = useCatalogApi();
  const progressApi = useProgressApi();
  const favoritesApi = useFavoritesApi();
  const config = useClientConfig();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unlockDismissed, setUnlockDismissed] = useState(false);
  const [advanceUnlock, setAdvanceUnlock] = useState<EpisodeItem | null>(null);
  const [advancePlacement, setAdvancePlacement] = useState<AdPlacement | null>(null);
  const [album, setAlbum] = useState<readonly PlaybackDescriptor[]>([]);
  const [likedFlash, setLikedFlash] = useState(false);
  const [fatalLock, setFatalLock] = useState(false);
  const [fatalOverlay, setFatalOverlay] = useState<FatalOverlay | null>(null);
  const advancingRef = useRef(false);
  const fatalBusyRef = useRef(false);
  const fatalAttemptsRef = useRef(0);
  const surfaceRef = useRef<PlayerSurfaceHandle>(null);
  const episodeIdRef = useRef(episodeId);
  episodeIdRef.current = episodeId;

  useEffect(() => {
    setUnlockDismissed(false);
    setAdvanceUnlock(null);
    setAdvancePlacement(null);
    setLikedFlash(false);
    setFatalLock(false);
    setFatalOverlay(null);
    fatalAttemptsRef.current = 0;
    fatalBusyRef.current = false;
  }, [episodeId]);

  const session = useResource(
    () => playbackApi.createSession(episodeId),
    `play-session:${episodeId}`,
  );
  const catalog = useResource(
    () => catalogApi.fetchEpisode(episodeId),
    `play-episode:${episodeId}`,
  );

  const dramaId = catalog.resource.status === 'ready' ? catalog.resource.data.dramaId : '';
  const locked =
    session.resource.status === 'failed' && isPlaybackLock(session.resource.error.failure);
  const posterKey =
    locked && dramaId !== '' ? `play-poster:${dramaId}` : `play-poster:idle:${episodeId}`;
  const poster = useResource(() => {
    if (!locked || dramaId === '') {
      return Promise.resolve(ok(EMPTY_LOCKED_POSTER));
    }
    return catalogApi.fetchDrama(dramaId).then((result) => ok(posterFromDrama(result)));
  }, posterKey);
  const episodes = useResource(
    () =>
      dramaId === ''
        ? Promise.resolve(ok(EMPTY_EPISODES))
        : catalogApi.fetchEpisodes({ dramaId, limit: 100 }),
    dramaId === '' ? `play-episodes:pending:${episodeId}` : `play-episodes:${dramaId}`,
  );

  const capabilities: PurchaseCapabilities = {
    coin: bridge.canIUse('pay'),
    vip: bridge.canIUse('createSubscription'),
  };

  const playlist = playlistForRoute(album, episodeId, session.resource);

  const catalogEpisode = catalog.resource.status === 'ready' ? catalog.resource.data : null;
  const next =
    catalogEpisode !== null && episodes.resource.status === 'ready'
      ? nextCatalogEpisode(catalogEpisode, episodes.resource.data.items)
      : undefined;
  const previous =
    catalogEpisode !== null && episodes.resource.status === 'ready'
      ? previousCatalogEpisode(catalogEpisode, episodes.resource.data.items)
      : undefined;
  const nextRef = useRef(next);
  nextRef.current = next;
  const queueKnown =
    catalogEpisode !== null &&
    episodes.resource.status === 'ready' &&
    (session.resource.status === 'ready' || playlist.length > 0);
  const overlayEpisode =
    (locked || fatalLock) && catalogEpisode !== null && !unlockDismissed
      ? catalogEpisode
      : advanceUnlock !== null && !unlockDismissed
        ? advanceUnlock
        : null;
  const gesturesBlocked = pickerOpen || overlayEpisode !== null || fatalOverlay !== null;

  async function attemptAdvance(target: EpisodeItem, placement: AdPlacement): Promise<void> {
    if (target.id === episodeIdRef.current || advancingRef.current) {
      return;
    }
    advancingRef.current = true;
    setAdvanceUnlock(null);
    setAdvancePlacement(null);
    const gate = await gateAdvance(playbackApi, target.id);
    advancingRef.current = false;
    if (gate.kind === 'LOCKED') {
      setUnlockDismissed(false);
      setAdvanceUnlock(target);
      setAdvancePlacement(placement);
      return;
    }
    if (gate.kind === 'ENTITLED') {
      const forward = nextRef.current?.id === target.id;
      if (forward) {
        setAlbum((current) => {
          if (current.some((item) => item.episodeId === gate.descriptor.episodeId)) {
            return current;
          }
          const head =
            current.length > 0
              ? current
              : session.resource.status === 'ready'
                ? [session.resource.data]
                : [];
          return [...head, gate.descriptor];
        });
        surfaceRef.current?.enqueueNext(gate.descriptor);
      }
      await navigate(playPath(target.id), { replace: true });
    }
  }

  async function requestReissue(): Promise<void> {
    if (fatalBusyRef.current) {
      return;
    }
    if (planFatalReissue(fatalAttemptsRef.current) === 'EXHAUSTED') {
      setFatalOverlay({ kind: 'RETRYABLE', error: exhaustedReissueError() });
      return;
    }
    fatalBusyRef.current = true;
    const asked = episodeIdRef.current;
    const result = await playbackApi.createSession(asked);
    fatalAttemptsRef.current += 1;
    fatalBusyRef.current = false;
    if (asked !== episodeIdRef.current) {
      return;
    }
    const classified = classifyReissue(result);
    if (classified.kind === 'CONTINUE') {
      setFatalOverlay(null);
      setAlbum((current) =>
        replaceAlbumDescriptor(
          current,
          classified.descriptor,
          session.resource.status === 'ready' ? session.resource.data : undefined,
        ),
      );
      surfaceRef.current?.reissue(classified.descriptor);
      return;
    }
    if (classified.kind === 'LOCKED') {
      setFatalOverlay(null);
      setUnlockDismissed(false);
      setFatalLock(true);
      return;
    }
    if (classified.kind === 'BLOCKED') {
      setFatalOverlay({ kind: 'BLOCKED' });
      return;
    }
    if (classified.kind === 'RETRYABLE') {
      setFatalOverlay({ kind: 'RETRYABLE', error: classified.error });
      return;
    }
    setFatalOverlay({ kind: 'TERMINAL', error: classified.error });
  }

  function onEnded(): void {
    const target = nextRef.current;
    if (target === undefined) {
      return;
    }
    void attemptAdvance(target, 'AFTER_EPISODE');
  }

  async function onDoubleTap(): Promise<void> {
    if (dramaId === '') {
      return;
    }
    const result = await favoritesApi.addFavorite(dramaId);
    if (result.ok) {
      setLikedFlash(true);
    }
  }

  return (
    <main
      className="page page--play"
      data-testid="play-page"
      data-episode-id={episodeId}
      data-state={playState(session.resource.status, locked, playlist.length > 0)}
    >
      <Link className="page__back" to={ROUTES.home}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('player.heading')}</h1>
      <Attempt
        bridge={bridge}
        catalog={catalog.resource}
        locked={locked}
        poster={poster.resource}
        onEnded={onEnded}
        onPlayerFatal={() => {
          void requestReissue();
        }}
        onStallRetry={() => {
          fatalAttemptsRef.current = 0;
          setFatalOverlay(null);
          void requestReissue();
        }}
        onStartTimeout={() => {
          fatalAttemptsRef.current = 0;
          setFatalOverlay(null);
          void requestReissue();
        }}
        onRetry={() => {
          session.reload();
          catalog.reload();
        }}
        playlist={playlist}
        progress={{
          report: (id, report) => progressApi.reportEpisodeProgress(id, report),
          intervalSec: config.playback.progressHeartbeatSec,
        }}
        routeEpisodeId={episodeId}
        session={session.resource}
        surfaceRef={surfaceRef}
        {...(stallPacing === undefined ? {} : { stall: stallPacing })}
        {...(startPacing === undefined ? {} : { start: startPacing })}
        {...(next === undefined || gesturesBlocked
          ? {}
          : {
              onSwipeNext: () => {
                void attemptAdvance(next, 'AFTER_EPISODE');
              },
            })}
        {...(previous === undefined || gesturesBlocked
          ? {}
          : {
              onSwipePrevious: () => {
                void attemptAdvance(previous, 'MANUAL_SKIP');
              },
            })}
        {...(dramaId === '' || gesturesBlocked ? {} : { onDoubleTap })}
      />
      {likedFlash ? (
        <p className="player-liked" data-testid="player-liked" role="status">
          {translate('player.liked')}
        </p>
      ) : null}
      {fatalOverlay === null ? null : (
        <div className="player-fatal" data-testid="player-fatal">
          {fatalOverlay.kind === 'RETRYABLE' ? (
            <RetryableError
              error={fatalOverlay.error}
              onRetry={() => {
                fatalAttemptsRef.current = 0;
                setFatalOverlay(null);
                void requestReissue();
              }}
            />
          ) : (
            <TerminalError
              reason={fatalOverlay.kind === 'BLOCKED' ? 'OFFLINE' : fatalOverlay.error.reason}
              traceId={fatalOverlay.kind === 'BLOCKED' ? null : fatalOverlay.error.failure.traceId}
              messageKey={
                fatalOverlay.kind === 'BLOCKED'
                  ? 'player.blocked'
                  : PLAYER_TERMINAL_KEYS[fatalOverlay.error.reason]
              }
            />
          )}
        </div>
      )}
      {catalogEpisode === null ? null : (
        <p className="player-meta" data-testid="player-episode-label">
          {translate('drama.episodeLabel', undefined, { n: catalogEpisode.globalEpisodeNumber })}
        </p>
      )}
      {queueKnown ? (
        next === undefined ? (
          <p className="player-meta" data-testid="player-queue-end">
            {translate('player.lastEpisode')}
          </p>
        ) : (
          <button
            className="player-next"
            data-testid="player-next"
            type="button"
            onClick={() => {
              void attemptAdvance(next, 'AFTER_EPISODE');
            }}
          >
            {translate('player.nextEpisode')}
          </button>
        )
      ) : null}
      <button
        className="player-picker"
        data-testid="episode-picker-open"
        type="button"
        onClick={() => {
          setPickerOpen(true);
        }}
      >
        {translate('picker.open')}
      </button>
      {pickerOpen ? (
        <EpisodePicker
          capabilities={capabilities}
          episodeId={episodeId}
          onClose={() => {
            setPickerOpen(false);
          }}
          onLockedAttempt={(episode) => {
            setPickerOpen(false);
            void attemptAdvance(episode, 'MANUAL_SKIP');
          }}
        />
      ) : null}
      {overlayEpisode === null ? null : (
        <UnlockPanel
          bridge={bridge}
          capabilities={capabilities}
          episode={overlayEpisode}
          onClose={() => {
            setUnlockDismissed(true);
            setAdvanceUnlock(null);
            setAdvancePlacement(null);
            setFatalLock(false);
          }}
          onEntitlementChanged={() => {
            setFatalLock(false);
            setAlbum([]);
            session.reload();
          }}
          {...(unlockPacing === undefined ? {} : { pacing: unlockPacing })}
          {...(advanceUnlock !== null && advancePlacement !== null
            ? { adPlacement: advancePlacement }
            : {})}
        />
      )}
    </main>
  );
}

/**
 * Keep the retained instance mounted across an entitled 连播: the next descriptor is already in
 * `album` before the route session reloads. A jump the queue does not contain unmounts instead of
 * handing VePlayer a neighbour it was never entitled for.
 */
function playlistForRoute(
  album: readonly PlaybackDescriptor[],
  episodeId: string,
  session: Resource<PlaybackDescriptor>,
): readonly PlaybackDescriptor[] {
  if (album.some((item) => item.episodeId === episodeId)) {
    return album;
  }
  if (session.status === 'ready' && session.data.episodeId === episodeId) {
    return [session.data];
  }
  return [];
}

function replaceAlbumDescriptor(
  album: readonly PlaybackDescriptor[],
  next: PlaybackDescriptor,
  fallback: PlaybackDescriptor | undefined,
): readonly PlaybackDescriptor[] {
  const base = album.length > 0 ? album : fallback === undefined ? [next] : [fallback];
  if (base.some((item) => item.episodeId === next.episodeId)) {
    return base.map((item) => (item.episodeId === next.episodeId ? next : item));
  }
  return [...base, next];
}

/**
 * The next episode in viewing order, from the catalogue, not from a client-built album.
 *
 * Locked or not: 连播 is an attempt, and `gateAdvance` is what refuses it. Skipping a locked
 * neighbour here would make autoplay look open while the gate was never asked.
 */
export function nextCatalogEpisode(
  current: EpisodeItem,
  items: readonly EpisodeItem[],
): EpisodeItem | undefined {
  return items
    .filter((item) => item.globalEpisodeNumber > current.globalEpisodeNumber)
    .slice()
    .sort((left, right) => left.globalEpisodeNumber - right.globalEpisodeNumber)[0];
}

/** Symmetric with `nextCatalogEpisode`. Swipe-down 切集 uses this; `playNext` cannot. */
export function previousCatalogEpisode(
  current: EpisodeItem,
  items: readonly EpisodeItem[],
): EpisodeItem | undefined {
  return items
    .filter((item) => item.globalEpisodeNumber < current.globalEpisodeNumber)
    .slice()
    .sort((left, right) => right.globalEpisodeNumber - left.globalEpisodeNumber)[0];
}

function playState(
  status: 'loading' | 'ready' | 'failed',
  locked: boolean,
  hasPlaylist: boolean,
): 'loading' | 'playing' | 'locked' | 'failed' {
  if (locked) {
    return 'locked';
  }
  if (hasPlaylist) {
    return 'playing';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'loading';
}

function Attempt({
  bridge,
  catalog,
  locked,
  onDoubleTap,
  onEnded,
  onPlayerFatal,
  onStallRetry,
  onStartTimeout,
  onRetry,
  onSwipeNext,
  onSwipePrevious,
  playlist,
  poster,
  progress,
  routeEpisodeId,
  session,
  stall,
  start,
  surfaceRef,
}: {
  readonly bridge: PlatformBridge;
  readonly catalog: Resource<EpisodeItem>;
  readonly locked: boolean;
  readonly poster: Resource<LockedPoster>;
  readonly onDoubleTap?: () => void;
  readonly onEnded: () => void;
  readonly onPlayerFatal?: () => void;
  readonly onStallRetry?: () => void;
  readonly onStartTimeout?: () => void;
  readonly onRetry: () => void;
  readonly onSwipeNext?: () => void;
  readonly onSwipePrevious?: () => void;
  readonly playlist: readonly PlaybackDescriptor[];
  readonly progress: {
    readonly report: ProgressHeartbeatReport;
    readonly intervalSec: number;
  };
  readonly routeEpisodeId: string;
  readonly session: Resource<PlaybackDescriptor>;
  readonly stall?: StallPacing;
  readonly start?: StartPacing;
  readonly surfaceRef: React.Ref<PlayerSurfaceHandle>;
}): React.JSX.Element {
  if (locked) {
    if (catalog.status === 'loading') {
      return <Skeleton rows={3} />;
    }
    if (catalog.status === 'failed') {
      return catalog.error.kind === 'RETRYABLE' ? (
        <RetryableError error={catalog.error} onRetry={onRetry} />
      ) : (
        <TerminalError
          reason={catalog.error.reason}
          traceId={catalog.error.failure.traceId}
          messageKey={PLAYER_TERMINAL_KEYS[catalog.error.reason]}
        />
      );
    }
    const coverUrl = poster.status === 'ready' ? poster.data.coverUrl : null;
    const title = poster.status === 'ready' ? poster.data.title : '';
    return <LockedChrome coverUrl={coverUrl} title={title} />;
  }

  if (playlist.length > 0) {
    return (
      <PlayerSurface
        ref={surfaceRef}
        bridge={bridge}
        episodeId={routeEpisodeId}
        onEnded={onEnded}
        playlist={playlist}
        progress={progress}
        {...(onPlayerFatal === undefined ? {} : { onPlayerFatal })}
        {...(onStallRetry === undefined ? {} : { onStallRetry })}
        {...(onStartTimeout === undefined ? {} : { onStartTimeout })}
        {...(stall === undefined ? {} : { stall })}
        {...(start === undefined ? {} : { start })}
        {...(onSwipeNext === undefined ? {} : { onSwipeNext })}
        {...(onSwipePrevious === undefined ? {} : { onSwipePrevious })}
        {...(onDoubleTap === undefined ? {} : { onDoubleTap })}
      />
    );
  }

  if (session.status === 'loading') {
    return <Skeleton rows={3} />;
  }

  if (session.status === 'ready') {
    // A ready session for a *different* episode is the previous route's leftover. Do not
    // hand it to VePlayer — that would keep playing the neighbour we just left.
    return <Skeleton rows={3} />;
  }

  if (session.error.kind === 'RETRYABLE') {
    return <RetryableError error={session.error} onRetry={onRetry} />;
  }

  return (
    <TerminalError
      reason={session.error.reason}
      traceId={session.error.failure.traceId}
      messageKey={PLAYER_TERMINAL_KEYS[session.error.reason]}
    />
  );
}
