import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { FavoriteRow } from './FavoriteRow';
import { dramaSummary, offlineFailure } from '../testing/catalog-fixtures';
import { favoritesHttpFailure, stubFavoritesApi } from '../testing/favorites-fixtures';
import { renderSurface } from '../testing/render';
import { stubSession } from '../testing/history-fixtures';
import type { FavoriteEntry } from './favorite-collection';

function entry(overrides: Partial<FavoriteEntry> = {}): FavoriteEntry {
  return {
    dramaId: 'drm_1',
    drama: dramaSummary({ id: 'drm_1', title: 'The Heiress Returns' }),
    favoritedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A favourite whose drama the catalogue did not resolve: delisted, or a read that failed. */
function unresolvedEntry(): FavoriteEntry {
  return entry({ drama: null });
}

describe('a favourite row', () => {
  it('names the drama and leads to it', () => {
    renderSurface(<FavoriteRow entry={entry()} />);

    const row = screen.getByTestId('favorite-row');
    expect(row.getAttribute('data-drama-id')).toBe('drm_1');
    expect(row.textContent).toContain('The Heiress Returns');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/drama/drm_1');
  });

  /**
   * The favourite timestamp is the list's sort key and nothing else. "Following since 3 August" is a
   * claim the client would be quoting from a clock it does not own.
   */
  it('displays no timestamp', () => {
    const row = renderSurface(
      <FavoriteRow entry={entry({ favoritedAt: '2026-08-01T00:00:00.000Z' })} />,
    );

    expect(row.container.textContent).not.toContain('2026');
    expect(row.container.textContent).not.toContain('August');
  });

  /**
   * A list of five buttons all announced as "Remove" is a list a screen-reader user cannot act on.
   * The visible label is disambiguated by the row it sits in; an accessible name is not.
   */
  it('names the drama in the button’s accessible name while showing one word', () => {
    renderSurface(<FavoriteRow entry={entry()} />);

    const button = screen.getByTestId('favorite-remove');
    expect(button.textContent).toBe('Remove');
    expect(button.getAttribute('aria-label')).toBe(
      'Remove The Heiress Returns from your favourites',
    );
  });
});

/**
 * The favourites list carries drama ids, so a delisted drama — or one whose read failed — arrives with
 * no title, no cover and nowhere to tap. The server keeps such a row in the list on purpose, so that
 * the viewer can clear a favourite they can no longer watch.
 */
describe('a favourite whose drama did not resolve', () => {
  it('stays on screen and says what it is', () => {
    renderSurface(<FavoriteRow entry={unresolvedEntry()} />);

    const row = screen.getByTestId('favorite-row');
    expect(row.getAttribute('data-drama-id')).toBe('drm_1');
    expect(row.getAttribute('data-row-resolved')).toBe('false');
    expect(screen.getByTestId('favorite-unresolved').textContent).toContain(
      'could not load this drama',
    );
  });

  // A link to a drama we could not read is a tap that lands on an error screen.
  it('offers nothing to tap through to', () => {
    renderSurface(<FavoriteRow entry={unresolvedEntry()} />);

    expect(screen.queryByRole('link')).toBeNull();
  });

  /**
   * The one action that still means something. Hiding the row would leave a favourite the viewer can
   * neither see nor remove.
   */
  it('can still be un-followed', async () => {
    const favoritesApi = stubFavoritesApi();
    renderSurface(<FavoriteRow entry={unresolvedEntry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));

    await waitFor(() => {
      expect(favoritesApi.removeCalls).toEqual(['drm_1']);
    });
    expect(await screen.findByTestId('favorite-removed')).toBeDefined();
  });

  // There is no title to name, so the label says which kind of row it is rather than nothing at all.
  it('names the row in the button’s accessible name without a title to use', () => {
    renderSurface(<FavoriteRow entry={unresolvedEntry()} />);

    expect(screen.getByTestId('favorite-remove').getAttribute('aria-label')).toBe(
      'Remove this unavailable drama from your favourites',
    );
  });

  it('says a resolved row is resolved, so the two stay distinguishable', () => {
    renderSurface(<FavoriteRow entry={entry()} />);

    expect(screen.getByTestId('favorite-row').getAttribute('data-row-resolved')).toBe('true');
    expect(screen.queryByTestId('favorite-unresolved')).toBeNull();
  });
});

describe('un-following from the row', () => {
  it('sends a DELETE for this drama and nothing else', async () => {
    const favoritesApi = stubFavoritesApi();
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));

    await waitFor(() => {
      expect(favoritesApi.removeCalls).toEqual(['drm_1']);
    });
    expect(favoritesApi.addCalls).toEqual([]);
  });

  /**
   * The row stays. Deleting it from the list would move the viewer's scroll position at the moment
   * they touched it, and the list cannot be reassembled without re-probing twenty dramas — so an
   * accidental tap would be unrecoverable.
   */
  it('keeps the row in place, un-followed, with an undo', async () => {
    renderSurface(<FavoriteRow entry={entry()} />);

    fireEvent.click(screen.getByTestId('favorite-remove'));

    expect(await screen.findByTestId('favorite-removed')).toBeDefined();
    expect(screen.getByTestId('favorite-row').getAttribute('data-row-state')).toBe('REMOVED');
    expect(screen.getByTestId('favorite-undo')).toBeDefined();
    expect(screen.queryByTestId('favorite-remove')).toBeNull();
  });

  it('follows again with a PUT when the undo is pressed', async () => {
    const favoritesApi = stubFavoritesApi();
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));
    fireEvent.click(await screen.findByTestId('favorite-undo'));

    await waitFor(() => {
      expect(favoritesApi.addCalls).toEqual(['drm_1']);
    });
    expect(await screen.findByTestId('favorite-remove')).toBeDefined();
    expect(screen.getByTestId('favorite-row').getAttribute('data-row-state')).toBe('FOLLOWED');
  });

  // Two writes racing for one row means the loser decides what the viewer ends up following.
  it('sends one request however many times the button is pressed', async () => {
    const favoritesApi = stubFavoritesApi();
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    const button = screen.getByTestId('favorite-remove');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('favorite-removed')).toBeDefined();
    });
    expect(favoritesApi.removeCalls).toEqual(['drm_1']);
  });
});

describe('a favourite write that failed', () => {
  it('leaves the row followed when the un-follow was refused, rather than claiming it worked', async () => {
    const favoritesApi = stubFavoritesApi({ remove: () => err(offlineFailure()) });
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));

    await waitFor(() => {
      expect(screen.getByTestId('favorite-row-note')).toBeDefined();
    });
    expect(screen.getByTestId('favorite-row').className).not.toContain('favorite-row--removed');
    expect(screen.queryByTestId('favorite-removed')).toBeNull();
  });

  it('offers the action again when a retry could answer differently', async () => {
    const favoritesApi = stubFavoritesApi({
      remove: (_dramaId, index) => (index === 0 ? err(offlineFailure()) : ok(undefined)),
    });
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));
    fireEvent.click(await screen.findByTestId('favorite-retry'));

    expect(await screen.findByTestId('favorite-removed')).toBeDefined();
    expect(favoritesApi.removeCalls).toEqual(['drm_1', 'drm_1']);
  });

  /**
   * `PUT` is the one favourite request the catalogue can refuse, so a withdrawn drama is reachable
   * from the undo and only from there. The row stays removed and is offered no retry: a button that
   * cannot succeed is worse than none.
   */
  it('explains a withdrawn drama on the undo and offers no retry', async () => {
    const favoritesApi = stubFavoritesApi({
      add: () => err(favoritesHttpFailure(410, { code: 'CONTENT_OFFLINE' })),
    });
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));
    fireEvent.click(await screen.findByTestId('favorite-undo'));

    const note = await screen.findByTestId('favorite-row-note');
    expect(note.textContent).toContain('no longer available');
    expect(screen.queryByTestId('favorite-retry')).toBeNull();
    expect(screen.getByTestId('favorite-row').getAttribute('data-row-failure')).toBe('GONE');
  });

  // Our missing feature, and it says so rather than telling the viewer their drama is gone.
  it('keeps an undeployed endpoint apart from a withdrawn drama', async () => {
    const favoritesApi = stubFavoritesApi({
      remove: () => err(favoritesHttpFailure(404, { code: 'COMMON_RESOURCE_NOT_FOUND' })),
    });
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));

    const note = await screen.findByTestId('favorite-row-note');
    expect(note.textContent).toContain('not available yet');
    expect(note.textContent).not.toContain('no longer available');
    expect(screen.getByTestId('favorite-row').getAttribute('data-row-failure')).toBe('UNAVAILABLE');
  });

  /**
   * A `401` at the row is not an error and not a loss: nothing failed, the viewer is simply not
   * known. The prompt is a silent-login retry in place, and it re-runs the action they asked for.
   */
  it('offers a sign-in at the row and re-runs the action once a session exists', async () => {
    const favoritesApi = stubFavoritesApi({
      remove: (_dramaId, index) => (index === 0 ? err(favoritesHttpFailure(401)) : ok(undefined)),
    });
    renderSurface(<FavoriteRow entry={entry()} />, {
      favoritesApi,
      session: stubSession({ signInSucceeds: true }),
    });

    fireEvent.click(screen.getByTestId('favorite-remove'));
    fireEvent.click(await screen.findByTestId('sign-in'));

    expect(await screen.findByTestId('favorite-removed')).toBeDefined();
    expect(favoritesApi.removeCalls).toEqual(['drm_1', 'drm_1']);
  });

  it('shows no error state for a missing session', async () => {
    const favoritesApi = stubFavoritesApi({ remove: () => err(favoritesHttpFailure(401)) });
    renderSurface(<FavoriteRow entry={entry()} />, { favoritesApi });

    fireEvent.click(screen.getByTestId('favorite-remove'));

    expect(await screen.findByTestId('favorite-row-sign-in')).toBeDefined();
    expect(screen.queryByTestId('favorite-row-note')).toBeNull();
    expect(screen.queryByTestId('favorite-retry')).toBeNull();
  });
});
