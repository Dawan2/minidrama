import { Link, useNavigate, useParams } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { ok } from '@minidrama/shared';
import type { EpisodeItem, Page, PlaybackDescriptor } from '@minidrama/shared';

import { EpisodePicker } from '../picker/EpisodePicker';
import { PlayerSurface } from '../player/PlayerSurface';
import { RetryableError, Skeleton, TerminalError } from '../components/states';
import { gateAdvance } from './advance-gate';
import { ROUTES, playPath } from './routes';
import { translate } from '../core/i18n';
import { UnlockPanel } from '../unlock/UnlockPanel';
import { isPlaybackLock } from '../data/playback-api';
import { useCatalogApi } from '../data/catalog-api-context';
import { useClientConfig } from '../config/client-config-context';
import { usePlaybackApi } from '../data/playback-api-context';
import { useProgressApi } from '../data/progress-api-context';
import { useResource } from '../data/use-resource';
import type { ProgressHeartbeatReport } from '../player/progress-heartbeat';
import type { PlayerSurfaceHandle } from '../player/PlayerSurface';
import type { PlatformBridge } from '../platform/types';
import type { PurchaseCapabilities } from '../catalog/access-presentation';
import type { Resource } from '../data/use-resource';
import type { TranslationKey } from '../core/i18n';
import type { UnlockPacing } from '../unlock/coin-unlock';
import type { AdPlacement } from '../data/unlock-api';

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

export interface PlayPageProps {
  readonly bridge: PlatformBridge;
  /** Passed through to PNL-02. Present so a test can shorten the payment poll budget. */
  readonly unlockPacing?: UnlockPacing;
}

export function PlayPage({ bridge, unlockPacing }: PlayPageProps): React.JSX.Element {
  const { episodeId = '' } = useParams();
  const navigate = useNavigate();
  const playbackApi = usePlaybackApi();
  const catalogApi = useCatalogApi();
  const progressApi = useProgressApi();
  const config = useClientConfig();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unlockDismissed, setUnlockDismissed] = useState(false);
  const [advanceUnlock, setAdvanceUnlock] = useState<EpisodeItem | null>(null);
  const [advancePlacement, setAdvancePlacement] = useState<AdPlacement | null>(null);
  const [album, setAlbum] = useState<readonly PlaybackDescriptor[]>([]);
  const advancingRef = useRef(false);
  const surfaceRef = useRef<PlayerSurfaceHandle>(null);
  const episodeIdRef = useRef(episodeId);
  episodeIdRef.current = episodeId;

  useEffect(() => {
    setUnlockDismissed(false);
    setAdvanceUnlock(null);
    setAdvancePlacement(null);
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
  const locked =
    session.resource.status === 'failed' && isPlaybackLock(session.resource.error.failure);
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
    locked && catalogEpisode !== null && !unlockDismissed
      ? catalogEpisode
      : advanceUnlock !== null && !unlockDismissed
        ? advanceUnlock
        : null;

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

  function onEnded(): void {
    const target = nextRef.current;
    if (target === undefined) {
      return;
    }
    void attemptAdvance(target, 'AFTER_EPISODE');
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
        onEnded={onEnded}
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
        {...(next === undefined || pickerOpen || overlayEpisode !== null
          ? {}
          : {
              onSwipeNext: () => {
                void attemptAdvance(next, 'AFTER_EPISODE');
              },
            })}
        {...(previous === undefined || pickerOpen || overlayEpisode !== null
          ? {}
          : {
              onSwipePrevious: () => {
                void attemptAdvance(previous, 'MANUAL_SKIP');
              },
            })}
      />
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
          }}
          onEntitlementChanged={session.reload}
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
  onEnded,
  onRetry,
  onSwipeNext,
  onSwipePrevious,
  playlist,
  progress,
  routeEpisodeId,
  session,
  surfaceRef,
}: {
  readonly bridge: PlatformBridge;
  readonly catalog: Resource<EpisodeItem>;
  readonly locked: boolean;
  readonly onEnded: () => void;
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
    return <div data-testid="player-locked" />;
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
        {...(onSwipeNext === undefined ? {} : { onSwipeNext })}
        {...(onSwipePrevious === undefined ? {} : { onSwipePrevious })}
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
