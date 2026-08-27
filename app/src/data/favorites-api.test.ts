import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { apiFailure } from './failure';
import {
  FAVORITES_LIST_PATH,
  createFavoritesApi,
  favoriteEndpoint,
  narrowFavoriteListItem,
  narrowFavoriteState,
} from './favorites-api';
import type { HttpReader, HttpWriter } from './http';

/** Exactly what `createFavoritesApi` asks for: a read and an idempotent write, and no `postJson`. */
type HttpTransport = HttpReader & HttpWriter;

function httpStub(overrides: Partial<HttpTransport> = {}): HttpTransport {
  return {
    getJson: () => Promise.resolve(ok({ dramaId: 'drm_1', favorited: false })),
    send: () => Promise.resolve(ok(undefined)),
    ...overrides,
  };
}

const AUGUST_1 = '2026-08-01T00:00:00.000Z';

function listBody(items: unknown, nextCursor: string | null = null): unknown {
  return { items, pageInfo: { nextCursor, hasMore: nextCursor !== null } };
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

  it('reads the list from the viewer’s own path', () => {
    expect(FAVORITES_LIST_PATH).toBe('/v1/users/me/favorites');
  });
});

/**
 * The read that replaced the fan-out. It answers for the viewer's whole list, which is the property
 * the per-drama probes could not have: a followed drama the client did not think to ask about used to
 * be missing from the screen entirely.
 */
describe('the favourites list read', () => {
  it('asks the list endpoint with the page size the endpoint documents', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(listBody([]))));
    await createFavoritesApi(httpStub({ getJson })).listFavorites({ limit: 20 });

    expect(getJson).toHaveBeenCalledWith('/v1/users/me/favorites', {
      cursor: undefined,
      limit: 20,
    });
  });

  // Opaque, and echoed rather than parsed: it encodes a position in one specific ordering and means
  // nothing outside it.
  it('sends the cursor back verbatim', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(listBody([]))));
    await createFavoritesApi(httpStub({ getJson })).listFavorites({ cursor: 'MTc4Nzgz:drm_1' });

    expect(getJson).toHaveBeenCalledWith('/v1/users/me/favorites', {
      cursor: 'MTc4Nzgz:drm_1',
      limit: undefined,
    });
  });

  it('returns the rows in the order the server sent them, with the paging envelope', async () => {
    const api = createFavoritesApi(
      httpStub({
        getJson: () =>
          Promise.resolve(
            ok(
              listBody(
                [
                  { dramaId: 'drm_2', favoritedAt: AUGUST_1 },
                  { dramaId: 'drm_1', favoritedAt: AUGUST_1 },
                ],
                'cursor_2',
              ),
            ),
          ),
      }),
    );

    const result = await api.listFavorites({});
    expect(result.ok ? result.value.items.map((item) => item.dramaId) : null).toEqual([
      'drm_2',
      'drm_1',
    ]);
    expect(result.ok ? result.value.pageInfo : null).toEqual({
      nextCursor: 'cursor_2',
      hasMore: true,
    });
  });

  /**
   * A viewer who follows nothing is a `200` with no rows, and the client must hand that on as an
   * empty list rather than as a failure — it is the empty state of SCR-08, and the one answer that
   * must never be confused with a refusal.
   */
  it('reports an empty list as a value and not as a failure', async () => {
    const api = createFavoritesApi(httpStub({ getJson: () => Promise.resolve(ok(listBody([]))) }));

    const result = await api.listFavorites({});
    expect(result).toEqual({
      ok: true,
      value: { items: [], pageInfo: { nextCursor: null, hasMore: false } },
    });
  });

  it('passes a refusal straight through rather than reporting no favourites', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 401, message: 'HTTP 401' });
    const api = createFavoritesApi(httpStub({ getJson: () => Promise.resolve(err(failure)) }));

    expect(await api.listFavorites({})).toEqual({ ok: false, error: failure });
  });

  it('reports a body that is not a page as MALFORMED', async () => {
    const api = createFavoritesApi(httpStub({ getJson: () => Promise.resolve(ok({ items: [] })) }));

    const result = await api.listFavorites({});
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });
});

/**
 * The list row. The id is the row — it addresses the un-follow and keys the list — so it is
 * strict; the timestamp drives nothing on this screen, so it is not; `drama` is the card, so a
 * present object that is not a summary rejects the page, and `null` is the unresolved row.
 */
describe('narrowing a favourites list row', () => {
  it('accepts the documented row', () => {
    expect(
      narrowFavoriteListItem({ dramaId: 'drm_1', favoritedAt: AUGUST_1, drama: null }),
    ).toEqual({
      dramaId: 'drm_1',
      favoritedAt: AUGUST_1,
      drama: null,
    });
  });

  it('treats a missing drama as the unresolved row rather than rejecting the page', () => {
    expect(narrowFavoriteListItem({ dramaId: 'drm_1', favoritedAt: AUGUST_1 })).toEqual({
      dramaId: 'drm_1',
      favoritedAt: AUGUST_1,
      drama: null,
    });
  });

  it('attaches a well-formed summary', () => {
    const drama = {
      id: 'drm_1',
      title: 'The Heiress Returns',
      totalEpisodes: 80,
      freeEpisodes: 3,
    };

    expect(narrowFavoriteListItem({ dramaId: 'drm_1', favoritedAt: AUGUST_1, drama })).toEqual({
      dramaId: 'drm_1',
      favoritedAt: AUGUST_1,
      drama,
    });
  });

  it('rejects a present drama that is not a summary, rather than drawing a fake card', () => {
    expect(
      narrowFavoriteListItem({
        dramaId: 'drm_1',
        favoritedAt: AUGUST_1,
        drama: { id: 'drm_1' },
      }),
    ).toBeNull();
  });

  it('rejects a row with no drama id, which is a row with nothing to render or un-follow', () => {
    for (const dramaId of [undefined, null, '', 7, { id: 'drm_1' }]) {
      expect(narrowFavoriteListItem({ dramaId, favoritedAt: AUGUST_1, drama: null })).toBeNull();
    }
  });

  // The order is the server's and the value is displayed nowhere, so losing the viewer's whole list
  // over it would protect nothing. That is the G-C1 widening: wire `favoritedAt` is `string`, this
  // client stores `string | null`.
  it('keeps the row when the timestamp is unusable', () => {
    for (const favoritedAt of [undefined, null, '', 12345, {}]) {
      expect(narrowFavoriteListItem({ dramaId: 'drm_1', favoritedAt, drama: null })).toEqual({
        dramaId: 'drm_1',
        favoritedAt: null,
        drama: null,
      });
    }
  });

  it('rejects a row that is not an object', () => {
    for (const value of [null, undefined, 'drm_1', 7, [{ dramaId: 'drm_1' }]]) {
      expect(narrowFavoriteListItem(value)).toBeNull();
    }
  });

  /**
   * A malformed row costs the page, which is `narrowPage`'s rule everywhere in this client. It is the
   * right trade here in a way it would not be for a feed: a favourites list silently one row short is
   * indistinguishable from a drama the viewer never followed.
   */
  it('fails the whole page when one row has no drama id', async () => {
    const api = createFavoritesApi(
      httpStub({
        getJson: () =>
          Promise.resolve(
            ok(listBody([{ dramaId: 'drm_1', favoritedAt: AUGUST_1, drama: null }, {}])),
          ),
      }),
    );

    const result = await api.listFavorites({});
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  it('fails the whole page when one row carries a malformed summary', async () => {
    const api = createFavoritesApi(
      httpStub({
        getJson: () =>
          Promise.resolve(
            ok(listBody([{ dramaId: 'drm_1', favoritedAt: AUGUST_1, drama: { title: 'no id' } }])),
          ),
      }),
    );

    const result = await api.listFavorites({});
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });
});

describe('the favourite read', () => {
  it('asks the drama’s own favourite path', async () => {
    const getJson = vi.fn<HttpTransport['getJson']>(() =>
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
    const send = vi.fn<HttpTransport['send']>(() => Promise.resolve(ok(undefined)));
    await createFavoritesApi(httpStub({ send })).addFavorite('drm_1');

    expect(send).toHaveBeenCalledWith('PUT', '/v1/dramas/drm_1/favorite');
  });

  it('un-follows with a DELETE on the same path', async () => {
    const send = vi.fn<HttpTransport['send']>(() => Promise.resolve(ok(undefined)));
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
