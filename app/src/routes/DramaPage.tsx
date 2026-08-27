import { Link, useParams } from 'react-router';
import { useCallback, useState } from 'react';
import type { DramaDetail, DramaLastWatched, EpisodeItem } from '@minidrama/shared';

import { CoverImage } from '../components/CoverImage';
import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { EpisodeRow } from '../catalog/EpisodeRow';
import { FreeBadge } from '../catalog/FeedCardView';
import { dramaPrimaryCta } from '../catalog/drama-continue-cta';
import { ROUTES, playPath } from './routes';
import { presentEpisodeAccess } from '../catalog/access-presentation';
import { translate } from '../core/i18n';
import { UnlockPanel } from '../unlock/UnlockPanel';
import { useCatalogApi } from '../data/catalog-api-context';
import { useProgressApi } from '../data/progress-api-context';
import { usePagedResource } from '../data/use-paged-resource';
import { useResource } from '../data/use-resource';
import type { PagedResourceHandle } from '../data/use-paged-resource';
import type { PlatformBridge } from '../platform/types';
import type { PurchaseCapabilities } from '../catalog/access-presentation';
import type { UnlockPacing } from '../unlock/coin-unlock';

/**
 * SCR-04, the drama detail screen: the header, and the flattened episode list beneath it.
 *
 * Three reads, independent states. The detail and the episode list are separate requests and
 * either can fail on its own, so a failed episode list leaves the header, the cover and the
 * synopsis exactly where they are and puts a retry under the list — the sectioned loading of
 * `docs/02-screen-inventory.md` SCR-06, applied here because the alternative is throwing away a
 * screen's worth of successfully loaded content to report that one of its two halves is late.
 * Progress is a third, additive read: Continue watching comes from `lastWatched` on
 * `GET /v1/progress/dramas/{dramaId}`, and a missing view leaves Watch now in place. It does not
 * own a retry of its own, because inventing a resume is worse than starting at the first openable.
 *
 * The detail read is the one that can end the screen: `404` and `410` are terminal states with no
 * retry (`docs/02-information-architecture.md` §8.1, `docs/02-user-journeys.md` J13), and they say
 * different things — "this link is wrong" versus "this drama was withdrawn".
 */

/** Stable by construction, for the same reason as the feed's card identity. */
function identifyEpisode(episode: EpisodeItem): string {
  return episode.id;
}

export interface DramaPageProps {
  readonly bridge: PlatformBridge;
  /** Passed through to PNL-02. Present so a test can shorten the payment poll budget. */
  readonly unlockPacing?: UnlockPacing;
}

export function DramaPage({ bridge, unlockPacing }: DramaPageProps): React.JSX.Element {
  const { dramaId = '' } = useParams();
  const api = useCatalogApi();
  const progressApi = useProgressApi();

  const detail = useResource(() => api.fetchDrama(dramaId), `drama:${dramaId}`);
  const progress = useResource(
    () => progressApi.fetchDramaProgress(dramaId),
    `drama-progress:${dramaId}`,
  );

  const episodes = usePagedResource(
    (cursor: string | undefined) =>
      api.fetchEpisodes({ dramaId, ...(cursor === undefined ? {} : { cursor }) }),
    identifyEpisode,
    `episodes:${dramaId}`,
  );

  /**
   * Probed per render rather than cached. `canIUse` is cheap, and a capability report captured once
   * at boot goes stale the moment the bridge finishes initialising — which is exactly when a detail
   * screen opened from a deep link renders.
   */
  const capabilities: PurchaseCapabilities = {
    coin: bridge.canIUse('pay'),
    vip: bridge.canIUse('createSubscription'),
  };

  /**
   * PNL-02's target: the episode as it was when the row offered the purchase.
   *
   * Held as the object rather than as an id looked up in the live list, so that the reload after a
   * successful unlock cannot pull the subject out from under the open panel. The row behind it
   * updates, which is the point; the panel keeps showing what became of the purchase, which is the
   * other point.
   */
  const [unlockTarget, setUnlockTarget] = useState<EpisodeItem | null>(null);

  const closeUnlockPanel = useCallback(() => {
    setUnlockTarget(null);
  }, []);

  if (detail.resource.status === 'failed') {
    const { error } = detail.resource;
    return (
      <main className="page page--drama" data-testid="drama-page" data-state="failed">
        {error.kind === 'RETRYABLE' ? (
          <RetryableError error={error} onRetry={detail.reload} />
        ) : (
          <TerminalError reason={error.reason} traceId={error.failure.traceId} />
        )}
      </main>
    );
  }

  return (
    <main className="page page--drama" data-testid="drama-page" data-state={detail.resource.status}>
      <Link className="page__back" to={ROUTES.home}>
        {translate('drama.back')}
      </Link>
      <DramaHeader
        capabilities={capabilities}
        drama={detail.resource.status === 'ready' ? detail.resource.data : null}
        episodes={episodes.items}
        lastWatched={
          progress.resource.status === 'ready' ? progress.resource.data.lastWatched : undefined
        }
      />
      <section className="episodes" data-testid="episodes-section">
        <h2 className="page__subheading">{translate('drama.episodes')}</h2>
        {renderEpisodes(episodes, capabilities, setUnlockTarget)}
      </section>
      {unlockTarget === null ? null : (
        <UnlockPanel
          bridge={bridge}
          capabilities={capabilities}
          episode={unlockTarget}
          onClose={closeUnlockPanel}
          /*
            `reload` off the paged handle is stable across renders, so it is passed straight
            through. The list is refetched rather than patched: `viewerAccess` is the server's
            answer and a locally edited one is a client-side entitlement decision by another name.
          */
          onEntitlementChanged={episodes.reload}
          {...(unlockPacing === undefined ? {} : { pacing: unlockPacing })}
        />
      )}
    </main>
  );
}

function DramaHeader({
  drama,
  episodes,
  capabilities,
  lastWatched,
}: {
  /** `null` while the detail read is in flight. A failed read never reaches here. */
  readonly drama: DramaDetail | null;
  readonly episodes: readonly EpisodeItem[];
  readonly capabilities: PurchaseCapabilities;
  /**
   * From the progress batch read. `undefined` is "we do not have a view yet", which is not the
   * same as `null` ("we looked, this viewer has never watched this drama").
   */
  readonly lastWatched: DramaLastWatched | null | undefined;
}): React.JSX.Element {
  if (drama === null) {
    return <Skeleton rows={2} />;
  }

  const openable = episodes.find(
    (episode) => presentEpisodeAccess(episode.viewerAccess, capabilities).navigable,
  );
  const cta = dramaPrimaryCta({
    lastWatched,
    openableEpisodeId: openable?.id,
  });

  return (
    <header className="drama-header" data-testid="drama-header" data-drama-id={drama.id}>
      <CoverImage className="drama-header__cover" src={drama.coverUrl} alt={drama.title} />
      <h1 className="page__heading">{drama.title}</h1>
      <p className="drama-header__meta">
        <span data-testid="drama-category">{drama.category}</span>
        <span>{translate('feed.episodeCount', undefined, { n: drama.totalEpisodes })}</span>
        <span>{translate(drama.isCompleted ? 'feed.completed' : 'feed.ongoing')}</span>
      </p>
      <FreeBadge freeEpisodes={drama.freeEpisodes} totalEpisodes={drama.totalEpisodes} />
      <p className="drama-header__description">{drama.description}</p>
      {drama.tags.length === 0 ? null : (
        <ul className="drama-header__tags">
          {drama.tags.map((tag) => (
            <li className="badge" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      {/*
        Continue watching is lastWatched from the progress batch, not the catalogue viewer
        snapshot (still always null) and not a guessed range of the list. Watch now still points
        at the first episode the viewer may actually open, not at episode 1.

        When nothing in the loaded page is playable and there is no lastWatched pointer, the button
        is absent rather than disabled: the list below already explains why, per episode.
      */}
      {cta === null ? null : (
        <Link
          className="drama-header__cta"
          data-testid={cta.kind === 'continue' ? 'continue-watching' : 'watch-now'}
          to={playPath(cta.episodeId)}
        >
          {cta.kind === 'continue'
            ? translate('drama.continueWatching', undefined, { n: cta.episodeNumber })
            : translate('drama.watchNow')}
        </Link>
      )}
    </header>
  );
}

function renderEpisodes(
  episodes: PagedResourceHandle<EpisodeItem>,
  capabilities: PurchaseCapabilities,
  onUnlockRequested: (episode: EpisodeItem) => void,
): React.JSX.Element {
  if (episodes.status === 'loading') {
    return <Skeleton rows={6} />;
  }

  if (episodes.status === 'failed' && episodes.error !== null) {
    return episodes.error.kind === 'RETRYABLE' ? (
      <RetryableError error={episodes.error} onRetry={episodes.reload} />
    ) : (
      <TerminalError reason={episodes.error.reason} traceId={episodes.error.failure.traceId} />
    );
  }

  if (episodes.items.length === 0) {
    return (
      <EmptyState
        messageKey="drama.episodesEmpty"
        action={{ kind: 'link', to: ROUTES.home, labelKey: 'fallback.backHome' }}
      />
    );
  }

  return (
    <>
      <ul className="episodes__list" data-testid="episode-list">
        {episodes.items.map((episode) => (
          <EpisodeRow
            capabilities={capabilities}
            episode={episode}
            key={episode.id}
            /*
              The seam finally has something behind it, so the call to action is live. The rows
              that must never start a purchase still cannot: `PURCHASE_BLOCKED` and `UNAVAILABLE`
              do not render a button at all, whatever is passed in here.
            */
            onUnlockRequested={onUnlockRequested}
          />
        ))}
      </ul>
      {episodes.appendError === null ? null : (
        <RetryableError error={episodes.appendError} onRetry={episodes.loadMore} />
      )}
      {episodes.nextCursor === null ? null : (
        <button
          className="episodes__more"
          type="button"
          data-testid="load-more-episodes"
          onClick={episodes.loadMore}
          disabled={episodes.appending}
        >
          {translate(episodes.appending ? 'home.loadingMore' : 'home.loadMore')}
        </button>
      )}
    </>
  );
}
