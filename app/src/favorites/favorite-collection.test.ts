import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { FAVORITES_PAGE_LIMIT, loadFavoritesPage } from './favorite-collection';
import { dramaSummary, httpFailure } from '../testing/catalog-fixtures';
import { favoriteListItem, favoritesPage } from '../testing/favorites-fixtures';
import type { FavoritesPageSource } from './favorite-collection';

const AUGUST_1 = '2026-08-01T00:00:00.000Z';

function source(overrides: Partial<FavoritesPageSource> = {}): FavoritesPageSource {
  return {
    listFavorites: () => Promise.resolve(ok(favoritesPage([]))),
    ...overrides,
  };
}

describe('loading a page of favourites', () => {
  it('asks the list endpoint rather than probing dramas one at a time', async () => {
    const listFavorites = vi.fn(() => Promise.resolve(ok(favoritesPage(['drm_1', 'drm_2']))));

    const result = await loadFavoritesPage(source({ listFavorites }), undefined);

    expect(listFavorites).toHaveBeenCalledTimes(1);
    expect(result.ok ? result.value.items.map((entry) => entry.dramaId) : null).toEqual([
      'drm_1',
      'drm_2',
    ]);
  });

  it('asks for the page size the endpoint documents, and no cursor on the first page', async () => {
    const listFavorites = vi.fn(() => Promise.resolve(ok(favoritesPage([]))));

    await loadFavoritesPage(source({ listFavorites }), undefined);

    expect(listFavorites).toHaveBeenCalledWith({ limit: FAVORITES_PAGE_LIMIT });
  });

  it('passes a cursor on for a further page', async () => {
    const listFavorites = vi.fn(() => Promise.resolve(ok(favoritesPage([]))));

    await loadFavoritesPage(source({ listFavorites }), 'cursor_2');

    expect(listFavorites).toHaveBeenCalledWith({ limit: FAVORITES_PAGE_LIMIT, cursor: 'cursor_2' });
  });

  /**
   * The order is the endpoint's: `favoritedAt` descending with the drama id as a tiebreak, applied
   * inside the keyset the cursor pages through. A client-side re-sort would be a second opinion about
   * an order the pages are already cut along, and two pages sorted independently do not concatenate.
   */
  it('keeps the server’s order rather than re-sorting the rows', async () => {
    const result = await loadFavoritesPage(
      source({
        listFavorites: () => Promise.resolve(ok(favoritesPage(['drm_c', 'drm_a', 'drm_b']))),
      }),
      undefined,
    );

    expect(result.ok ? result.value.items.map((entry) => entry.dramaId) : null).toEqual([
      'drm_c',
      'drm_a',
      'drm_b',
    ]);
  });

  it('carries the paging envelope through untouched', async () => {
    const result = await loadFavoritesPage(
      source({
        listFavorites: () => Promise.resolve(ok(favoritesPage(['drm_1'], 'cursor_2'))),
      }),
      undefined,
    );

    expect(result.ok ? result.value.pageInfo : null).toEqual({
      nextCursor: 'cursor_2',
      hasMore: true,
    });
  });

  it('carries the follow date without displaying or sorting by it', async () => {
    const result = await loadFavoritesPage(
      source({
        listFavorites: () =>
          Promise.resolve(
            ok({
              items: [favoriteListItem('drm_1', AUGUST_1)],
              pageInfo: { nextCursor: null, hasMore: false },
            }),
          ),
      }),
      undefined,
    );

    expect(result.ok ? result.value.items[0]?.favoritedAt : null).toBe(AUGUST_1);
  });

  /**
   * The list read's failure is the page's failure, unchanged. A `401` is a missing session and not an
   * empty list, and that split belongs to `data/session-read.ts` — reported as an empty page here, it
   * would tell a viewer whose token expired that their favourites were thrown away.
   */
  it('passes the list read’s failure through rather than reporting no favourites', async () => {
    const failure = httpFailure(401);
    const result = await loadFavoritesPage(
      source({ listFavorites: () => Promise.resolve(err(failure)) }),
      undefined,
    );

    expect(result).toEqual({ ok: false, error: failure });
  });

  it('resolves no drama at all for an empty list', async () => {
    const result = await loadFavoritesPage(source(), undefined);

    expect(result.ok ? result.value.items : null).toEqual([]);
  });
});

/**
 * The list now carries the catalogue's summary on each row. What must not happen is for a missing
 * summary to decide *which* favourites the viewer has: `drama: null` subtracts a card and never a
 * row (W8-a).
 */
describe('the projected drama on each row', () => {
  it('attaches the summary the list already carried', async () => {
    const summary = dramaSummary({ id: 'drm_1', title: 'The Heiress Returns' });
    const result = await loadFavoritesPage(
      source({
        listFavorites: () =>
          Promise.resolve(
            ok({
              items: [favoriteListItem('drm_1', AUGUST_1, summary)],
              pageInfo: { nextCursor: null, hasMore: false },
            }),
          ),
      }),
      undefined,
    );

    expect(result.ok ? result.value.items[0]?.drama : null).toEqual(summary);
  });

  /**
   * The row keeps its place and its un-follow button. The server leaves a delisted drama in the list
   * on purpose — the row is why the drama is on the viewer's screen — and dropping it here would put
   * back exactly the hole the fan-out was deleted for.
   */
  it('keeps a row whose drama the catalogue could not project', async () => {
    const result = await loadFavoritesPage(
      source({
        listFavorites: () =>
          Promise.resolve(
            ok({
              items: [
                favoriteListItem('drm_1'),
                favoriteListItem('drm_gone', null, null),
                favoriteListItem('drm_2'),
              ],
              pageInfo: { nextCursor: null, hasMore: false },
            }),
          ),
      }),
      undefined,
    );

    expect(result.ok ? result.value.items.map((entry) => entry.dramaId) : null).toEqual([
      'drm_1',
      'drm_gone',
      'drm_2',
    ]);
    expect(result.ok ? result.value.items[1]?.drama : undefined).toBeNull();
  });
});
