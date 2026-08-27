import { ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import { page } from './catalog-fixtures';
import type { ApiFailure } from '../data/failure';
import type {
  FavoriteList,
  FavoriteListItem,
  FavoriteState,
  FavoritesApi,
  FavoritesListRequest,
} from '../data/favorites-api';

/**
 * Test doubles for the favourite endpoints.
 *
 * Test-only, like everything in this directory: `import-hygiene.test.ts` fails the build if a screen
 * ever imports from here.
 *
 * The stub implements `FavoritesApi`, the seam the screen depends on, rather than stubbing `fetch`.
 * The screen's states are a property of the screen; the status codes behind them are interpreted in
 * exactly one place (`data/session-read.ts`, `favorites/favorite-action.ts`) and tested there.
 */

/** A row the viewer follows. `favoritedAt` is the favourites list's sort key. */
export function followedState(dramaId: string, favoritedAt: string): FavoriteState {
  return { dramaId, favorited: true, favoritedAt };
}

/** A drama the viewer does not follow: a complete `200` answer, not an error. */
export function unfollowedState(dramaId: string): FavoriteState {
  return { dramaId, favorited: false };
}

/** One row of the list endpoint's answer: an id and a follow date, and nothing about the drama. */
export function favoriteListItem(
  dramaId: string,
  favoritedAt: string | null = null,
): FavoriteListItem {
  return { dramaId, favoritedAt };
}

/** A page of the list endpoint's answer, in the order the server sent it. */
export function favoritesPage(
  dramaIds: readonly string[],
  nextCursor: string | null = null,
): FavoriteList {
  return page(
    dramaIds.map((dramaId) => favoriteListItem(dramaId)),
    nextCursor,
  );
}

export interface StubFavoritesApiScript {
  readonly list?: (
    request: FavoritesListRequest,
    callIndex: number,
  ) => Result<FavoriteList, ApiFailure>;
  readonly read?: (dramaId: string, callIndex: number) => Result<FavoriteState, ApiFailure>;
  readonly add?: (dramaId: string, callIndex: number) => Result<void, ApiFailure>;
  readonly remove?: (dramaId: string, callIndex: number) => Result<void, ApiFailure>;
}

export interface StubFavoritesApi extends FavoritesApi {
  readonly listCalls: readonly FavoritesListRequest[];
  readonly readCalls: readonly string[];
  readonly addCalls: readonly string[];
  readonly removeCalls: readonly string[];
}

/**
 * An unscripted list is empty, an unscripted read answers "not followed" and an unscripted write
 * succeeds.
 *
 * All three defaults are the *server's* documented answer rather than a failure, unlike the catalogue
 * stub's unscripted drama read. A drama that was never scripted is a test that forgot something; a
 * favourite that was never scripted is the ordinary case — most viewers follow nothing — and a test
 * about a row should not have to describe a list to get one.
 */
export function stubFavoritesApi(script: StubFavoritesApiScript = {}): StubFavoritesApi {
  const listCalls: FavoritesListRequest[] = [];
  const readCalls: string[] = [];
  const addCalls: string[] = [];
  const removeCalls: string[] = [];

  return {
    listCalls,
    readCalls,
    addCalls,
    removeCalls,

    listFavorites: (request) => {
      const index = listCalls.length;
      listCalls.push(request);
      return Promise.resolve(script.list?.(request, index) ?? ok(favoritesPage([])));
    },

    readFavorite: (dramaId) => {
      const index = readCalls.length;
      readCalls.push(dramaId);
      return Promise.resolve(script.read?.(dramaId, index) ?? ok(unfollowedState(dramaId)));
    },

    addFavorite: (dramaId) => {
      const index = addCalls.length;
      addCalls.push(dramaId);
      return Promise.resolve(script.add?.(dramaId, index) ?? ok(undefined));
    },

    removeFavorite: (dramaId) => {
      const index = removeCalls.length;
      removeCalls.push(dramaId);
      return Promise.resolve(script.remove?.(dramaId, index) ?? ok(undefined));
    },
  };
}

/** `{ kind: 'HTTP', status }`, the shape a refused favourite request arrives in. */
export function favoritesHttpFailure(
  status: number,
  extra: { readonly code?: ApiFailure['code']; readonly traceId?: string } = {},
): ApiFailure {
  return apiFailure({
    kind: 'HTTP',
    status,
    message: `HTTP ${String(status)}`,
    traceId: extra.traceId ?? 'trace_favorites',
    ...(extra.code == null ? {} : { code: extra.code }),
  });
}
