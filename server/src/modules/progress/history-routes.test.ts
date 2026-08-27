import { afterEach, describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';
import type { Page, WatchHistoryEntry } from '@minidrama/shared';

import { WATCH_HISTORY_MAX_LIMIT } from './history.js';
import { WATCH_HISTORY_PATH } from './history-routes.js';
import { buildApp } from '../../app.js';
import { createFakeSessionResolver } from './test-sessions.js';
import { createFixtureWatchHistoryCatalogPort } from './fixtures.js';
import { createInMemorySessionStore } from '../identity/session-store.js';
import { createInMemoryWatchProgressStore } from './store.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';
import type { WatchHistoryCatalogPort } from './catalog-port.js';
import type { WatchProgressStore } from './store.js';

/**
 * `GET /v1/users/me/watch-history` over HTTP.
 *
 * The three answers this endpoint exists to keep apart are three different screens in the client, so
 * they are the first three groups below: `401` for nobody, `200 []` for a viewer who has watched
 * nothing, and `503` for a viewer whose history we cannot describe. Collapsing any pair of them is
 * the defect this file is here to catch.
 *
 * `tok_a` is `user_a` and `tok_b` is `user_b` (`test-sessions.ts`). The fixture catalogue describes
 * the same episodes the entitlement fixtures do, so `ep_fx_s2e01` is episode 11 of
 * `drm_fx_revenge` here exactly as it is there.
 */

let app: FastifyInstance;
let store: WatchProgressStore;
let clockMs = Date.parse('2026-08-27T12:00:00.000Z');

const MINUTE_MS = 60_000;

async function startApp(dependencies: AppDependencies = {}): Promise<void> {
  store = dependencies.watchProgressStore ?? createInMemoryWatchProgressStore();
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      viewerResolver: createFakeSessionResolver(),
      watchProgressStore: store,
      watchHistoryCatalogPort: createFixtureWatchHistoryCatalogPort(),
      now: () => clockMs,
      ...dependencies,
    },
  );
  await app.ready();
}

/** The app exactly as a real deployment builds it: no injected resolver, store or catalogue. */
async function startDeployedApp(): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
}

function history(token?: string, query = '') {
  return app.inject({
    method: 'GET',
    url: `${WATCH_HISTORY_PATH}${query}`,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

/** Records a watched episode directly, so a test says what it means rather than replaying PUTs. */
async function watched(
  episodeId: string,
  atMs: number,
  overrides: { readonly userId?: string; readonly positionSec?: number } = {},
): Promise<void> {
  await store.save({
    userId: overrides.userId ?? 'user_a',
    episodeId,
    positionSec: overrides.positionSec ?? 45,
    durationSec: 95,
    completed: false,
    clientUpdatedAtMs: atMs,
    updatedAtMs: atMs,
  });
}

function errorCode(response: { json: <T>() => T }): string {
  return response.json<{ error: { code: string } }>().error.code;
}

/**
 * A catalogue in which every episode is its own drama.
 *
 * The fixture world has exactly one published drama, which is right for it — it exists to make
 * entitlement decisions reproducible — and useless for paging, where every row has to be a separate
 * drama to be a separate row. So the paging group below uses this instead, and nothing else does.
 */
function createOneDramaPerEpisodePort(): WatchHistoryCatalogPort {
  return {
    loadWatchedEpisodeFacts: async (episodeIds) =>
      ok(
        new Map(
          episodeIds.map((episodeId) => [
            episodeId,
            {
              drama: {
                id: `drm_${episodeId}`,
                title: episodeId,
                coverUrl: `https://cdn.example.invalid/${episodeId}.jpg`,
                category: 'ROMANCE' as const,
                tags: [],
                totalEpisodes: 1,
                freeEpisodes: 1,
                isCompleted: false,
                stat: { playCount: 0, favoriteCount: 0, score: 0 },
              },
              globalEpisodeNumber: 1,
            },
          ]),
        ),
      ),
  };
}

afterEach(async () => {
  clockMs = Date.parse('2026-08-27T12:00:00.000Z');
  await app.close();
});

describe('GET /v1/users/me/watch-history — nobody is asking', () => {
  it('refuses a request with no credential', async () => {
    await startApp();

    const response = await history();

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  // Answering an empty list here would be the worst available bug: the screen would show "nothing
  // watched yet" to a signed-out viewer who has watched plenty, and offer them no way to sign in.
  it('never answers an empty list to a request it could not identify', async () => {
    await startApp();
    await watched('ep_fx_s1e01', clockMs);

    const response = await history();

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('items');
  });

  it('refuses a token nothing issued', async () => {
    await startApp();

    const response = await history('tok_forged');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('refuses a credential that is not a bearer token rather than reading it as anonymous', async () => {
    await startApp();

    const response = await app.inject({
      method: 'GET',
      url: WATCH_HISTORY_PATH,
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(401);
  });

  // Which of "no token" and "bad token" applies is operator information: the difference is useful to
  // somebody probing the endpoint, and the client's move is the same either way.
  it('does not tell the caller which credential problem it hit', async () => {
    await startApp();

    const noToken = await history();
    const badToken = await history('tok_forged');

    expect(errorCode(noToken)).toBe(errorCode(badToken));
    for (const body of [noToken.body, badToken.body]) {
      expect(body).not.toMatch(/NO_CREDENTIAL|SESSION_REJECTED|SESSION_UNRESOLVABLE/);
    }
  });

  it('refuses with the app as deployed today, which issues no session to this token', async () => {
    await startDeployedApp();

    const response = await history('tok_a');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });
});

describe('GET /v1/users/me/watch-history — signed in, nothing watched', () => {
  it('answers an empty page, which is a different answer from 401', async () => {
    await startApp();

    const response = await history('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<Page<WatchHistoryEntry>>()).toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
    });
  });

  // The empty page is answered without consulting the catalogue, so that a deployment with no
  // catalogue still tells "signed out" and "watched nothing" apart — the two states the client draws
  // completely different screens for.
  it('does not consult the catalogue when there is nothing to describe', async () => {
    let calls = 0;
    const countingPort: WatchHistoryCatalogPort = {
      loadWatchedEpisodeFacts: async (episodeIds) => {
        calls += 1;
        return createFixtureWatchHistoryCatalogPort().loadWatchedEpisodeFacts(episodeIds);
      },
    };
    await startApp({ watchHistoryCatalogPort: countingPort });

    expect((await history('tok_a')).statusCode).toBe(200);
    expect(calls).toBe(0);
  });

  it('answers an empty page with the app as deployed today, given a session it issued', async () => {
    const sessionStore = createInMemorySessionStore({ now: () => clockMs });
    app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, { sessionStore });
    await app.ready();
    const session = sessionStore.issue('open_abc');

    const response = await history(session.accessToken);

    expect(response.statusCode).toBe(200);
    expect(response.json<Page<WatchHistoryEntry>>().items).toEqual([]);
  });
});

describe('GET /v1/users/me/watch-history — signed in, history not describable', () => {
  // "You have never watched anything" is a claim about the viewer, and a viewer who believes it
  // stops looking. A fault has to look like a fault.
  it('answers 503 rather than an empty list when the catalogue refuses', async () => {
    await startApp({
      watchHistoryCatalogPort: { loadWatchedEpisodeFacts: async () => err('CATALOG_UNAVAILABLE') },
    });
    await watched('ep_fx_s1e01', clockMs);

    const response = await history('tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
  });

  it('answers 503 with the app as deployed today, whose catalogue port refuses', async () => {
    const sessionStore = createInMemorySessionStore({ now: () => clockMs });
    const progressStore = createInMemoryWatchProgressStore();
    app = await buildApp(
      { ...loadConfig({}), logLevel: 'silent' },
      { sessionStore, watchProgressStore: progressStore },
    );
    await app.ready();
    const session = sessionStore.issue('open_abc');
    await progressStore.save({
      userId: 'open_abc',
      episodeId: 'ep_fx_s1e01',
      positionSec: 45,
      durationSec: 95,
      completed: false,
      clientUpdatedAtMs: clockMs,
      updatedAtMs: clockMs,
    });

    const response = await history(session.accessToken);

    expect(response.statusCode).toBe(503);
  });

  it('leaks no internal reason for the fault', async () => {
    await startApp({
      watchHistoryCatalogPort: { loadWatchedEpisodeFacts: async () => err('CATALOG_UNAVAILABLE') },
    });
    await watched('ep_fx_s1e01', clockMs);

    const response = await history('tok_a');

    expect(response.body).not.toContain('CATALOG_UNAVAILABLE');
  });
});

describe('GET /v1/users/me/watch-history — the list', () => {
  it('describes a watched episode as a drama row the screen can render', async () => {
    await startApp();
    await watched('ep_fx_s2e01', clockMs, { positionSec: 63 });

    const response = await history('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<Page<WatchHistoryEntry>>().items).toEqual([
      {
        drama: expect.objectContaining({ id: 'drm_fx_revenge', title: expect.any(String) }),
        // Season 2 episode 1 is episode 11 of the drama. The per-season number would name the wrong
        // episode in every season past the first.
        lastEpisodeNumber: 11,
        lastPositionSec: 63,
        watchedAt: '2026-08-27T12:00:00.000Z',
        lastEpisodeId: 'ep_fx_s2e01',
      },
    ]);
  });

  // The field the history screen cannot resume without, and the reason this endpoint carries five
  // fields where `docs/12-api-contracts.md` §4.7 lists four.
  it('always carries the episode id, because the row is built from a row keyed by one', async () => {
    await startApp();
    await watched('ep_fx_s1e01', clockMs - MINUTE_MS);
    await watched('ep_fx_w1e01', clockMs);

    const items = (await history('tok_a')).json<Page<WatchHistoryEntry>>().items;

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.lastEpisodeId).toMatch(/^ep_/);
    }
  });

  it('collapses many episodes of one drama into its newest row', async () => {
    await startApp();
    await watched('ep_fx_s1e01', clockMs - 2 * MINUTE_MS);
    await watched('ep_fx_s1e05', clockMs - MINUTE_MS);
    await watched('ep_fx_s2e01', clockMs);

    const items = (await history('tok_a')).json<Page<WatchHistoryEntry>>().items;

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ lastEpisodeId: 'ep_fx_s2e01', lastEpisodeNumber: 11 });
  });

  // A withdrawn drama's row is a cover and a resume button that playback answers with 410.
  it('leaves out a drama that is no longer on the shelf', async () => {
    await startApp();
    await watched('ep_fx_w1e01', clockMs);

    const response = await history('tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<Page<WatchHistoryEntry>>().items).toEqual([]);
  });

  // The property that matters most in this file: a history list is the most complete picture of a
  // viewer's behaviour the product holds.
  it('never serves one viewer’s history to another', async () => {
    await startApp();
    await watched('ep_fx_s1e01', clockMs, { userId: 'user_a' });
    await watched('ep_fx_s2e01', clockMs, { userId: 'user_b' });

    const forA = (await history('tok_a')).json<Page<WatchHistoryEntry>>();
    const forB = (await history('tok_b')).json<Page<WatchHistoryEntry>>();

    expect(forA.items.map((entry) => entry.lastEpisodeId)).toEqual(['ep_fx_s1e01']);
    expect(forB.items.map((entry) => entry.lastEpisodeId)).toEqual(['ep_fx_s2e01']);
  });

  // A per-viewer answer in a shared cache is a cross-user leak waiting for a misconfigured proxy.
  it('forbids caching of a per-viewer answer', async () => {
    await startApp();

    const response = await history('tok_a');

    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('forbids caching of the refusals too', async () => {
    await startApp({
      watchHistoryCatalogPort: { loadWatchedEpisodeFacts: async () => err('CATALOG_UNAVAILABLE') },
    });
    await watched('ep_fx_s1e01', clockMs);

    expect((await history('tok_a')).headers['cache-control']).toBe('private, no-store');
  });

  // Correction A4: playback identifiers reach a client only through a playback session.
  it('returns no media identifier of any kind', async () => {
    await startApp();
    await watched('ep_fx_s2e01', clockMs);

    const response = await history('tok_a');

    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|"vid"|playAuthToken/i);
  });

  it('reports what the per-episode endpoints recorded, end to end', async () => {
    await startApp();

    const reported = await app.inject({
      method: 'PUT',
      url: '/v1/progress/episodes/ep_fx_s2e03',
      headers: { authorization: 'Bearer tok_a' },
      payload: { positionSec: 30, durationSec: 95, clientUpdatedAt: '2026-08-27T12:00:00.000Z' },
    });

    expect(reported.statusCode).toBe(204);

    const items = (await history('tok_a')).json<Page<WatchHistoryEntry>>().items;

    expect(items).toEqual([
      {
        drama: expect.objectContaining({ id: 'drm_fx_revenge' }),
        lastEpisodeNumber: 13,
        lastPositionSec: 30,
        watchedAt: '2026-08-27T12:00:00.000Z',
        lastEpisodeId: 'ep_fx_s2e03',
      },
    ]);
  });
});

describe('GET /v1/users/me/watch-history — the query string', () => {
  it('serves no more rows than the limit asks for, and says there are more', async () => {
    await startApp({ watchHistoryCatalogPort: createOneDramaPerEpisodePort() });
    await watched('ep_1', clockMs);
    await watched('ep_2', clockMs - MINUTE_MS);
    await watched('ep_3', clockMs - 2 * MINUTE_MS);

    const page = (await history('tok_a', '?limit=2')).json<Page<WatchHistoryEntry>>();

    expect(page.items.map((entry) => entry.lastEpisodeId)).toEqual(['ep_1', 'ep_2']);
    expect(page.pageInfo.hasMore).toBe(true);
  });

  it('refuses a limit it cannot read', async () => {
    await startApp();

    const response = await history('tok_a', '?limit=abc');

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
    expect(
      response.json<{ error: { details: { fields: { field: string }[] } } }>().error.details
        .fields[0]?.field,
    ).toBe('limit');
  });

  it('refuses a cursor it did not mint', async () => {
    await startApp();

    const response = await history('tok_a', '?cursor=bm90LWEtY3Vyc29y');

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
  });

  // Clamped, not refused: a client asking for a page size we do not serve is asking a question we
  // can answer.
  it('clamps an oversized limit rather than breaking the screen', async () => {
    await startApp();
    await watched('ep_fx_s1e01', clockMs);

    const response = await history('tok_a', `?limit=${WATCH_HISTORY_MAX_LIMIT * 100}`);

    expect(response.statusCode).toBe(200);
  });

  it('checks the session before it checks the query, so a stranger learns nothing about either', async () => {
    await startApp();

    const response = await history(undefined, '?limit=abc');

    expect(response.statusCode).toBe(401);
  });

  it('follows its own cursor to the next page', async () => {
    await startApp({ watchHistoryCatalogPort: createOneDramaPerEpisodePort() });
    await watched('ep_1', clockMs);
    await watched('ep_2', clockMs - MINUTE_MS);

    const first = (await history('tok_a', '?limit=1')).json<Page<WatchHistoryEntry>>();

    expect(first.items.map((entry) => entry.lastEpisodeId)).toEqual(['ep_1']);
    expect(first.pageInfo.hasMore).toBe(true);
    expect(first.pageInfo.nextCursor).not.toBeNull();

    const second = (
      await history(
        'tok_a',
        `?limit=1&cursor=${encodeURIComponent(first.pageInfo.nextCursor ?? '')}`,
      )
    ).json<Page<WatchHistoryEntry>>();

    expect(second.items.map((entry) => entry.lastEpisodeId)).toEqual(['ep_2']);
    expect(second.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });
});
