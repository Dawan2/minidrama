import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { FavoritesPage } from './FavoritesPage';
import {
  dramaDetail,
  httpFailure,
  offlineFailure,
  stubCatalogApi,
} from '../testing/catalog-fixtures';
import {
  favoritesHttpFailure,
  favoritesPage,
  stubFavoritesApi,
} from '../testing/favorites-fixtures';
import { renderSurface, settle } from '../testing/render';
import { stubSession } from '../testing/history-fixtures';

/** The catalogue, resolving whatever the list names. A row needs a title before it can be drawn. */
function resolvingCatalog() {
  return stubCatalogApi({
    drama: (dramaId) => ok(dramaDetail({ id: dramaId, title: dramaId })),
  });
}

/** The list endpoint answering with these dramas, in this order. */
function following(...dramaIds: readonly string[]) {
  return stubFavoritesApi({ list: () => ok(favoritesPage(dramaIds)) });
}

function renderFavorites(options: Parameters<typeof renderSurface>[1] = {}) {
  return renderSurface(<FavoritesPage />, { api: resolvingCatalog(), ...options });
}

/**
 * SCR-08. The assertions that matter are the ones separating the ways this screen can show no rows:
 * an empty list, a missing session, and an endpoint that is not deployed. A viewer who follows twenty
 * dramas and is told "you are not following anything" because a token was missing has been told their
 * list is gone.
 */
describe('the favourites screen', () => {
  /**
   * The change this slot is about. The screen used to ask a page of the recommendation feed for
   * candidate dramas and then probe each one, so a followed drama the feed page did not carry was not
   * on this screen at all.
   */
  it('reads the viewer’s list rather than probing the dramas it can see', async () => {
    const favoritesApi = following('drm_1', 'drm_2');
    const api = resolvingCatalog();
    renderFavorites({ api, favoritesApi });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(2);
    });
    expect(favoritesApi.listCalls).toHaveLength(1);
    expect(favoritesApi.readCalls).toEqual([]);
    expect(api.feedCalls).toEqual([]);
  });

  it('shows a skeleton while the read is in flight', () => {
    renderFavorites();
    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('renders a row per favourite the server listed', async () => {
    renderFavorites({ favoritesApi: following('drm_1', 'drm_2') });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(2);
    });
    expect(
      screen.getAllByTestId('favorite-row').map((row) => row.getAttribute('data-drama-id')),
    ).toEqual(['drm_1', 'drm_2']);
  });

  /**
   * Most recently followed first is the server's ordering now, applied inside the keyset the cursor
   * pages through. The screen renders the order it was given; re-sorting it here would be a second
   * opinion about an order the pages are already cut along.
   */
  it('renders the server’s order rather than one of its own', async () => {
    renderFavorites({ favoritesApi: following('drm_c', 'drm_a', 'drm_b') });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(3);
    });
    expect(
      screen.getAllByTestId('favorite-row').map((row) => row.getAttribute('data-drama-id')),
    ).toEqual(['drm_c', 'drm_a', 'drm_b']);
  });

  it('sends an empty list to the feed, because the way out of one is content', async () => {
    renderFavorites();

    const empty = await screen.findByTestId('empty-state');
    expect(empty.textContent).toContain('not following anything yet');
    expect(
      screen.getByRole('link', { name: 'Find something to follow' }).getAttribute('href'),
    ).toBe('/home');
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('empty');
  });

  /**
   * The disclosure the fan-out needed is gone with it. The screen said, on every successful read
   * including the empty state, that the list covered only the dramas it could see — and it must not
   * keep apologising for a limitation it no longer has.
   */
  it('no longer warns that the list may be incomplete', async () => {
    const { unmount } = renderFavorites({ favoritesApi: following('drm_1') });

    await screen.findByTestId('favorites-list');
    expect(screen.queryByTestId('favorites-coverage')).toBeNull();
    unmount();

    renderFavorites();
    await screen.findByTestId('empty-state');
    expect(screen.queryByTestId('favorites-coverage')).toBeNull();
  });
});

/**
 * The distinction the screen exists to make. All of these show no rows; they are not the same screen,
 * they do not say the same thing, and the recovery is different in each case.
 */
describe('no session versus an empty list versus a failure', () => {
  it('offers a sign-in rather than an empty list when the list read answers 401', async () => {
    const favoritesApi = stubFavoritesApi({ list: () => err(favoritesHttpFailure(401)) });
    renderFavorites({ favoritesApi });

    const prompt = await screen.findByTestId('favorites-sign-in');
    expect(prompt.textContent).toContain('Sign in to see the dramas you follow.');
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('auth_required');
  });

  it('says something different from the empty state, and offers a different action', async () => {
    const unauthorised = stubFavoritesApi({ list: () => err(favoritesHttpFailure(401)) });
    const { unmount } = renderFavorites({ favoritesApi: unauthorised });
    const promptText = (await screen.findByTestId('favorites-sign-in')).textContent ?? '';
    expect(screen.queryByRole('link', { name: 'Find something to follow' })).toBeNull();
    unmount();

    renderFavorites();
    const emptyText = (await screen.findByTestId('empty-state')).textContent ?? '';

    expect(promptText).not.toBe(emptyText);
    expect(screen.queryByTestId('favorites-sign-in')).toBeNull();
  });

  it('rereads the list once a session exists', async () => {
    const favoritesApi = stubFavoritesApi({
      list: (_request, index) =>
        index === 0 ? err(favoritesHttpFailure(401)) : ok(favoritesPage(['drm_1'])),
    });
    renderFavorites({ favoritesApi, session: stubSession({ signInSucceeds: true }) });

    fireEvent.click(await screen.findByTestId('sign-in'));

    expect(await screen.findByTestId('favorites-list')).toBeDefined();
  });

  // Silent login cannot succeed until the identity slot lands. The viewer is told, and the screen
  // stays where it was rather than becoming an error.
  it('keeps the prompt and explains itself when silent login cannot produce a session', async () => {
    const favoritesApi = stubFavoritesApi({ list: () => err(favoritesHttpFailure(401)) });
    renderFavorites({ favoritesApi, session: stubSession({ signInSucceeds: false }) });

    fireEvent.click(await screen.findByTestId('sign-in'));

    expect(await screen.findByTestId('sign-in-unavailable')).toBeDefined();
    expect(screen.getByTestId('favorites-sign-in')).toBeDefined();
  });

  /**
   * The session state decides what a screen says; the server decides what a viewer may see. A
   * client-side skip would make the client the authority on identity, and would show a sign-in prompt
   * over a list the server would have returned.
   */
  it('reads the list even when the client believes nobody is signed in', async () => {
    renderFavorites({
      favoritesApi: following('drm_1'),
      session: stubSession({ state: { status: 'ANONYMOUS' } }),
    });

    expect(await screen.findByTestId('favorites-list')).toBeDefined();
  });
});

/**
 * The list endpoint is not merged on this branch, so a request answers 404 from Fastify's not-found
 * handler. That is our gap, not the viewer's missing data.
 */
describe('an endpoint that is not deployed', () => {
  it('degrades to the empty state rather than to an error', async () => {
    const favoritesApi = stubFavoritesApi({ list: () => err(favoritesHttpFailure(404)) });
    renderFavorites({ favoritesApi });

    expect(await screen.findByTestId('empty-state')).toBeDefined();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.queryByTestId('favorites-sign-in')).toBeNull();
  });

  // The viewer sees the empty state; the DOM still says which of the two it was, so a bug report can
  // tell "we have not built this" from "you follow nothing".
  it('stays distinguishable from a genuinely empty list', async () => {
    const favoritesApi = stubFavoritesApi({ list: () => err(favoritesHttpFailure(404)) });
    renderFavorites({ favoritesApi });

    await screen.findByTestId('empty-state');
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('unavailable');
  });
});

describe('failures that are neither', () => {
  it('offers a retry when the list read failed, and rereads on it', async () => {
    const favoritesApi = stubFavoritesApi({
      list: (_request, index) =>
        index === 0 ? err(offlineFailure()) : ok(favoritesPage(['drm_1'])),
    });
    renderFavorites({ favoritesApi });

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-failure-kind')).toBe('OFFLINE');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('favorites-list')).toBeDefined();
  });

  // A terminal state's only job is to explain itself, and the shared copy explains a drama.
  it('explains a refused read in terms of the viewer’s list, not of a drama', async () => {
    const favoritesApi = stubFavoritesApi({ list: () => err(favoritesHttpFailure(400)) });
    renderFavorites({ favoritesApi });

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.textContent).toContain('We could not load your favourites.');
    expect(terminal.textContent).not.toContain('drama');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('carries the trace id so a report maps to a server trace', async () => {
    const favoritesApi = stubFavoritesApi({
      list: () => err(favoritesHttpFailure(500, { traceId: 'trace_fav' })),
    });
    renderFavorites({ favoritesApi });

    expect((await screen.findByTestId('retryable-error')).getAttribute('data-trace-id')).toBe(
      'trace_fav',
    );
  });
});

/**
 * The list names dramas; the catalogue turns them into cards. A card that cannot be drawn must not
 * remove a favourite from the list, because that is the hole the fan-out was deleted for.
 */
describe('a favourite the catalogue could not resolve', () => {
  it('keeps the row and marks the screen as incomplete', async () => {
    const api = stubCatalogApi({
      drama: (dramaId) =>
        dramaId === 'drm_gone' ? err(httpFailure(410)) : ok(dramaDetail({ id: dramaId })),
    });
    renderFavorites({ api, favoritesApi: following('drm_1', 'drm_gone') });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(2);
    });
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('incomplete');
    expect(screen.getByTestId('favorite-unresolved')).toBeDefined();
  });

  // A list of rows we could not draw is still the viewer's list, and it is not an error screen.
  it('is not an error and is not an empty list', async () => {
    const api = stubCatalogApi({ drama: () => err(offlineFailure()) });
    renderFavorites({ api, favoritesApi: following('drm_1') });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(1);
    });
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
  });
});

/**
 * The list is paged, which the fan-out could not be: a "load more" over candidates would have paged
 * the wrong collection. `hasMore` is not consulted — `nextCursor === null` is exactly equivalent.
 *
 * Two-round paging tests are driven through `settle` rather than stacked `findBy*`/`waitFor`. Each
 * async utility is a one-second wall-clock budget that a worker descheduled under parallel load can
 * spend without doing any work. `act` returns when React has run out of work rather than when a
 * timer says so, which starvation delays but cannot break. One-round tests in this file keep
 * `findBy*`.
 */
describe('paging the list', () => {
  it('offers more only while the server says there is more', async () => {
    const { unmount } = renderFavorites({ favoritesApi: following('drm_1') });
    await screen.findByTestId('favorites-list');
    expect(screen.queryByTestId('load-more-favorites')).toBeNull();
    unmount();

    renderFavorites({
      favoritesApi: stubFavoritesApi({ list: () => ok(favoritesPage(['drm_1'], 'cursor_2')) }),
    });
    expect(await screen.findByTestId('load-more-favorites')).toBeDefined();
  });

  it('appends the next page with the cursor the server handed back', async () => {
    const favoritesApi = stubFavoritesApi({
      list: (request) =>
        request.cursor === undefined
          ? ok(favoritesPage(['drm_1'], 'cursor_2'))
          : ok(favoritesPage(['drm_2'])),
    });
    await settle(() => renderFavorites({ favoritesApi }));

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more-favorites'));
    });

    expect(screen.getAllByTestId('favorite-row')).toHaveLength(2);
    expect(favoritesApi.listCalls.map((call) => call.cursor)).toEqual([undefined, 'cursor_2']);
    expect(screen.queryByTestId('load-more-favorites')).toBeNull();
  });

  /**
   * A page that fails is not an error screen once there are rows: replacing them would cost the
   * viewer their place to tell them something a notice can say.
   */
  it('keeps the rows on screen when a further page fails', async () => {
    const favoritesApi = stubFavoritesApi({
      list: (request) =>
        request.cursor === undefined
          ? ok(favoritesPage(['drm_1'], 'cursor_2'))
          : err(offlineFailure()),
    });
    await settle(() => renderFavorites({ favoritesApi }));

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more-favorites'));
    });

    expect(screen.getByTestId('retryable-error')).toBeDefined();
    expect(screen.getAllByTestId('favorite-row')).toHaveLength(1);
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('ready');
  });

  /**
   * A session that expires mid-scroll is the same fact as one that was missing at the first page, so
   * it is a sign-in prompt under the rows rather than a retry button that cannot succeed.
   */
  it('asks for a session under the rows when a further page answers 401', async () => {
    const favoritesApi = stubFavoritesApi({
      list: (request) =>
        request.cursor === undefined
          ? ok(favoritesPage(['drm_1'], 'cursor_2'))
          : err(favoritesHttpFailure(401)),
    });
    await settle(() => renderFavorites({ favoritesApi }));

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more-favorites'));
    });

    expect(screen.getByTestId('favorites-sign-in-more')).toBeDefined();
    expect(screen.getAllByTestId('favorite-row')).toHaveLength(1);
    expect(screen.queryByTestId('retryable-error')).toBeNull();
  });
});
