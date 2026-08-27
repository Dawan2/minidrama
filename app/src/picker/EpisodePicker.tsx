import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import type { EpisodeItem } from '@minidrama/shared';

import { RetryableError, Skeleton } from '../components/states';
import { presentEpisodeAccess } from '../catalog/access-presentation';
import { playPath } from '../routes/routes';
import { translate } from '../core/i18n';
import { useCatalogApi } from '../data/catalog-api-context';
import { usePagedResource } from '../data/use-paged-resource';
import { useProgressApi } from '../data/progress-api-context';
import { useResource } from '../data/use-resource';
import { watchedEpisodeIds } from '../data/progress-api';
import type { Resource } from '../data/use-resource';
import { episodeGroupBounds, episodeGroupCount, episodeGroupIndex } from './episode-groups';
import type { PurchaseCapabilities } from '../catalog/access-presentation';
import type { SurfaceError } from '../data/failure';

/**
 * PNL-01, the episode picker, as an overlay over the player.
 *
 * It exists to do one thing the inline drama-page list cannot: let a viewer jump while something
 * is already playing, without leaving the player route. The list is `GET /v1/dramas/{dramaId}/
 * episodes`, recovered from the episode the route named via `GET /v1/episodes/{episodeId}` —
 * the lookup `docs/02-information-architecture.md` §5 already describes. There is no fixture
 * album in here. Watched marks come from `GET /v1/progress/dramas/{dramaId}` and only from
 * that: a failed or in-flight read is an unmarked grid, never a guessed range of episode
 * numbers, and never N per-episode progress calls.
 *
 * Lock marks come from `viewerAccess` on every episode item. A locked cell is not a destination
 * — switching into a wall is the J16 exception the picker is not allowed to perform. A playable
 * cell is a `replace` link, so a walk through forty episodes is still one history entry. A
 * commercially locked cell is an *attempt*: the player mints `POST /v1/playback/sessions` for
 * that id and a 403 opens PNL-02 on the episode already on screen, never a demo album.
 *
 * Empty is not a state this panel has (`docs/02-screen-inventory.md` PNL-01). A drama with no
 * episodes yet is a content grid with nothing in it, and closing the panel is the way out.
 */

const TITLE_ID = 'episode-picker-title';

/** The server's maximum page of episodes, so an 80-episode drama is one request when it can be. */
const EPISODE_PAGE_LIMIT = 100;

/** Watched marks are omitted until the drama-progress read succeeds. Not a guessed empty watch. */
const EMPTY_WATCHED: ReadonlySet<string> = new Set();

function identifyEpisode(episode: EpisodeItem): string {
  return episode.id;
}

export interface EpisodePickerProps {
  /** The episode the player route is on. The drama is looked up from it, never passed in. */
  readonly episodeId: string;
  readonly capabilities: PurchaseCapabilities;
  readonly onClose: () => void;
  /**
   * A commercially locked cell. Not a route: the player asks the session endpoint, and a 403
   * opens PNL-02 without tearing down the episode that is already playing.
   */
  readonly onLockedAttempt?: (episode: EpisodeItem) => void;
}

export function EpisodePicker({
  episodeId,
  capabilities,
  onClose,
  onLockedAttempt,
}: EpisodePickerProps): React.JSX.Element {
  const api = useCatalogApi();
  const current = useResource(() => api.fetchEpisode(episodeId), `picker-episode:${episodeId}`);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="episode-picker" data-testid="episode-picker">
      <button
        className="episode-picker__scrim"
        data-testid="episode-picker-scrim"
        type="button"
        aria-label={translate('picker.close')}
        onClick={onClose}
      />
      <section
        className="episode-picker__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <h2 className="episode-picker__title" id={TITLE_ID}>
          {translate('picker.title')}
        </h2>
        {renderBody(
          current.resource,
          episodeId,
          capabilities,
          current.reload,
          onClose,
          onLockedAttempt,
        )}
        <button
          className="episode-picker__close"
          data-testid="episode-picker-close"
          type="button"
          onClick={onClose}
        >
          {translate('picker.close')}
        </button>
      </section>
    </div>
  );
}

function renderBody(
  resource: Resource<EpisodeItem>,
  episodeId: string,
  capabilities: PurchaseCapabilities,
  reload: () => void,
  onClose: () => void,
  onLockedAttempt: ((episode: EpisodeItem) => void) | undefined,
): React.JSX.Element {
  if (resource.status === 'loading') {
    return <Skeleton rows={4} />;
  }

  if (resource.status === 'failed') {
    return <LookupFailure error={resource.error} onRetry={reload} />;
  }

  return (
    <EpisodeGrid
      capabilities={capabilities}
      currentEpisodeId={episodeId}
      dramaId={resource.data.dramaId}
      onClose={onClose}
      {...(onLockedAttempt === undefined ? {} : { onLockedAttempt })}
    />
  );
}

/**
 * In-panel, never a full-screen terminal. PNL-01 has no terminal state of its own
 * (`docs/02-screen-inventory.md`), and a "back home" link on top of a playing episode would
 * abandon the player to report that one lookup failed.
 *
 * A retryable failure still gets a retry. A 404/410 of the current episode is a statement: the
 * demo album's ids are not catalogue ids, and repeating the request cannot invent them.
 */
function LookupFailure({
  error,
  onRetry,
}: {
  readonly error: SurfaceError;
  readonly onRetry: () => void;
}): React.JSX.Element {
  if (error.kind === 'RETRYABLE') {
    return <RetryableError error={error} onRetry={onRetry} />;
  }

  return (
    <p
      className="episode-picker__message"
      data-testid="episode-picker-unavailable"
      data-reason={error.reason}
      data-trace-id={error.failure.traceId ?? ''}
      role="alert"
    >
      {translate('picker.unavailable')}
    </p>
  );
}

function EpisodeGrid({
  dramaId,
  currentEpisodeId,
  capabilities,
  onClose,
  onLockedAttempt,
}: {
  readonly dramaId: string;
  readonly currentEpisodeId: string;
  readonly capabilities: PurchaseCapabilities;
  readonly onClose: () => void;
  readonly onLockedAttempt?: (episode: EpisodeItem) => void;
}): React.JSX.Element {
  const api = useCatalogApi();
  const progressApi = useProgressApi();
  const episodes = usePagedResource(
    (cursor: string | undefined) =>
      api.fetchEpisodes({
        dramaId,
        limit: EPISODE_PAGE_LIMIT,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    identifyEpisode,
    `picker-episodes:${dramaId}`,
  );
  const progress = useResource(
    () => progressApi.fetchDramaProgress(dramaId),
    `picker-progress:${dramaId}`,
  );

  const { appendError, appending, error, items, loadMore, nextCursor, reload, status } = episodes;
  const [groupOverride, setGroupOverride] = useState<number | null>(null);
  const watched =
    progress.resource.status === 'ready'
      ? watchedEpisodeIds(progress.resource.data)
      : EMPTY_WATCHED;

  /**
   * Walk the remaining pages so an 80-episode drama is one grid, not a "load more" buried under
   * the numbers. A further page that fails stays an in-panel retry: the episodes already on
   * screen are still the ones the viewer can pick.
   */
  useEffect(() => {
    if (status === 'ready' && nextCursor !== null && !appending && appendError === null) {
      loadMore();
    }
  }, [appendError, appending, loadMore, nextCursor, status]);

  if (status === 'loading') {
    return <Skeleton rows={4} />;
  }

  if (status === 'failed' && error !== null) {
    return <LookupFailure error={error} onRetry={reload} />;
  }

  const maxGlobal = items.reduce(
    (highest, episode) => Math.max(highest, episode.globalEpisodeNumber),
    0,
  );
  const groups = episodeGroupCount(maxGlobal);
  const current = items.find((episode) => episode.id === currentEpisodeId);
  const inferredGroup = current === undefined ? 0 : episodeGroupIndex(current.globalEpisodeNumber);
  const activeGroup = groupOverride ?? inferredGroup;
  const visible = items
    .filter((episode) => episodeGroupIndex(episode.globalEpisodeNumber) === activeGroup)
    .slice()
    .sort((left, right) => left.globalEpisodeNumber - right.globalEpisodeNumber);

  return (
    <>
      {groups > 1 ? (
        <div className="episode-picker__groups" data-testid="episode-picker-groups" role="tablist">
          {Array.from({ length: groups }, (_unused, index) => {
            const bounds = episodeGroupBounds(index, maxGlobal);
            return (
              <button
                className={
                  index === activeGroup
                    ? 'episode-picker__group episode-picker__group--active'
                    : 'episode-picker__group'
                }
                data-testid="episode-picker-group"
                data-group={String(index)}
                key={index}
                type="button"
                role="tab"
                aria-selected={index === activeGroup}
                onClick={() => {
                  setGroupOverride(index);
                }}
              >
                {translate('picker.group', undefined, { start: bounds.start, end: bounds.end })}
              </button>
            );
          })}
        </div>
      ) : null}

      <ul className="episode-picker__grid" data-testid="episode-picker-grid">
        {visible.map((episode) => (
          <EpisodeCell
            capabilities={capabilities}
            current={episode.id === currentEpisodeId}
            episode={episode}
            key={episode.id}
            onClose={onClose}
            watched={watched.has(episode.id)}
            {...(onLockedAttempt === undefined ? {} : { onLockedAttempt })}
          />
        ))}
      </ul>

      {appendError === null ? null : <RetryableError error={appendError} onRetry={loadMore} />}
    </>
  );
}

function EpisodeCell({
  episode,
  current,
  watched,
  capabilities,
  onClose,
  onLockedAttempt,
}: {
  readonly episode: EpisodeItem;
  readonly current: boolean;
  readonly watched: boolean;
  readonly capabilities: PurchaseCapabilities;
  readonly onClose: () => void;
  readonly onLockedAttempt?: (episode: EpisodeItem) => void;
}): React.JSX.Element {
  const presentation = presentEpisodeAccess(episode.viewerAccess, capabilities);
  const label = translate('drama.episodeLabel', undefined, { n: episode.globalEpisodeNumber });
  const className = [
    'episode-picker__cell',
    presentation.locked ? 'episode-picker__cell--locked' : '',
    current ? 'episode-picker__cell--current' : '',
    watched ? 'episode-picker__cell--watched' : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

  const marks = (
    <>
      <span className="episode-picker__number">{episode.globalEpisodeNumber}</span>
      {presentation.locked ? (
        <span className="episode-picker__lock" aria-hidden>
          {translate('picker.locked')}
        </span>
      ) : null}
      {watched ? (
        <span className="episode-picker__watched" aria-hidden>
          {translate('picker.watched')}
        </span>
      ) : null}
    </>
  );

  const watchedSuffix = watched ? `. ${translate('picker.watched')}` : '';
  const lockLabel = `${label}. ${translate('picker.locked')}${watchedSuffix}`;
  const attempt = onLockedAttempt;
  const commercialLock =
    attempt !== undefined &&
    (presentation.action === 'UNLOCK' || presentation.action === 'SUBSCRIBE');

  return (
    <li>
      {presentation.navigable ? (
        <Link
          className={className}
          data-testid="episode-picker-cell"
          data-episode-id={episode.id}
          data-locked="false"
          data-current={current ? 'true' : 'false'}
          data-watched={watched ? 'true' : 'false'}
          replace
          to={playPath(episode.id)}
          onClick={onClose}
          aria-current={current ? 'true' : undefined}
          aria-label={
            current
              ? `${label}. ${translate('picker.current')}${watchedSuffix}`
              : `${label}${watchedSuffix}`
          }
        >
          {marks}
        </Link>
      ) : commercialLock ? (
        <button
          className={className}
          data-testid="episode-picker-cell"
          data-episode-id={episode.id}
          data-locked="true"
          data-current={current ? 'true' : 'false'}
          data-watched={watched ? 'true' : 'false'}
          data-action={presentation.action}
          type="button"
          aria-label={lockLabel}
          onClick={() => {
            onClose();
            attempt?.(episode);
          }}
        >
          {marks}
        </button>
      ) : (
        // Not a destination. Unavailable or unpurchasable stays a mark: this panel does not
        // navigate into a wall (J16) and does not take a purchase it cannot complete.
        <span
          className={className}
          data-testid="episode-picker-cell"
          data-episode-id={episode.id}
          data-locked="true"
          data-current={current ? 'true' : 'false'}
          data-watched={watched ? 'true' : 'false'}
          data-action={presentation.action}
          aria-label={lockLabel}
        >
          {marks}
        </span>
      )}
    </li>
  );
}
