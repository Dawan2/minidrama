import { Link, useNavigate, useParams } from 'react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
 * *route* episode (D-16). 连播 and 切集 mint a session for the *next* episode *before* VePlayer
 * is told to move: a 403 opens PNL-02 on top of the episode that is already on screen (`AC-PL-5`)
 * and never constructs a demo album (`docs/verify/cycle-3-report.md` D-16 remainder).
 *
 * The descriptor comes only from `POST /v1/playback/sessions`. There is no client-built playlist:
 * a demo album would play a catalogue id the server had refused. Fail-closed: a session that does
 * not issue a descriptor does not start VePlayer.
 *
 * Watch progress is a heartbeat on that same instance (`PUT /v1/progress/episodes/{episodeId}`),
 * throttled to `GET /v1/config`'s `progressHeartbeatSec`, flushed on pause / hide / unmount, and
 * never a client-computed `completed` or a guessed 0 when the player has not spoken.
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
  const advancingRef = useRef(false);

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

  const playlist = useMemo((): readonly PlaybackDescriptor[] => {
    if (session.resource.status !== 'ready') {
      return [];
    }
    return [session.resource.data];
  }, [session.resource]);

  const catalogEpisode = catalog.resource.status === 'ready' ? catalog.resource.data : null;
  const locked =
    session.resource.status === 'failed' && isPlaybackLock(session.resource.error.failure);
  const next =
    catalogEpisode !== null && episodes.resource.status === 'ready'
      ? nextCatalogEpisode(catalogEpisode, episodes.resource.data.items)
      : undefined;
  const queueKnown =
    catalogEpisode !== null &&
    episodes.resource.status === 'ready' &&
    session.resource.status === 'ready';
  const overlayEpisode =
    locked && catalogEpisode !== null && !unlockDismissed
      ? catalogEpisode
      : advanceUnlock !== null && !unlockDismissed
        ? advanceUnlock
        : null;

  async function attemptAdvance(target: EpisodeItem, placement: AdPlacement): Promise<void> {
    if (target.id === episodeId || advancingRef.current) {
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
      await navigate(playPath(target.id), { replace: true });
    }
  }

  return (
    <main
      className="page page--play"
      data-testid="play-page"
      data-episode-id={episodeId}
      data-state={playState(session.resource.status, locked)}
    >
      <Link className="page__back" to={ROUTES.home}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('player.heading')}</h1>
      <Attempt
        bridge={bridge}
        catalog={catalog.resource}
        locked={locked}
        onRetry={() => {
          session.reload();
          catalog.reload();
        }}
        playlist={playlist}
        progress={{
          report: (id, report) => progressApi.reportEpisodeProgress(id, report),
          intervalSec: config.playback.progressHeartbeatSec,
        }}
        session={session.resource}
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

function playState(
  status: 'loading' | 'ready' | 'failed',
  locked: boolean,
): 'loading' | 'playing' | 'locked' | 'failed' {
  if (status === 'loading') {
    return 'loading';
  }
  if (locked) {
    return 'locked';
  }
  if (status === 'ready') {
    return 'playing';
  }
  return 'failed';
}

function Attempt({
  bridge,
  catalog,
  locked,
  onRetry,
  playlist,
  progress,
  session,
}: {
  readonly bridge: PlatformBridge;
  readonly catalog: Resource<EpisodeItem>;
  readonly locked: boolean;
  readonly onRetry: () => void;
  readonly playlist: readonly PlaybackDescriptor[];
  readonly progress: {
    readonly report: ProgressHeartbeatReport;
    readonly intervalSec: number;
  };
  readonly session: Resource<PlaybackDescriptor>;
}): React.JSX.Element {
  if (session.status === 'loading') {
    return <Skeleton rows={3} />;
  }

  if (session.status === 'ready') {
    return (
      <PlayerSurface
        bridge={bridge}
        episodeId={session.data.episodeId}
        playlist={playlist}
        progress={progress}
      />
    );
  }

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
