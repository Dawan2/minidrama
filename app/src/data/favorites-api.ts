import type { Result } from '@minidrama/shared';

import { asRecord, narrow } from './narrow';
import type { ApiFailure } from './failure';
import type { HttpReader, HttpWriter } from './http';

/**
 * The favourite surface, as the client sees it: three verbs on one path.
 *
 * ```
 * GET    /v1/dramas/{dramaId}/favorite   -> 200 FavoriteState
 * PUT    /v1/dramas/{dramaId}/favorite   -> 204   idempotent
 * DELETE /v1/dramas/{dramaId}/favorite   -> 204   idempotent
 * ```
 *
 * All three are session-scoped and refuse by default: one `401 AUTH_REQUIRED` covers a missing, a
 * rejected and an unverifiable credential alike, because the client's move — silent login, retry
 * once — is the same in all three cases (`docs/handoff/w2-work-j.md` §1).
 *
 * The three verbs are deliberately *not* consistent with each other, and a caller has to know it
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
 * Kept apart from `CatalogApi` for the same reason `HistoryApi` is: the catalogue reads are
 * anonymous-capable and these are not, and folding a session-scoped write into the interface every
 * anonymous surface depends on would grow every catalogue screen's test double a method about
 * identity that no catalogue screen can produce.
 *
 * **The server on this branch does not implement these endpoints.** There is no discovery module
 * under `server/` here — it lands with `cursor/w2-work-j-acf5` — so a request today answers
 * `404 COMMON_RESOURCE_NOT_FOUND` from the not-found handler. That is not a client bug and it must
 * not render as one; `presentSessionReadFailure` is what keeps it out of the error states.
 */

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

export interface FavoritesApi {
  readFavorite(dramaId: string): Promise<Result<FavoriteState, ApiFailure>>;
  /** Follow. Idempotent, and the one favourite request the catalogue can refuse. */
  addFavorite(dramaId: string): Promise<Result<void, ApiFailure>>;
  /** Un-follow. Idempotent, and documented never to fail on the catalogue's account. */
  removeFavorite(dramaId: string): Promise<Result<void, ApiFailure>>;
}

export function createFavoritesApi(http: HttpReader & HttpWriter): FavoritesApi {
  return {
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
