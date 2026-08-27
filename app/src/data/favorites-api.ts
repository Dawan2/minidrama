import type { Page, Result } from '@minidrama/shared';

import { asRecord, narrow, narrowPage } from './narrow';
import type { ApiFailure } from './failure';
import type { HttpClient } from './http';

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
 * The list read follows the same rule as the withdrawn row it may contain: it applies no publication
 * check, so a drama that has since been delisted stays in the viewer's list
 * (`docs/handoff/w8-work-favorites-list.md` decision S68). What that renders as is this client's
 * caller's problem, not this client's — see `favorites/favorite-collection.ts`.
 *
 * Kept apart from `CatalogApi` for the same reason `HistoryApi` is: the catalogue reads are
 * anonymous-capable and these are not, and folding a session-scoped write into the interface every
 * anonymous surface depends on would grow every catalogue screen's test double a method about
 * identity that no catalogue screen can produce.
 *
 * **The server on this branch does not implement these endpoints.** There is no discovery module
 * under `server/` here — the verbs land with `cursor/w2-work-j-acf5` and the list with
 * `cursor/w8-work-favorites-list-a666` — so a request today answers `404 COMMON_RESOURCE_NOT_FOUND`
 * from the not-found handler. That is not a client bug and it must not render as one;
 * `presentSessionReadFailure` is what keeps it out of the error states.
 */

export const FAVORITES_LIST_PATH = '/v1/users/me/favorites';

export function favoriteEndpoint(dramaId: string): string {
  return `/v1/dramas/${encodeURIComponent(dramaId)}/favorite`;
}

/**
 * Whether this viewer follows this drama.
 *
 * Copied from `packages/shared/src/discovery.ts` on `cursor/w2-work-j-acf5` rather than imported,
 * because that package does not carry the type on this branch and merging a server slot to obtain
 * one type is not a trade this screen is allowed to make. The copy is field-for-field and the
 * integrator's move is one line: delete this and re-export `FavoriteState` from `@minidrama/shared`
 * — see `docs/handoff/w7-work-favorites.md` §5.
 */
export interface FavoriteState {
  readonly dramaId: string;
  readonly favorited: boolean;
  /**
   * Server time when the favourite was *first* recorded, ISO 8601. Absent when `favorited` is
   * false. It does not move on a repeated `PUT`: "following since" is a fact about the viewer's
   * history, and a duplicate request from a double-tapped button is not a new decision.
   */
  readonly favoritedAt?: string;
}

/**
 * One row of the viewer's favourites list.
 *
 * Copied from `packages/shared/src/discovery.ts` on `cursor/w8-work-favorites-list-a666` for the
 * same reason `FavoriteState` is copied from slot J: that package does not carry the type on this
 * branch, and merging a server slot to obtain one interface is not a trade a client screen is
 * allowed to make while an integrator is in flight.
 *
 * There is **one deliberate divergence** from the copy, and it is the field below. The wire shape
 * declares `readonly favoritedAt: string` — always present, because a row only exists because it was
 * recorded — and this client widens it to `| null` because it reads the field tolerantly. See the
 * note there for why, and `docs/handoff/w8-work-favorites-consume.md` §5 for the integrator's move.
 *
 * It carries the drama *identifier* and nothing about the drama. `docs/12-api-contracts.md` §4.3
 * specifies the endpoint as a `DramaSummary` page and it will become one (that slot's S60), so a row
 * on this screen is resolved through the catalogue in the meantime —
 * `favorites/favorite-collection.ts` owns that step and states its cost.
 */
export interface FavoriteListItem {
  readonly dramaId: string;
  /**
   * Server time when the favourite was first recorded, ISO 8601, or `null` when the row carried no
   * usable one.
   *
   * It is the server's sort key and the client neither reorders by it nor displays it, which is
   * exactly why it is read tolerantly: rejecting a page — and with it the viewer's whole list —
   * over a field that drives no decision here would cost them the screen to protect nothing. The
   * watch-history row reads its `watchedAt` the same way and for the same reason.
   */
  readonly favoritedAt: string | null;
}

/**
 * A page of the viewer's favourites, most recently followed first.
 *
 * W8's wire shape is its own interface — `{ items, pageInfo }` — and it is field-for-field the
 * `Page<T>` envelope this client already has from `@minidrama/shared`, down to `nextCursor` being
 * `null` rather than absent on the final page. It is expressed as that envelope rather than copied a
 * third time so the favourites list pages through `usePagedResource` like every other list, instead
 * of arriving with a second opinion about what a page is.
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

export function createFavoritesApi(http: HttpClient): FavoritesApi {
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
 * Strict about `favorited`, tolerant about everything else.
 *
 * `favorited` is the whole answer, and it is a boolean rather than a presence check on purpose: a
 * response that omitted it, or sent `"true"`, would be read as "not followed" by a default and the
 * viewer's row would silently vanish from their own list. So a missing or non-boolean `favorited`
 * rejects the response, which reaches the surface as `MALFORMED` and a retry rather than as a lie.
 *
 * `dramaId` is checked for *agreement* rather than for presence. The client already knows which
 * drama it asked about, and a response that answers about a different one is not a field to
 * default — it is the one shape of bug (a mis-keyed cache, a proxy serving another viewer's row)
 * that would put someone else's favourite on this viewer's screen.
 *
 * `favoritedAt` is read tolerantly because it drives no decision: it is the sort key of the
 * favourites list, and a row that arrives without one sorts last instead of costing the viewer the
 * whole list.
 */
/**
 * Strict about `dramaId`, tolerant about the timestamp.
 *
 * The id *is* the row: it is what resolves to a card, what the un-follow button sends, and what
 * keys the list in React. A row without one is not a row to default, so it rejects the response —
 * which, as everywhere else in this client, costs the page rather than the item
 * (`narrowPage`). That is the right trade here in a way it would not be for a feed: a favourites
 * list silently one row short is indistinguishable from a drama the viewer never followed.
 *
 * `favoritedAt` drives no decision on this screen: the order is the server's and the value is never
 * displayed. So an unusable one becomes `null` rather than costing the viewer the whole list.
 */
export function narrowFavoriteListItem(value: unknown): FavoriteListItem | null {
  const record = asRecord(value);
  if (record === null) return null;

  const dramaId = record['dramaId'];
  if (typeof dramaId !== 'string' || dramaId === '') return null;

  const favoritedAt = record['favoritedAt'];

  return {
    dramaId,
    favoritedAt: typeof favoritedAt === 'string' && favoritedAt !== '' ? favoritedAt : null,
  };
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
