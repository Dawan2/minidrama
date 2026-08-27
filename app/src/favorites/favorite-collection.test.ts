import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { DramaSummary, Result } from '@minidrama/shared';

import {
  FAVORITES_PAGE_LIMIT,
  loadFavoritesPage,
  resolveFavoriteEntries,
} from './favorite-collection';
import { dramaSummary, httpFailure, offlineFailure } from '../testing/catalog-fixtures';
import { favoriteListItem, favoritesPage } from '../testing/favorites-fixtures';
import type { ApiFailure } from '../data/failure';
import type { FavoritesPageSource } from './favorite-collection';

const AUGUST_1 = '2026-08-01T00:00:00.000Z';

/** Resolves every drama asked about, so a test can be about something else. */
function resolvesEverything(dramaId: string): Promise<Result<DramaSummary, ApiFailure>> {
  return Promise.resolve(ok(dramaSummary({ id: dramaId, title: dramaId })));
}

function source(overrides: Partial<FavoritesPageSource> = {}): FavoritesPageSource {
  return {
    listFavorites: () => Promise.resolve(ok(favoritesPage([]))),
    fetchDrama: resolvesEverything,
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
    const fetchDrama = vi.fn(resolvesEverything);

    const result = await loadFavoritesPage(source({ fetchDrama }), undefined);

    expect(result.ok ? result.value.items : null).toEqual([]);
    expect(fetchDrama).not.toHaveBeenCalled();
  });
});

/**
 * The list carries ids, so a row is resolved through the catalogue before it can be drawn. What must
 * not happen is for that step to decide *which* favourites the viewer has: resolving is a rendering
 * step, and a drama that will not resolve subtracts a card and never a row.
 */
describe('resolving the rows of a page', () => {
  it('asks the catalogue about each row in the list’s order', async () => {
    const fetchDrama = vi.fn(resolvesEverything);

    await resolveFavoriteEntries(
      [favoriteListItem('drm_1'), favoriteListItem('drm_2'), favoriteListItem('drm_3')],
      fetchDrama,
    );

    expect(fetchDrama.mock.calls.map(([id]) => id)).toEqual(['drm_1', 'drm_2', 'drm_3']);
  });

  it('attaches the drama the catalogue answered with', async () => {
    const entries = await resolveFavoriteEntries([favoriteListItem('drm_1')], resolvesEverything);

    expect(entries[0]?.drama?.id).toBe('drm_1');
  });

  /**
   * The row keeps its place and its un-follow button. The server leaves a delisted drama in the list
   * on purpose — the row is why the drama is on the viewer's screen — and dropping it here would put
   * back exactly the hole the fan-out was deleted for.
   */
  it('keeps a row whose drama the catalogue could not resolve', async () => {
    const entries = await resolveFavoriteEntries(
      [favoriteListItem('drm_1'), favoriteListItem('drm_gone'), favoriteListItem('drm_2')],
      (dramaId) =>
        dramaId === 'drm_gone'
          ? Promise.resolve(err(httpFailure(410)))
          : resolvesEverything(dramaId),
    );

    expect(entries.map((entry) => entry.dramaId)).toEqual(['drm_1', 'drm_gone', 'drm_2']);
    expect(entries[1]?.drama).toBeNull();
  });

  it('keeps a row whose drama read merely failed, for the same reason', async () => {
    const entries = await resolveFavoriteEntries([favoriteListItem('drm_1')], () =>
      Promise.resolve(err(offlineFailure())),
    );

    expect(entries).toEqual([{ dramaId: 'drm_1', drama: null, favoritedAt: null }]);
  });

  /**
   * A WebView holds around six connections per host, and the client's 10s timeout starts when the
   * request is made rather than when it is sent — so a whole page requested at once means the tail can
   * time out having never left the device.
   */
  it('bounds the number of drama reads in flight', async () => {
    let inFlight = 0;
    let peak = 0;

    await resolveFavoriteEntries(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => favoriteListItem(id)),
      async (dramaId) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return ok(dramaSummary({ id: dramaId }));
      },
      3,
    );

    expect(peak).toBe(3);
  });

  /**
   * Rows are collected in the list's order and not in the order the reads resolve. A list that
   * reorders itself according to which drama came back first moves a row out from under the viewer's
   * finger.
   */
  it('keeps the order of the rows when a later read resolves first', async () => {
    const entries = await resolveFavoriteEntries(
      [favoriteListItem('drm_slow'), favoriteListItem('drm_fast')],
      async (dramaId) => {
        if (dramaId === 'drm_slow') {
          await Promise.resolve();
          await Promise.resolve();
        }
        return ok(dramaSummary({ id: dramaId }));
      },
    );

    expect(entries.map((entry) => entry.dramaId)).toEqual(['drm_slow', 'drm_fast']);
  });

  it('carries each row’s follow date onto its entry', async () => {
    const entries = await resolveFavoriteEntries(
      [favoriteListItem('drm_1', AUGUST_1), favoriteListItem('drm_2')],
      resolvesEverything,
    );

    expect(entries.map((entry) => entry.favoritedAt)).toEqual([AUGUST_1, null]);
  });
});
