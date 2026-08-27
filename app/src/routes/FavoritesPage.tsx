import { Link } from 'react-router';

import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { FavoriteRow } from '../favorites/FavoriteRow';
import { ROUTES } from './routes';
import { SignInPrompt } from '../auth/SignInPrompt';
import { loadFavoritesPage } from '../favorites/favorite-collection';
import { presentSessionReadFailure } from '../data/session-read';
import { translate } from '../core/i18n';
import { useCatalogApi } from '../data/catalog-api-context';
import { useFavoritesApi } from '../data/favorites-api-context';
import { usePagedResource } from '../data/use-paged-resource';
import type { FavoriteEntry } from '../favorites/favorite-collection';
import type { PagedResourceHandle } from '../data/use-paged-resource';

/**
 * SCR-08, the favourites screen.
 *
 * The five states of `docs/02-information-architecture.md` §8.1 plus the one every personal screen
 * needs — **no session** — which is not an error and not an empty list but a fourth answer with its
 * own recovery (`data/session-read.ts`). The history screen (SCR-07) drew that distinction first;
 * this screen inherits it rather than re-deciding it.
 *
 * The list comes from `GET /v1/users/me/favorites`, paged, and that is a change of substance rather
 * than of plumbing. This screen used to be assembled by asking a page of the recommendation feed for
 * candidate dramas and then probing each one, which meant a followed drama the feed page did not
 * carry was **not on the viewer's favourites screen** — so the screen had to disclose, on every
 * successful read including the empty state, that the list might not be the list. The endpoint
 * answers for the whole list, so the disclosure is gone with the fan-out that made it necessary, and
 * "you are not following anything yet" is now a claim this screen is in a position to make.
 *
 * What the endpoint does not carry is the dramas themselves — it answers with ids and follow dates
 * (`favorites/favorite-collection.ts`) — so each row is resolved through the catalogue. A row that
 * does not resolve stays on screen, un-followable and marked, rather than being dropped: dropping it
 * would put a hole back in a list that is finally complete.
 *
 * Like the history screen, it requests unconditionally even when the session state says the viewer is
 * anonymous. The session state decides what a screen *says*; the server decides what a viewer may
 * *see*. A client-side skip makes the client an authority on identity and shows a sign-in prompt over
 * a list the server would have returned.
 */

/** A favourites list holds one row per drama (S61's keyset), so the drama id identifies it. */
function identifyEntry(entry: FavoriteEntry): string {
  return entry.dramaId;
}

export function FavoritesPage(): React.JSX.Element {
  const catalog = useCatalogApi();
  const favorites = useFavoritesApi();

  const list = usePagedResource(
    (cursor: string | undefined) =>
      loadFavoritesPage(
        {
          listFavorites: (request) => favorites.listFavorites(request),
          fetchDrama: (dramaId) => catalog.fetchDrama(dramaId),
        },
        cursor,
      ),
    identifyEntry,
    'favorites',
  );

  return (
    <main className="page page--favorites" data-testid="favorites-page" data-state={stateOf(list)}>
      <Link className="page__back" to={ROUTES.me}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('favorites.heading')}</h1>
      {renderFavorites(list)}
    </main>
  );
}

/**
 * The state, as an attribute, so the ways this screen can show no rows stay distinguishable from the
 * outside: an empty list, a missing session, an endpoint that is not deployed, and a failed read.
 *
 * The viewer sees the same empty state for `unavailable` and for a genuinely empty list, which is the
 * intended degradation; a test, a bug report or a future analytics event can still tell "we have not
 * built this" from "you follow nothing".
 *
 * `incomplete` is the one that is not about an empty screen: the rows are the viewer's whole list and
 * at least one of them has no drama behind it, so what is on screen is complete as a list and
 * incomplete as a set of cards.
 */
function stateOf(list: PagedResourceHandle<FavoriteEntry>): string {
  if (list.status === 'loading') {
    return 'loading';
  }
  if (list.status === 'failed' && list.error !== null) {
    return presentSessionReadFailure(list.error.failure).kind.toLowerCase();
  }
  if (list.items.length === 0) {
    return 'empty';
  }
  return list.items.some((entry) => entry.drama === null) ? 'incomplete' : 'ready';
}

function renderFavorites(list: PagedResourceHandle<FavoriteEntry>): React.JSX.Element {
  if (list.status === 'loading') {
    return <Skeleton rows={4} />;
  }

  if (list.status === 'failed' && list.error !== null) {
    return renderReadFailure(list);
  }

  if (list.items.length === 0) {
    return emptyState();
  }

  return (
    <>
      <ul className="favorites" data-testid="favorites-list">
        {list.items.map((entry) => (
          <FavoriteRow entry={entry} key={entry.dramaId} />
        ))}
      </ul>
      {list.appendError === null ? null : renderAppendFailure(list)}
      {list.nextCursor === null ? null : (
        <button
          className="feed__more"
          type="button"
          data-testid="load-more-favorites"
          onClick={list.loadMore}
          disabled={list.appending}
        >
          {translate(list.appending ? 'home.loadingMore' : 'home.loadMore')}
        </button>
      )}
    </>
  );
}

/**
 * The first page failed, which is three different screens.
 *
 * The classification is the shared one, so a `401` here means exactly what it means on the history
 * screen. `UNAVAILABLE` renders as the empty state on purpose: the endpoint not being deployed is not
 * the viewer's problem, and an error screen would ask them to do something about our missing feature.
 */
function renderReadFailure(list: PagedResourceHandle<FavoriteEntry>): React.JSX.Element {
  if (list.error === null) {
    return emptyState();
  }
  const presented = presentSessionReadFailure(list.error.failure);

  if (presented.kind === 'AUTH_REQUIRED') {
    return (
      <SignInPrompt
        messageKey="favorites.signInRequired"
        onSignedIn={list.reload}
        testId="favorites-sign-in"
      />
    );
  }

  if (presented.kind === 'UNAVAILABLE') {
    return emptyState();
  }

  return presented.error.kind === 'RETRYABLE' ? (
    <RetryableError error={presented.error} onRetry={list.reload} />
  ) : (
    // The shared terminal copy is about a drama. Here the missing thing is the viewer's own list, so
    // the message is overridden and the reason is kept for the attribute.
    <TerminalError
      reason={presented.error.reason}
      messageKey="favorites.unavailable"
      traceId={presented.error.failure.traceId}
    />
  );
}

/**
 * A failure while appending, under the rows and never over them: once there is content on screen,
 * replacing it because page three failed costs the viewer their place to tell them something they can
 * see (`docs/handoff/w2-work-h.md` decision H9).
 *
 * The `401` mapping holds here too. A session that expires mid-scroll is the same fact as one that
 * was missing at the first page, and the recovery is the same — so it is a sign-in prompt under the
 * rows, not a retry button that cannot succeed.
 */
function renderAppendFailure(list: PagedResourceHandle<FavoriteEntry>): React.JSX.Element | null {
  if (list.appendError === null) {
    return null;
  }

  const presented = presentSessionReadFailure(list.appendError.failure);
  return presented.kind === 'AUTH_REQUIRED' ? (
    <SignInPrompt
      messageKey="favorites.signInRequired"
      onSignedIn={list.loadMore}
      testId="favorites-sign-in-more"
    />
  ) : (
    <RetryableError error={list.appendError} onRetry={list.loadMore} />
  );
}

/** The way out of an empty favourites list is content, so the action is the feed. */
function emptyState(): React.JSX.Element {
  return (
    <EmptyState
      messageKey="favorites.empty"
      action={{ kind: 'link', to: ROUTES.home, labelKey: 'favorites.browse' }}
    />
  );
}
