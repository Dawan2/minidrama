import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { FavoriteList } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createFakeSessionResolver } from '../progress/test-sessions.js';
import { createInMemoryFavoritesStore } from './favorites.js';
import { loadConfig } from '../../config.js';
import type { FavoritesStore } from './favorites.js';

/**
 * `GET /v1/users/me/favorites` over HTTP.
 *
 * The endpoint that lets a favourites screen exist: the per-drama read answers "do I follow *this*",
 * so a client without this list has to ask once per candidate drama and still cannot discover a
 * favourite it did not think to ask about.
 *
 * Two groups carry most of the weight. The first is the refusal: this is a per-viewer list, and the
 * distinction that must never blur is `401` (you may not see a list) against `200 items: []` (you
 * follow nothing) — a client that confused them would show an empty favourites screen to a viewer
 * whose session had expired. The second is paging, asserted by walking the whole list through the
 * real handler rather than by checking one response's shape.
 *
 * `tok_a` is `user_a` and `tok_b` is `user_b`; nothing else resolves. The double is
 * `progress/test-sessions.ts`'s rather than this file's own: C2 integration settled on one
 * viewer-resolution seam for the whole server (`docs/plan/cycle-2-integration.md` A1), and that
 * double carries the same two sessions this file was written against.
 */

const PUBLISHED = 'drm_revenge_0001';
const DELISTED = 'drm_offline_0007';

const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const PATH = '/v1/users/me/favorites';

let app: FastifyInstance;

async function startApp(favorites: FavoritesStore = createInMemoryFavoritesStore()): Promise<void> {
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      favoritesStore: favorites,
      viewerResolver: createFakeSessionResolver(),
      now: () => NOW,
    },
  );
  await app.ready();
}

/** The app exactly as a real deployment builds it: no injected resolver, no injected store. */
async function startDeployedApp(): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
}

/** `count` favourites for one viewer, ascending in time, so `drm_00` is the oldest. */
async function storeWith(count: number, userId = 'user_a'): Promise<FavoritesStore> {
  const favorites = createInMemoryFavoritesStore();
  for (let index = 0; index < count; index += 1) {
    await favorites.add(userId, `drm_${String(index).padStart(2, '0')}`, NOW + index);
  }
  return favorites;
}

function list(query = '', token?: string) {
  return app.inject({
    method: 'GET',
    url: `${PATH}${query}`,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function errorCode(body: string): string {
  return (JSON.parse(body) as { error: { code: string } }).error.code;
}

function failedField(body: string): string {
  return (JSON.parse(body) as { error: { details: { fields: readonly { field: string }[] } } })
    .error.details.fields[0]!.field;
}

function ids(body: FavoriteList): readonly string[] {
  return body.items.map((item) => item.dramaId);
}

afterEach(async () => {
  await app.close();
});

describe('GET /v1/users/me/favorites — without a resolvable viewer', () => {
  it('refuses with the app as deployed today', async () => {
    await startDeployedApp();

    const response = await list('', 'tok_a');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response.body)).toBe('AUTH_REQUIRED');
  });

  it('refuses with no credential', async () => {
    await startApp();

    const response = await list();

    expect(response.statusCode).toBe(401);
    expect(errorCode(response.body)).toBe('AUTH_REQUIRED');
  });

  it('refuses a forged token', async () => {
    await startApp();

    const response = await list('', 'tok_forged');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response.body)).toBe('AUTH_REQUIRED');
  });

  it('does not tell the caller which credential problem it hit', async () => {
    await startApp();

    const noToken = await list();
    const badToken = await list('', 'tok_forged');

    expect(errorCode(noToken.body)).toBe(errorCode(badToken.body));
    for (const body of [noToken.body, badToken.body]) {
      expect(body).not.toMatch(/NO_CREDENTIAL|SESSION_REJECTED|SESSION_UNVERIFIABLE/);
    }
  });

  // A `400` here would tell an anonymous caller that it had reached a real handler, and would let
  // it probe the parameter rules of an endpoint it cannot call.
  it('refuses before it validates the query, so a malformed request looks the same', async () => {
    await startApp();

    const wellFormed = await list('?limit=10');
    const malformed = await list('?limit=nonsense&cursor=!!!');

    expect(malformed.statusCode).toBe(wellFormed.statusCode);
    expect(errorCode(malformed.body)).toBe('AUTH_REQUIRED');
    expect(malformed.body).not.toMatch(/limit|cursor/u);
  });

  // The one confusion this endpoint exists to prevent: an expired session must not render as a
  // favourites screen with nothing on it.
  it('is never mistakable for a viewer who follows nothing', async () => {
    await startApp();

    const refused = await list();
    const empty = await list('', 'tok_a');

    expect(refused.statusCode).toBe(401);
    expect(empty.statusCode).toBe(200);
    expect(empty.json<FavoriteList>().items).toEqual([]);
  });
});

describe('GET /v1/users/me/favorites', () => {
  it('answers 200 with an empty page for a viewer who follows nothing', async () => {
    await startApp();

    const response = await list('', 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<FavoriteList>()).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });

  it('lists the dramas this viewer follows, most recent first', async () => {
    const favorites = createInMemoryFavoritesStore();
    await favorites.add('user_a', 'drm_old', NOW);
    await favorites.add('user_a', 'drm_new', NOW + 60_000);
    await startApp(favorites);

    const response = await list('', 'tok_a');

    expect(response.json<FavoriteList>()).toEqual({
      items: [
        { dramaId: 'drm_new', favoritedAt: '2026-08-27T12:01:00.000Z' },
        { dramaId: 'drm_old', favoritedAt: '2026-08-27T12:00:00.000Z' },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });

  it('shows a favourite the moment it is created', async () => {
    await startApp();

    await app.inject({
      method: 'PUT',
      url: `/v1/dramas/${PUBLISHED}/favorite`,
      headers: { authorization: 'Bearer tok_a' },
    });

    expect(ids((await list('', 'tok_a')).json<FavoriteList>())).toEqual([PUBLISHED]);
  });

  it('drops a favourite the moment it is removed', async () => {
    await startApp();

    for (const method of ['PUT', 'DELETE'] as const) {
      await app.inject({
        method,
        url: `/v1/dramas/${PUBLISHED}/favorite`,
        headers: { authorization: 'Bearer tok_a' },
      });
    }

    expect((await list('', 'tok_a')).json<FavoriteList>().items).toEqual([]);
  });

  // No publication check, for the same reason the per-drama read applies none: the row is why the
  // drama is on the viewer's screen, and hiding it here would leave a favourite they cannot see and
  // therefore cannot clear.
  it('lists a drama that has since been delisted', async () => {
    const favorites = createInMemoryFavoritesStore();
    await favorites.add('user_a', DELISTED, NOW);
    await startApp(favorites);

    expect(ids((await list('', 'tok_a')).json<FavoriteList>())).toEqual([DELISTED]);
  });

  it('never lists one viewer the favourites of another', async () => {
    const favorites = createInMemoryFavoritesStore();
    await favorites.add('user_a', 'drm_a', NOW);
    await favorites.add('user_b', 'drm_b', NOW + 1);
    await startApp(favorites);

    expect(ids((await list('', 'tok_b')).json<FavoriteList>())).toEqual(['drm_b']);
  });

  it('forbids caching of a per-viewer answer', async () => {
    await startApp();

    expect((await list('', 'tok_a')).headers['cache-control']).toBe('private, no-store');
  });

  it('returns no URL of any kind', async () => {
    await startApp(await storeWith(3));

    expect((await list('', 'tok_a')).body).not.toMatch(/https?:\/\//);
  });
});

describe('GET /v1/users/me/favorites — paging', () => {
  it('defaults to 20 rows and says there is more', async () => {
    await startApp(await storeWith(21));

    const body = (await list('', 'tok_a')).json<FavoriteList>();

    expect(body.items).toHaveLength(20);
    expect(body.pageInfo.hasMore).toBe(true);
    expect(body.pageInfo.nextCursor).not.toBeNull();
  });

  it('honours a smaller limit', async () => {
    await startApp(await storeWith(5));

    const body = (await list('?limit=2', 'tok_a')).json<FavoriteList>();

    expect(ids(body)).toEqual(['drm_04', 'drm_03']);
    expect(body.pageInfo.hasMore).toBe(true);
  });

  it('walks the whole list through the cursor, with no gap and no repeat', async () => {
    await startApp(await storeWith(7));

    const seen: string[] = [];
    let query = '?limit=3';

    for (let guard = 0; guard < 10; guard += 1) {
      const body = (await list(query, 'tok_a')).json<FavoriteList>();
      seen.push(...ids(body));
      if (!body.pageInfo.hasMore) {
        expect(body.pageInfo.nextCursor).toBeNull();
        break;
      }
      query = `?limit=3&cursor=${encodeURIComponent(body.pageInfo.nextCursor ?? '')}`;
    }

    expect(seen).toEqual(['drm_06', 'drm_05', 'drm_04', 'drm_03', 'drm_02', 'drm_01', 'drm_00']);
  });

  // A cursor on the final page invites a client to fetch an empty page just to discover it has
  // finished, which is one wasted round trip on every favourites screen.
  it('gives no cursor when there is nothing after this page', async () => {
    await startApp(await storeWith(2));

    const body = (await list('?limit=2', 'tok_a')).json<FavoriteList>();

    expect(body.items).toHaveLength(2);
    expect(body.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  // The cursor is a position in *this* viewer's ordering and names no viewer. One viewer's cursor
  // applied to another's list can only move a position inside that other list.
  it('does not let one viewer’s cursor reach another viewer’s rows', async () => {
    const favorites = createInMemoryFavoritesStore();
    await favorites.add('user_a', 'drm_a1', NOW);
    await favorites.add('user_a', 'drm_a2', NOW + 1);
    await favorites.add('user_b', 'drm_b1', NOW + 2);
    await startApp(favorites);

    const cursor = (await list('?limit=1', 'tok_a')).json<FavoriteList>().pageInfo.nextCursor;
    const asOther = (
      await list(`?limit=10&cursor=${encodeURIComponent(cursor ?? '')}`, 'tok_b')
    ).json<FavoriteList>();

    expect(ids(asOther)).toEqual([]);
    expect(ids((await list('', 'tok_b')).json<FavoriteList>())).toEqual(['drm_b1']);
  });

  it('carries no viewer identifier in the cursor it hands out', async () => {
    await startApp(await storeWith(3));

    const cursor = (await list('?limit=1', 'tok_a')).json<FavoriteList>().pageInfo.nextCursor ?? '';

    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toMatch(/user_a|tok_a/u);
  });

  it('survives a cursor that is safe to put in a URL unescaped', async () => {
    await startApp(await storeWith(3));

    const cursor = (await list('?limit=1', 'tok_a')).json<FavoriteList>().pageInfo.nextCursor ?? '';

    expect(cursor).toBe(encodeURIComponent(cursor));
    expect((await list(`?limit=1&cursor=${cursor}`, 'tok_a')).statusCode).toBe(200);
  });

  it('answers an empty page for a cursor past the end of the list', async () => {
    await startApp(await storeWith(2));

    const first = (await list('?limit=2', 'tok_a')).json<FavoriteList>();
    expect(first.pageInfo.hasMore).toBe(false);

    // Constructed rather than issued, because a final page hands out no cursor: this is the client
    // that kept an old one and paged past a list that has since shrunk.
    const stale = Buffer.from(`${NOW - 1}:drm_00`, 'utf8').toString('base64url');
    const response = await list(`?limit=2&cursor=${stale}`, 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<FavoriteList>()).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });
});

describe('GET /v1/users/me/favorites — refused parameters', () => {
  it.each([
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=-1', 'limit'],
    ['limit=nonsense', 'limit'],
    ['limit=2.5', 'limit'],
    ['limit=10&limit=20', 'limit'],
    ['cursor=', 'cursor'],
    ['cursor=not%20a%20cursor', 'cursor'],
    ['cursor=aGVsbG8', 'cursor'],
    ['cursor=abc&cursor=def', 'cursor'],
  ])('refuses ?%s and names the field', async (query, field) => {
    await startApp();

    const response = await list(`?${query}`, 'tok_a');

    expect(response.statusCode).toBe(400);
    expect(errorCode(response.body)).toBe('COMMON_VALIDATION_FAILED');
    expect(failedField(response.body)).toBe(field);
  });

  it('accepts the published maximum', async () => {
    await startApp(await storeWith(3));

    expect((await list('?limit=100', 'tok_a')).statusCode).toBe(200);
  });

  // Refusing beats a silent first page: a client whose cursor we have stopped understanding would
  // otherwise loop over page one with nothing in its logs to say so.
  it('refuses a cursor it cannot read rather than restarting the list', async () => {
    await startApp(await storeWith(3));

    const response = await list('?cursor=aaaa', 'tok_a');

    expect(response.statusCode).toBe(400);
    expect(failedField(response.body)).toBe('cursor');
  });
});
