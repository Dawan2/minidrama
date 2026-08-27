import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { apiFailure } from './failure';
import { createFavoritesApi, favoriteEndpoint, narrowFavoriteState } from './favorites-api';
import type { HttpClient } from './http';

function httpStub(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    getJson: () => Promise.resolve(ok({ dramaId: 'drm_1', favorited: false })),
    send: () => Promise.resolve(ok(undefined)),
    ...overrides,
  };
}

describe('the favourite endpoint', () => {
  it('is the path the server registered', () => {
    expect(favoriteEndpoint('drm_1')).toBe('/v1/dramas/drm_1/favorite');
  });

  // Drama ids arrive from a feed response and from deep links. Interpolated raw, a slash in one
  // addresses a different endpoint entirely.
  it('escapes an id that would otherwise change which endpoint is called', () => {
    expect(favoriteEndpoint('drm/1?x=2')).toBe('/v1/dramas/drm%2F1%3Fx%3D2/favorite');
  });
});

describe('the favourite read', () => {
  it('asks the drama’s own favourite path', async () => {
    const getJson = vi.fn<HttpClient['getJson']>(() =>
      Promise.resolve(ok({ dramaId: 'drm_9', favorited: false })),
    );
    await createFavoritesApi(httpStub({ getJson })).readFavorite('drm_9');

    expect(getJson).toHaveBeenCalledWith('/v1/dramas/drm_9/favorite');
  });

  it('returns the followed row with the timestamp the list sorts on', async () => {
    const api = createFavoritesApi(
      httpStub({
        getJson: () =>
          Promise.resolve(
            ok({ dramaId: 'drm_1', favorited: true, favoritedAt: '2026-08-01T00:00:00.000Z' }),
          ),
      }),
    );

    const result = await api.readFavorite('drm_1');
    expect(result).toEqual({
      ok: true,
      value: { dramaId: 'drm_1', favorited: true, favoritedAt: '2026-08-01T00:00:00.000Z' },
    });
  });

  it('passes a transport failure straight through', async () => {
    const failure = apiFailure({ kind: 'OFFLINE', message: 'no network' });
    const api = createFavoritesApi(httpStub({ getJson: () => Promise.resolve(err(failure)) }));

    expect(await api.readFavorite('drm_1')).toEqual({ ok: false, error: failure });
  });

  it('reports a body that is not a favourite state as MALFORMED', async () => {
    const api = createFavoritesApi(httpStub({ getJson: () => Promise.resolve(ok({})) }));

    const result = await api.readFavorite('drm_1');
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });
});

describe('the favourite writes', () => {
  it('follows with a PUT on the drama’s favourite path', async () => {
    const send = vi.fn<HttpClient['send']>(() => Promise.resolve(ok(undefined)));
    await createFavoritesApi(httpStub({ send })).addFavorite('drm_1');

    expect(send).toHaveBeenCalledWith('PUT', '/v1/dramas/drm_1/favorite');
  });

  it('un-follows with a DELETE on the same path', async () => {
    const send = vi.fn<HttpClient['send']>(() => Promise.resolve(ok(undefined)));
    await createFavoritesApi(httpStub({ send })).removeFavorite('drm_1');

    expect(send).toHaveBeenCalledWith('DELETE', '/v1/dramas/drm_1/favorite');
  });

  /**
   * `PUT` is the one favourite request the catalogue can refuse — `404` for a drama that was never
   * published, `410` for one that was withdrawn (S45/S46). The client passes that through rather
   * than swallowing it, because re-following a withdrawn drama is a real thing a viewer can attempt
   * from the favourites screen and it needs its own copy.
   */
  it('reports a refused follow rather than reporting success', async () => {
    const failure = apiFailure({
      kind: 'HTTP',
      status: 410,
      code: 'CONTENT_OFFLINE',
      message: 'gone',
    });
    const api = createFavoritesApi(httpStub({ send: () => Promise.resolve(err(failure)) }));

    expect(await api.addFavorite('drm_1')).toEqual({ ok: false, error: failure });
  });
});

/**
 * The narrowing. `favorited` is the entire answer, so a response that omits it must not be read as
 * "not followed" by a default — that would silently remove a row from the viewer's own list.
 */
describe('narrowing a favourite state', () => {
  it('accepts the documented followed row', () => {
    expect(
      narrowFavoriteState('drm_1', {
        dramaId: 'drm_1',
        favorited: true,
        favoritedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({ dramaId: 'drm_1', favorited: true, favoritedAt: '2026-08-01T00:00:00.000Z' });
  });

  it('accepts the unfollowed row, which carries no timestamp', () => {
    expect(narrowFavoriteState('drm_1', { dramaId: 'drm_1', favorited: false })).toEqual({
      dramaId: 'drm_1',
      favorited: false,
    });
  });

  it('rejects a row with no favorited flag rather than defaulting it to false', () => {
    expect(narrowFavoriteState('drm_1', { dramaId: 'drm_1' })).toBeNull();
  });

  it('rejects a non-boolean favorited flag, including a truthy string', () => {
    expect(narrowFavoriteState('drm_1', { dramaId: 'drm_1', favorited: 'true' })).toBeNull();
  });

  /**
   * The one shape of bug that would put somebody else's favourite on this viewer's screen: a
   * mis-keyed cache, or a proxy holding a response the endpoint marks `private, no-store`.
   */
  it('rejects a row about a different drama than the one asked about', () => {
    expect(narrowFavoriteState('drm_1', { dramaId: 'drm_2', favorited: true })).toBeNull();
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, undefined, 'favorited', 7, [{ favorited: true }]]) {
      expect(narrowFavoriteState('drm_1', body)).toBeNull();
    }
  });

  // The timestamp is the sort key and nothing else. A row without one sorts last rather than
  // costing the viewer the whole list.
  it('drops an unusable timestamp instead of rejecting the row', () => {
    for (const favoritedAt of [null, '', 12345, {}]) {
      expect(
        narrowFavoriteState('drm_1', { dramaId: 'drm_1', favorited: true, favoritedAt }),
      ).toEqual({ dramaId: 'drm_1', favorited: true });
    }
  });
});
