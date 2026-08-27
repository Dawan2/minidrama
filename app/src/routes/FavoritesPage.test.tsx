import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { FavoritesPage } from './FavoritesPage';
import {
  dramaSummary,
  feedCard,
  httpFailure,
  offlineFailure,
  page,
  stubCatalogApi,
} from '../testing/catalog-fixtures';
import {
  favoritesHttpFailure,
  followedState,
  stubFavoritesApi,
  unfollowedState,
} from '../testing/favorites-fixtures';
import { FAVORITE_PROBE_CONCURRENCY } from '../favorites/favorite-collection';
import { renderSurface } from '../testing/render';
import { stubSession } from '../testing/history-fixtures';

const AUGUST_1 = '2026-08-01T00:00:00.000Z';
const AUGUST_2 = '2026-08-02T00:00:00.000Z';

/** A feed page carrying the given dramas, which is what the screen asks about. */
function candidates(...ids: readonly string[]) {
  return stubCatalogApi({
    feed: () => ok(page(ids.map((id) => feedCard({ drama: dramaSummary({ id, title: id }) })))),
  });
}

/**
 * SCR-08. The assertions that matter are the ones separating the ways this screen can show no rows:
 * an empty list, a missing session, an endpoint that is not deployed, and a read that only partly
 * answered. A viewer who follows twenty dramas and is told "you are not following anything" because
 * a token was missing has been told their list is gone.
 */
describe('the favourites screen', () => {
  it('asks the favourite endpoint about each drama it can see', async () => {
    const favoritesApi = stubFavoritesApi();
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    await waitFor(() => {
      expect(favoritesApi.readCalls).toEqual(['drm_1', 'drm_2']);
    });
  });

  it('shows a skeleton while the read is in flight', () => {
    renderSurface(<FavoritesPage />);
    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('renders a row per followed drama and leaves the rest out', async () => {
    const favoritesApi = stubFavoritesApi({
      read: (dramaId) =>
        ok(dramaId === 'drm_1' ? followedState(dramaId, AUGUST_1) : unfollowedState(dramaId)),
    });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(1);
    });
    expect(screen.getByTestId('favorite-row').getAttribute('data-drama-id')).toBe('drm_1');
  });

  it('puts the most recently followed drama first', async () => {
    const favoritesApi = stubFavoritesApi({
      read: (dramaId) => ok(followedState(dramaId, dramaId === 'drm_1' ? AUGUST_1 : AUGUST_2)),
    });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(2);
    });
    expect(
      screen.getAllByTestId('favorite-row').map((row) => row.getAttribute('data-drama-id')),
    ).toEqual(['drm_2', 'drm_1']);
  });

  it('sends an empty list to the feed, because the way out of one is content', async () => {
    renderSurface(<FavoritesPage />, { api: candidates('drm_1') });

    const empty = await screen.findByTestId('empty-state');
    expect(empty.textContent).toContain('not following anything yet');
    expect(
      screen.getByRole('link', { name: 'Find something to follow' }).getAttribute('href'),
    ).toBe('/home');
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('empty');
  });

  /**
   * The screen is assembled from the dramas it can see, so "you follow nothing" is a claim it is not
   * in a position to make. Saying nothing about that would read as the product having lost a drama
   * the viewer chose.
   */
  it('discloses that the list may be incomplete, on the list and on the empty state', async () => {
    const followed = stubFavoritesApi({ read: (dramaId) => ok(followedState(dramaId, AUGUST_1)) });
    const { unmount } = renderSurface(<FavoritesPage />, {
      api: candidates('drm_1'),
      favoritesApi: followed,
    });

    const onList = await screen.findByTestId('favorites-coverage');
    expect(onList.textContent).toContain('may not be complete');
    unmount();

    renderSurface(<FavoritesPage />, { api: candidates('drm_1') });
    await screen.findByTestId('empty-state');
    expect(screen.getByTestId('favorites-coverage')).toBeDefined();
  });
});

/**
 * The distinction the screen exists to make. All of these show no rows; they are not the same screen,
 * they do not say the same thing, and the recovery is different in each case.
 */
describe('no session versus an empty list versus a failure', () => {
  it('offers a sign-in rather than an empty list when a favourite read answers 401', async () => {
    const favoritesApi = stubFavoritesApi({ read: () => err(favoritesHttpFailure(401)) });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    const prompt = await screen.findByTestId('favorites-sign-in');
    expect(prompt.textContent).toContain('Sign in to see the dramas you follow.');
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('auth_required');
  });

  it('says something different from the empty state, and offers a different action', async () => {
    const unauthorised = stubFavoritesApi({ read: () => err(favoritesHttpFailure(401)) });
    const { unmount } = renderSurface(<FavoritesPage />, {
      api: candidates('drm_1'),
      favoritesApi: unauthorised,
    });
    const promptText = (await screen.findByTestId('favorites-sign-in')).textContent ?? '';
    expect(screen.queryByRole('link', { name: 'Find something to follow' })).toBeNull();
    unmount();

    renderSurface(<FavoritesPage />, { api: candidates('drm_1') });
    const emptyText = (await screen.findByTestId('empty-state')).textContent ?? '';

    expect(promptText).not.toBe(emptyText);
    expect(screen.queryByTestId('favorites-sign-in')).toBeNull();
  });

  it('rereads the whole list once a session exists', async () => {
    const favoritesApi = stubFavoritesApi({
      read: (dramaId, index) =>
        index === 0 ? err(favoritesHttpFailure(401)) : ok(followedState(dramaId, AUGUST_1)),
    });
    renderSurface(<FavoritesPage />, {
      api: candidates('drm_1'),
      favoritesApi,
      session: stubSession({ signInSucceeds: true }),
    });

    fireEvent.click(await screen.findByTestId('sign-in'));

    expect(await screen.findByTestId('favorites-list')).toBeDefined();
  });

  // Silent login cannot succeed until the identity slot lands. The viewer is told, and the screen
  // stays where it was rather than becoming an error.
  it('keeps the prompt and explains itself when silent login cannot produce a session', async () => {
    const favoritesApi = stubFavoritesApi({ read: () => err(favoritesHttpFailure(401)) });
    renderSurface(<FavoritesPage />, {
      api: candidates('drm_1'),
      favoritesApi,
      session: stubSession({ signInSucceeds: false }),
    });

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
    const favoritesApi = stubFavoritesApi({
      read: (dramaId) => ok(followedState(dramaId, AUGUST_1)),
    });
    renderSurface(<FavoritesPage />, {
      api: candidates('drm_1'),
      favoritesApi,
      session: stubSession({ state: { status: 'ANONYMOUS' } }),
    });

    expect(await screen.findByTestId('favorites-list')).toBeDefined();
  });
});

/**
 * There is no discovery module on the server on this branch, so every favourite request answers 404
 * from the not-found handler. That is our gap, not the viewer's missing data.
 */
describe('an endpoint that is not deployed', () => {
  it('degrades to the empty state rather than to an error', async () => {
    const favoritesApi = stubFavoritesApi({ read: () => err(favoritesHttpFailure(404)) });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1'), favoritesApi });

    expect(await screen.findByTestId('empty-state')).toBeDefined();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.queryByTestId('favorites-sign-in')).toBeNull();
  });

  // The viewer sees the empty state; the DOM still says which of the two it was, so a bug report can
  // tell "we have not built this" from "you follow nothing".
  it('stays distinguishable from a genuinely empty list', async () => {
    const favoritesApi = stubFavoritesApi({ read: () => err(favoritesHttpFailure(404)) });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1'), favoritesApi });

    await screen.findByTestId('empty-state');
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('unavailable');
  });

  /**
   * Twenty requests that all answer 404 is nineteen wasted round trips before an empty screen. The
   * saving is bounded by the batch already in flight, which is what `FAVORITE_PROBE_CONCURRENCY`
   * costs and why it is small.
   */
  it('stops after the first batch of refusals instead of asking about every drama', async () => {
    const favoritesApi = stubFavoritesApi({ read: () => err(favoritesHttpFailure(404)) });
    renderSurface(<FavoritesPage />, {
      api: candidates('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'),
      favoritesApi,
    });

    await screen.findByTestId('empty-state');
    expect(favoritesApi.readCalls.length).toBe(FAVORITE_PROBE_CONCURRENCY);
  });
});

describe('failures that are neither', () => {
  it('offers a retry when the candidate source failed, and rereads on it', async () => {
    let attempt = 0;
    const api = stubCatalogApi({
      feed: () => {
        attempt += 1;
        return attempt === 1 ? err(offlineFailure()) : ok(page([feedCard()]));
      },
    });
    const favoritesApi = stubFavoritesApi({
      read: (dramaId) => ok(followedState(dramaId, AUGUST_1)),
    });
    renderSurface(<FavoritesPage />, { api, favoritesApi });

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-failure-kind')).toBe('OFFLINE');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('favorites-list')).toBeDefined();
  });

  // A terminal state's only job is to explain itself, and the shared copy explains a drama.
  it('explains a refused read in terms of the viewer’s list, not of a drama', async () => {
    const api = stubCatalogApi({ feed: () => err(httpFailure(400)) });
    renderSurface(<FavoritesPage />, { api });

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.textContent).toContain('We could not load your favourites.');
    expect(terminal.textContent).not.toContain('drama');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('carries the trace id so a report maps to a server trace', async () => {
    const api = stubCatalogApi({ feed: () => err(httpFailure(500, 'trace_fav')) });
    renderSurface(<FavoritesPage />, { api });

    expect((await screen.findByTestId('retryable-error')).getAttribute('data-trace-id')).toBe(
      'trace_fav',
    );
  });
});

/**
 * A read where some probes answered and some did not. The rows that loaded are correct; the list is
 * not known to be complete, and a hole in it is indistinguishable from a drama the viewer never
 * followed.
 */
describe('a read that only partly answered', () => {
  it('keeps the rows it resolved and reports the list as incomplete underneath them', async () => {
    const favoritesApi = stubFavoritesApi({
      read: (dramaId) =>
        dramaId === 'drm_2' ? err(offlineFailure()) : ok(followedState(dramaId, AUGUST_1)),
    });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(1);
    });
    expect(screen.getByTestId('retryable-error')).toBeDefined();
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('incomplete');
  });

  /**
   * The case this branch exists for. No row was found *and* a probe never answered, so "you are not
   * following anything" is a claim about the drama that did not answer — and it is not made.
   */
  it('does not call a list empty when a drama never answered', async () => {
    const favoritesApi = stubFavoritesApi({
      read: (dramaId) =>
        dramaId === 'drm_2' ? err(offlineFailure()) : ok(unfollowedState(dramaId)),
    });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    expect(await screen.findByTestId('retryable-error')).toBeDefined();
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.getByTestId('favorites-page').getAttribute('data-state')).toBe('unresolved');
  });

  /**
   * A refused probe answers the same way for ever, so it gets a sentence rather than a button. It
   * still cannot be hidden: the rows on screen are real and the list is still not known to be
   * complete.
   */
  it('states an unresolvable gap without offering a retry that cannot work', async () => {
    const favoritesApi = stubFavoritesApi({
      read: (dramaId) =>
        dramaId === 'drm_2' ? err(favoritesHttpFailure(400)) : ok(followedState(dramaId, AUGUST_1)),
    });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    const notice = await screen.findByTestId('favorites-incomplete');
    expect(notice.textContent).toContain('may be missing');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getAllByTestId('favorite-row')).toHaveLength(1);
  });

  it('rereads the whole list on the retry rather than only the drama that failed', async () => {
    const favoritesApi = stubFavoritesApi({
      read: (dramaId, index) =>
        index < 2 && dramaId === 'drm_2'
          ? err(offlineFailure())
          : ok(followedState(dramaId, AUGUST_1)),
    });
    renderSurface(<FavoritesPage />, { api: candidates('drm_1', 'drm_2'), favoritesApi });

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('favorite-row')).toHaveLength(2);
    });
    expect(favoritesApi.readCalls).toEqual(['drm_1', 'drm_2', 'drm_1', 'drm_2']);
  });
});
