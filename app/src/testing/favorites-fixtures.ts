import { ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import type { ApiFailure } from '../data/failure';
import type { FavoriteState, FavoritesApi } from '../data/favorites-api';

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

export interface StubFavoritesApiScript {
  readonly read?: (dramaId: string, callIndex: number) => Result<FavoriteState, ApiFailure>;
  readonly add?: (dramaId: string, callIndex: number) => Result<void, ApiFailure>;
  readonly remove?: (dramaId: string, callIndex: number) => Result<void, ApiFailure>;
}

export interface StubFavoritesApi extends FavoritesApi {
  readonly readCalls: readonly string[];
  readonly addCalls: readonly string[];
  readonly removeCalls: readonly string[];
}

/**
 * An unscripted read answers "not followed" and an unscripted write succeeds.
 *
 * Both defaults are the *server's* documented answer rather than a failure, unlike the catalogue
 * stub's unscripted drama read. A drama that was never scripted is a test that forgot something; a
 * favourite that was never scripted is the ordinary case — most dramas are not followed — and a test
 * about one followed row should not have to script "false" for every other candidate.
 */
export function stubFavoritesApi(script: StubFavoritesApiScript = {}): StubFavoritesApi {
  const readCalls: string[] = [];
  const addCalls: string[] = [];
  const removeCalls: string[] = [];

  return {
    readCalls,
    addCalls,
    removeCalls,

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
