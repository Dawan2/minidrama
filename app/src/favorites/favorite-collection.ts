import { ok } from '@minidrama/shared';
import type { DramaSummary, Page, Result } from '@minidrama/shared';

import type { ApiFailure } from '../data/failure';
import type { FavoriteList, FavoriteListItem, FavoritesListRequest } from '../data/favorites-api';

/**
 * The viewer's favourites, as a page of rows the screen can render.
 *
 * The list endpoint answers with ids, follow timestamps, and the catalogue's `DramaSummary` (or
 * `null`) on each row — `docs/plan/cycle-3-backlog.md` C3-07. The client no longer fans out a
 * drama read per favourite: that N+1 is what the projection deleted.
 *
 * Two properties of a row still matter, and they did not move:
 *
 * 1. **the list is the list.** Which dramas are on the screen, and in what order, is decided by the
 *    endpoint. A drama the catalogue cannot summarise subtracts a *card* from the screen and never
 *    a *row*;
 * 2. **a row whose `drama` is `null` keeps its place and its un-follow button.** The server keeps a
 *    delisted drama in the list on purpose — the row is why the drama is on the viewer's screen, and
 *    hiding it leaves a favourite they can neither see nor clear (S68, W8-a).
 *
 * The order is the server's: `favoritedAt` descending with the drama id as a tiebreak, applied
 * inside the keyset the cursor pages through (S61). A client-side re-sort would be a second opinion
 * about an order the pages are already cut along, and two pages sorted independently do not
 * concatenate.
 */

/** One favourite, ready to render. Same shape as the narrowed list item; named for the screen. */
export interface FavoriteEntry {
  readonly dramaId: string;
  /**
   * The drama, or `null` when the catalogue did not project it — a delisted title, or an id the
   * store no longer has. The row is still the viewer's favourite either way, which is why this is a
   * nullable field rather than a reason to drop the entry.
   */
  readonly drama: DramaSummary | null;
  /**
   * When the viewer first followed it, ISO 8601, or `null` when the row carried no usable timestamp.
   * Carried and never used: it is the server's sort key, and "following since 3 August" is a fact the
   * client would be quoting from a clock it does not own.
   */
  readonly favoritedAt: string | null;
}

/**
 * How many favourites a page asks for.
 *
 * The endpoint's own default (S69), stated rather than left implicit so the page size the screen
 * pages at is visible in the client too.
 */
export const FAVORITES_PAGE_LIMIT = 20;

/**
 * The list read a page of this screen needs, as a function rather than as the whole client.
 */
export interface FavoritesPageSource {
  readonly listFavorites: (
    request: FavoritesListRequest,
  ) => Promise<Result<FavoriteList, ApiFailure>>;
  readonly limit?: number;
}

/**
 * One page of favourites: the list read, then the rows it named, in the order it named them.
 *
 * The list read's failure is the page's failure, unchanged — a `401` is a missing session and not an
 * empty list, and that split is `data/session-read.ts`'s to make. An unresolved `drama` is not a
 * page failure at all: it lands in the row it belongs to.
 */
export async function loadFavoritesPage(
  source: FavoritesPageSource,
  cursor: string | undefined,
): Promise<Result<Page<FavoriteEntry>, ApiFailure>> {
  const list = await source.listFavorites({
    limit: source.limit ?? FAVORITES_PAGE_LIMIT,
    ...(cursor === undefined ? {} : { cursor }),
  });

  if (!list.ok) {
    return list;
  }

  return ok({ items: list.value.items.map(toFavoriteEntry), pageInfo: list.value.pageInfo });
}

function toFavoriteEntry(item: FavoriteListItem): FavoriteEntry {
  return {
    dramaId: item.dramaId,
    drama: item.drama,
    favoritedAt: item.favoritedAt,
  };
}
