import { ok } from '@minidrama/shared';
import type { DramaSummary, Page, Result } from '@minidrama/shared';

import type { ApiFailure } from '../data/failure';
import type { FavoriteList, FavoriteListItem, FavoritesListRequest } from '../data/favorites-api';

/**
 * The viewer's favourites, as a page of rows the screen can render.
 *
 * **This module used to fan out.** There was no `GET /v1/users/me/favorites`, so SCR-08 asked a page
 * of the recommendation feed for candidate dramas and then asked, drama by drama, "do you follow this
 * one?". The cost was not the request count: it was that a followed drama outside the candidate page
 * was **not on the viewer's favourites screen at all**, which is a wrong list rather than a slow one
 * (`docs/handoff/w7-work-favorites.md` G-F2). The list endpoint closes that, so the fan-out, the
 * candidate source, the partial-answer state and the coverage notice that disclosed the limit are all
 * gone.
 *
 * What is left is one paged read and one honest gap. The list carries drama *ids* and follow
 * timestamps and nothing about the dramas themselves — `DramaSummary` is a catalogue view object and
 * the endpoint deliberately does not invent a partial copy of it
 * (`docs/handoff/w8-work-favorites-list.md` decision S60) — so a row is resolved through the
 * catalogue's own drama read before it can be drawn. Two properties of that step matter:
 *
 * 1. **the list is the list.** Which dramas are on the screen, and in what order, is decided by the
 *    endpoint. Resolving is a rendering step, so a drama that will not resolve subtracts a *card*
 *    from the screen and never a *row*;
 * 2. **a row that will not resolve keeps its place and its un-follow button.** The server keeps a
 *    delisted drama in the list on purpose — the row is why the drama is on the viewer's screen, and
 *    hiding it leaves a favourite they can neither see nor clear (that slot's S68, and the question
 *    it left to this screen as `W8-a`). Dropping it here would re-introduce exactly the hole the
 *    fan-out was deleted for.
 *
 * The order is the server's now: `favoritedAt` descending with the drama id as a tiebreak, applied
 * inside the keyset the cursor pages through (S61). A client-side re-sort would be a second opinion
 * about an order the pages are already cut along, and two pages sorted independently do not
 * concatenate.
 */

/** One favourite, ready to render. */
export interface FavoriteEntry {
  readonly dramaId: string;
  /**
   * The drama, or `null` when the catalogue did not resolve it — a delisted title, or a read that
   * failed. The row is still the viewer's favourite either way, which is why this is a nullable field
   * rather than a reason to drop the entry.
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
 * How many drama reads are in flight at once while a page is resolved.
 *
 * Not "all of them". A WebView holds around six connections per host, so a whole page requested at
 * once means the tail queues in the browser — and the client's 10s timeout starts when the request is
 * *made*, not when it is sent, so a queued request can time out having never left the device
 * (`data/http.ts`). Four leaves connections free for the cover images the rows are about to ask for,
 * which is the difference between a list that appears and a list that appears blank.
 */
export const FAVORITE_RESOLVE_CONCURRENCY = 4;

/**
 * How many favourites a page asks for.
 *
 * The endpoint's own default (S69), stated rather than left implicit so the page size the screen
 * pages at is visible in the client too. It is also the resolve cost of one page: twenty favourites
 * is twenty drama reads until the projection lands (§5 of this slot's handoff).
 */
export const FAVORITES_PAGE_LIMIT = 20;

/**
 * The two reads a page of this screen needs, as functions rather than as the whole clients.
 *
 * `fetchDrama` is typed to `DramaSummary` although the catalogue answers `DramaDetail`: a detail
 * response *is* a summary plus fields this screen does not draw, and asking for the narrower type is
 * what keeps a row from quietly starting to depend on one.
 */
export interface FavoritesPageSource {
  readonly listFavorites: (
    request: FavoritesListRequest,
  ) => Promise<Result<FavoriteList, ApiFailure>>;
  readonly fetchDrama: (dramaId: string) => Promise<Result<DramaSummary, ApiFailure>>;
  readonly limit?: number;
  readonly concurrency?: number;
}

/**
 * One page of favourites: the list read, then the rows it named.
 *
 * The list read's failure is the page's failure, unchanged — a `401` is a missing session and not an
 * empty list, and that split is `data/session-read.ts`'s to make. A *resolution* failure is not a
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

  const items = await resolveFavoriteEntries(
    list.value.items,
    source.fetchDrama,
    source.concurrency,
  );
  return ok({ items, pageInfo: list.value.pageInfo });
}

/**
 * The rows of one page, in the order the server sent them, each with its drama if the catalogue
 * had one.
 *
 * Resolution is batched rather than serialised, and the batches are collected in order rather than in
 * the order they resolve: the order is the endpoint's answer, and a list that reorders itself
 * according to which drama read came back first moves a row out from under the viewer's finger.
 */
export async function resolveFavoriteEntries(
  items: readonly FavoriteListItem[],
  fetchDrama: (dramaId: string) => Promise<Result<DramaSummary, ApiFailure>>,
  concurrency = FAVORITE_RESOLVE_CONCURRENCY,
): Promise<readonly FavoriteEntry[]> {
  const bound = Math.max(1, concurrency);
  const entries: FavoriteEntry[] = [];

  for (let start = 0; start < items.length; start += bound) {
    const batch = items.slice(start, start + bound);

    const resolved = await Promise.all(
      batch.map(async (item) => {
        const drama = await fetchDrama(item.dramaId);
        return {
          dramaId: item.dramaId,
          drama: drama.ok ? drama.value : null,
          favoritedAt: item.favoritedAt,
        };
      }),
    );

    entries.push(...resolved);
  }

  return entries;
}
