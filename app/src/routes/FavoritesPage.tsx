import { useCallback } from 'react';
import { Link } from 'react-router';

import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { FavoriteRow } from '../favorites/FavoriteRow';
import { ROUTES } from './routes';
import { SignInPrompt } from '../auth/SignInPrompt';
import { collectFavorites } from '../favorites/favorite-collection';
import { feedCandidateSource } from '../favorites/favorite-candidates';
import { classifyFailure } from '../data/failure';
import { presentSessionReadFailure } from '../data/session-read';
import { translate } from '../core/i18n';
import { useCatalogApi } from '../data/catalog-api-context';
import { useFavoritesApi } from '../data/favorites-api-context';
import { useResource } from '../data/use-resource';
import type { ApiFailure, SurfaceError } from '../data/failure';
import type { FavoritesList } from '../favorites/favorite-collection';
import type { Resource } from '../data/use-resource';

/**
 * SCR-08, the favourites screen.
 *
 * The five states of `docs/02-information-architecture.md` §8.1 plus the one every personal screen
 * needs — **no session** — which is not an error and not an empty list but a fourth answer with its
 * own recovery (`data/session-read.ts`). The history screen (SCR-07) drew that distinction first;
 * this screen inherits it rather than re-deciding it.
 *
 * What is different here is where the list comes from. There is no `GET /v1/users/me/favorites`:
 * slot J shipped the three per-drama favourite verbs and deliberately left the list to the catalogue
 * (`docs/handoff/w2-work-j.md` §4). So the screen asks about the dramas it can see and keeps the ones
 * the viewer follows — `favorites/favorite-candidates.ts` has the reasoning and the honest limit,
 * which is that a followed drama outside the candidate page is not on this screen.
 *
 * That limit is **disclosed on screen, including on the empty state**, and it is the one piece of
 * copy on this page that is not optional. An incomplete favourites list is indistinguishable from a
 * drama the viewer never followed, so saying nothing reads as the product having lost something they
 * chose. "You follow nothing" is a claim this screen is not in a position to make.
 *
 * Like the history screen, it requests unconditionally even when the session state says the viewer is
 * anonymous. The session state decides what a screen *says*; the server decides what a viewer may
 * *see*. A client-side skip would make the client the authority on identity and would show a sign-in
 * prompt over a list the server would have returned.
 */
export function FavoritesPage(): React.JSX.Element {
  const catalog = useCatalogApi();
  const favorites = useFavoritesApi();

  const load = useCallback(
    () =>
      collectFavorites({
        candidates: feedCandidateSource(catalog),
        readFavorite: (dramaId) => favorites.readFavorite(dramaId),
      }),
    [catalog, favorites],
  );

  const { resource, reload } = useResource(load, 'favorites');

  return (
    <main
      className="page page--favorites"
      data-testid="favorites-page"
      data-state={stateOf(resource)}
    >
      <Link className="page__back" to={ROUTES.me}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('favorites.heading')}</h1>
      {renderFavorites(resource, reload)}
    </main>
  );
}

/**
 * The state, as an attribute, so the ways this screen can show no rows stay distinguishable from the
 * outside: an empty list, a missing session, an endpoint that is not deployed, a failed read, and a
 * read that answered for only some of the dramas it asked about.
 *
 * The viewer sees the same empty state for `unavailable` and for a genuinely empty list, which is the
 * intended degradation; a test, a bug report or a future analytics event can still tell "we have not
 * built this" from "you follow nothing".
 */
function stateOf(resource: Resource<FavoritesList>): string {
  if (resource.status === 'loading') {
    return 'loading';
  }
  if (resource.status === 'failed') {
    return presentSessionReadFailure(resource.error.failure).kind.toLowerCase();
  }

  const { entries, unresolved } = resource.data;
  if (entries.length === 0) {
    return unresolved === null ? 'empty' : 'unresolved';
  }
  return unresolved === null ? 'ready' : 'incomplete';
}

function renderFavorites(resource: Resource<FavoritesList>, reload: () => void): React.JSX.Element {
  if (resource.status === 'loading') {
    return <Skeleton rows={4} />;
  }

  if (resource.status === 'failed') {
    return renderReadFailure(resource.error, reload);
  }

  const { entries, unresolved } = resource.data;

  return (
    <>
      {/*
        An empty list with an unresolved probe is not the empty state. We asked about twenty dramas,
        three did not answer, and "you are not following anything" is a claim about those three that
        this screen cannot support.
      */}
      {entries.length === 0 && unresolved === null ? emptyState() : null}

      {entries.length === 0 ? null : (
        <ul className="favorites" data-testid="favorites-list">
          {entries.map((entry) => (
            <FavoriteRow entry={entry} key={entry.drama.id} />
          ))}
        </ul>
      )}

      {/*
        A probe that never answered, under the rows and never over them: once there is content on
        screen, replacing it because one of twenty requests timed out costs the viewer the list to
        tell them something a notice can say (`docs/handoff/w2-work-h.md` decision H9).
      */}
      {unresolved === null ? null : renderUnresolved(unresolved, reload)}

      {/*
        The candidate window, on every successful read and under whatever the body turned out to be.
        It qualifies an empty list at least as much as a full one: a viewer who follows a drama the
        feed page did not carry is being shown "you follow nothing" about a drama they chose.
      */}
      <p className="favorites__notice" data-testid="favorites-coverage">
        {translate('favorites.partial')}
      </p>
    </>
  );
}

/**
 * The read failed before there was a list, which is three different screens.
 *
 * The classification is the shared one, so a `401` here means exactly what it means on the history
 * screen. `UNAVAILABLE` renders as the empty state on purpose: neither the favourite endpoints nor
 * the feed being deployed is the viewer's problem, and an error screen would ask them to do something
 * about our missing feature.
 */
function renderReadFailure(error: SurfaceError, reload: () => void): React.JSX.Element {
  const presented = presentSessionReadFailure(error.failure);

  if (presented.kind === 'AUTH_REQUIRED') {
    return (
      <SignInPrompt
        messageKey="favorites.signInRequired"
        onSignedIn={reload}
        testId="favorites-sign-in"
      />
    );
  }

  if (presented.kind === 'UNAVAILABLE') {
    return emptyState();
  }

  return presented.error.kind === 'RETRYABLE' ? (
    <RetryableError error={presented.error} onRetry={reload} />
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
 * A probe that never answered, told apart by whether asking again could change the answer.
 *
 * A timeout or a server fault is worth another read of the whole list, and the retry is the page's
 * reload rather than a per-drama repeat — a second attempt asks about every candidate, because by
 * then the answers we did get are stale too.
 *
 * A refused probe is not. A `400` about one drama id answers the same way for ever, and a retry
 * button on it is the mistake `data/failure.ts` exists to prevent. It still cannot be hidden: the
 * rows on screen are real and the list is still not known to be complete, so it degrades to the
 * notice — a sentence, and nothing to press.
 */
function renderUnresolved(failure: ApiFailure, reload: () => void): React.JSX.Element {
  const error = classifyFailure(failure);

  return error.kind === 'RETRYABLE' ? (
    <RetryableError error={error} onRetry={reload} />
  ) : (
    <p className="favorites__notice" data-testid="favorites-incomplete" role="alert">
      {translate('favorites.incomplete')}
    </p>
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
