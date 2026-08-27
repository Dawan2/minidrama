import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import type { EpisodeItem } from '@minidrama/shared';

import { RetryableError, Skeleton } from '../components/states';
import { presentEpisodeAccess } from '../catalog/access-presentation';
import { playPath } from '../routes/routes';
import { translate } from '../core/i18n';
import { useCatalogApi } from '../data/catalog-api-context';
import { usePagedResource } from '../data/use-paged-resource';
import { useResource } from '../data/use-resource';
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
 * album in here, and there is no `GET /progress/dramas/{dramaId}`: that path is not in
 * `contracts/openapi.yaml`, and inventing it would be a client-side contract.
 *
 * Watched marks therefore do not appear. Lock marks do, because `viewerAccess` arrives on every
 * episode item. A locked cell is not a destination — switching into a wall is the J16 exception
 * the picker is not allowed to perform. A playable cell is a `replace` link, so a walk through
 * forty episodes is still one history entry.
 *
 * Empty is not a state this panel has (`docs/02-screen-inventory.md` PNL-01). A drama with no
 * episodes yet is a content grid with nothing in it, and closing the panel is the way out.
 */

const TITLE_ID = 'episode-picker-title';

/** The server's maximum page of episodes, so an 80-episode drama is one request when it can be. */
const EPISODE_PAGE_LIMIT = 100;

function identifyEpisode(episode: EpisodeItem): string {
  return episode.id;
}

export interface EpisodePickerProps {
  /** The episode the player route is on. The drama is looked up from it, never passed in. */
  readonly episodeId: string;
  readonly capabilities: PurchaseCapabilities;
  readonly onClose: () => void;
}

export function EpisodePicker({
  episodeId,
  capabilities,
  onClose,
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
        {renderBody(current.resource, episodeId, capabilities, current.reload, onClose)}
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
}: {
  readonly dramaId: string;
  readonly currentEpisodeId: string;
  readonly capabilities: PurchaseCapabilities;
  readonly onClose: () => void;
}): React.JSX.Element {
  const api = useCatalogApi();
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

  const { appendError, appending, error, items, loadMore, nextCursor, reload, status } = episodes;
  const [groupOverride, setGroupOverride] = useState<number | null>(null);

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
  capabilities,
  onClose,
}: {
  readonly episode: EpisodeItem;
  readonly current: boolean;
  readonly capabilities: PurchaseCapabilities;
  readonly onClose: () => void;
}): React.JSX.Element {
  const presentation = presentEpisodeAccess(episode.viewerAccess, capabilities);
  const label = translate('drama.episodeLabel', undefined, { n: episode.globalEpisodeNumber });
  const className = [
    'episode-picker__cell',
    presentation.locked ? 'episode-picker__cell--locked' : '',
    current ? 'episode-picker__cell--current' : '',
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
    </>
  );

  return (
    <li>
      {presentation.navigable ? (
        <Link
          className={className}
          data-testid="episode-picker-cell"
          data-episode-id={episode.id}
          data-locked="false"
          data-current={current ? 'true' : 'false'}
          replace
          to={playPath(episode.id)}
          onClick={onClose}
          aria-current={current ? 'true' : undefined}
          aria-label={current ? `${label}. ${translate('picker.current')}` : label}
        >
          {marks}
        </Link>
      ) : (
        // Not a destination. A locked or unavailable episode is a statement on the grid, not a
        // navigation that lands the player on a wall (J16) or a purchase this panel does not take.
        <span
          className={className}
          data-testid="episode-picker-cell"
          data-episode-id={episode.id}
          data-locked="true"
          data-current={current ? 'true' : 'false'}
          data-action={presentation.action}
          aria-label={`${label}. ${translate('picker.locked')}`}
        >
          {marks}
        </span>
      )}
    </li>
  );
}
