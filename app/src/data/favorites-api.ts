import type {
  DramaSummary,
  FavoriteListItem as WireFavoriteListItem,
  FavoriteState,
  Page,
  Result,
} from '@minidrama/shared';

import { asRecord, narrow, narrowPage } from './narrow';
import { narrowDramaSummary } from './catalog-api';
import type { ApiFailure } from './failure';
import type { HttpReader, HttpWriter } from './http';

export type { FavoriteState };

/**
 * The favourite surface, as the client sees it: one list, and three verbs on one path.
 *
 * ```
 * GET    /v1/users/me/favorites          -> 200 FavoriteList      paged
 * GET    /v1/dramas/{dramaId}/favorite   -> 200 FavoriteState
 * PUT    /v1/dramas/{dramaId}/favorite   -> 204   idempotent
 * DELETE /v1/dramas/{dramaId}/favorite   -> 204   idempotent
 * ```
 *
 * All four are session-scoped and refuse by default: one `401 AUTH_REQUIRED` covers a missing, a
 * rejected and an unverifiable credential alike, because the client's move — silent login, retry
 * once — is the same in all three cases (`docs/handoff/w2-work-j.md` §1).
 *
 * The per-drama verbs are deliberately *not* consistent with each other, and a caller has to know it
 * (that handoff's decision S45):
 *
 *   - **`PUT` consults the catalogue.** It answers `404 CONTENT_NOT_FOUND` for a drama that was
 *     never published and `410 CONTENT_OFFLINE` for one that was withdrawn. So re-following a drama
 *     is the one favourite request that can fail for a reason the viewer cannot fix;
 *   - **`GET` does not.** A viewer can always read their own row for a drama that has since been
 *     withdrawn — that row is *why* the drama is still on their favourites screen;
 *   - **`DELETE` does not, and never fails.** `204` whatever the catalogue says and whether or not
 *     there was a row, so un-following is never the operation that traps a row on the screen.
 *
 * The list read applies no publication filter (S68). A delisted drama arrives as `drama: null` and
 * stays in the page; dropping it here would hide a favourite the viewer can neither see nor clear.
 *
 * Kept apart from `CatalogApi` for the same reason `HistoryApi` is: the catalogue reads are
 * anonymous-capable and these are not, and folding a session-scoped write into the interface every
 * anonymous surface depends on would grow every catalogue screen's test double a method about
 * identity that no catalogue screen can produce.
 */

export const FAVORITES_LIST_PATH = '/v1/users/me/favorites';

export function favoriteEndpoint(dramaId: string): string {
  return `/v1/dramas/${encodeURIComponent(dramaId)}/favorite`;
}

/**
 * One row of the viewer's favourites list, as this client stores it after narrowing.
 *
 * **Decision (C3-07 / G-C1).** The wire type in `@minidrama/shared` requires `favoritedAt: string`
 * and carries `drama: DramaSummary | null`. This client deletes the duplicated interfaces
 * (`FavoriteState` is a re-export) and keeps one deliberate widening: `favoritedAt` is
 * `string | null` after narrowing, because the field drives no decision on SCR-08 (the order is
 * the server's; the value is displayed nowhere) and rejecting a page over it would cost the viewer
 * their list. A malformed `drama` object still rejects the row — that one *is* the card.
 */
export type FavoriteListItem = Omit<WireFavoriteListItem, 'favoritedAt'> & {
  readonly favoritedAt: string | null;
};

/**
 * A page of the viewer's favourites, most recently followed first.
 *
 * W8's wire shape is `{ items, pageInfo }`, field-for-field the `Page<T>` envelope this client
 * already has from `@minidrama/shared`, down to `nextCursor` being `null` rather than absent on
 * the final page. It is expressed as that envelope so the favourites list pages through
 * `usePagedResource` like every other list.
 */
export type FavoriteList = Page<FavoriteListItem>;

export interface FavoritesListRequest {
  /** `pageInfo.nextCursor`, echoed verbatim. Opaque, and never parsed. */
  readonly cursor?: string;
  readonly limit?: number;
}

export interface FavoritesApi {
  /**
   * The viewer's favourites. Paged, and the *whole* list rather than the part of it the client
   * thought to ask about.
   */
  listFavorites(request: FavoritesListRequest): Promise<Result<FavoriteList, ApiFailure>>;
  /**
   * Whether this viewer follows one drama. No longer how the favourites screen is assembled — that
   * was the fan-out `listFavorites` replaced — so it is back to being what it is for: re-reading one
   * row, which is what a favourite button on the drama or feed screen needs.
   */
  readFavorite(dramaId: string): Promise<Result<FavoriteState, ApiFailure>>;
  /** Follow. Idempotent, and the one favourite request the catalogue can refuse. */
  addFavorite(dramaId: string): Promise<Result<void, ApiFailure>>;
  /** Un-follow. Idempotent, and documented never to fail on the catalogue's account. */
  removeFavorite(dramaId: string): Promise<Result<void, ApiFailure>>;
}

export function createFavoritesApi(http: HttpReader & HttpWriter): FavoritesApi {
  return {
    listFavorites: async (request) => {
      const body = await http.getJson(FAVORITES_LIST_PATH, {
        cursor: request.cursor,
        limit: request.limit,
      });
      return body.ok ? narrowPage(body.value, narrowFavoriteListItem) : body;
    },

    readFavorite: async (dramaId) => {
      const body = await http.getJson(favoriteEndpoint(dramaId));
      return body.ok ? narrow(body.value, (value) => narrowFavoriteState(dramaId, value)) : body;
    },

    addFavorite: (dramaId) => http.send('PUT', favoriteEndpoint(dramaId)),

    removeFavorite: (dramaId) => http.send('DELETE', favoriteEndpoint(dramaId)),
  };
}

/**
 * Strict about `dramaId`, tolerant about the timestamp, and honest about `drama`.
 *
 * The id *is* the row: it is what keys the list in React and what the un-follow button sends. A
 * row without one is not a row to default, so it rejects the response — which, as everywhere else
 * in this client, costs the page rather than the item (`narrowPage`). That is the right trade here
 * in a way it would not be for a feed: a favourites list silently one row short is indistinguishable
 * from a drama the viewer never followed.
 *
 * `favoritedAt` drives no decision on this screen: the order is the server's and the value is never
 * displayed. So an unusable one becomes `null` rather than costing the viewer the whole list.
 * That is the G-C1 widening, recorded rather than merged away.
 *
 * `drama` is the card. `null` and a missing key are the unresolved row (W8-a). A present object
 * that is not a summary is malformed — showing a fake card, or dropping the row silently, would
 * both lie — so that rejects the page the same way a missing id does.
 */
export function narrowFavoriteListItem(value: unknown): FavoriteListItem | null {
  const record = asRecord(value);
  if (record === null) return null;

  const dramaId = record['dramaId'];
  if (typeof dramaId !== 'string' || dramaId === '') return null;

  const favoritedAt = record['favoritedAt'];
  const drama = narrowFavoriteDrama(record['drama']);
  if (drama === undefined) return null;

  return {
    dramaId,
    favoritedAt: typeof favoritedAt === 'string' && favoritedAt !== '' ? favoritedAt : null,
    drama,
  };
}

/**
 * `null` / missing → unresolved row. A present non-summary → reject the item (`undefined`).
 */
function narrowFavoriteDrama(value: unknown): DramaSummary | null | undefined {
  if (value === null || value === undefined) return null;
  return narrowDramaSummary(value) ?? undefined;
}

export function narrowFavoriteState(
  requestedDramaId: string,
  value: unknown,
): FavoriteState | null {
  const record = asRecord(value);
  if (record === null) return null;

  if (typeof record['favorited'] !== 'boolean') return null;
  if (record['dramaId'] !== requestedDramaId) return null;

  const favoritedAt = record['favoritedAt'];

  return {
    dramaId: requestedDramaId,
    favorited: record['favorited'],
    ...(typeof favoritedAt === 'string' && favoritedAt !== '' ? { favoritedAt } : {}),
  };
}
