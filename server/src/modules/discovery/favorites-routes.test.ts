import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { FavoriteState } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createInMemoryFavoritesStore } from './favorites.js';
import { createSessionViewerResolver } from '../progress/viewer.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';

/**
 * The three favourite endpoints over HTTP.
 *
 * Tests inject a resolver so there is an authenticated viewer to be per-viewer *about*: the
 * deployed resolver refuses everything, which is the subject of the first group below rather than an
 * obstacle to the rest. `tok_a` is `user_a` and `tok_b` is `user_b`; nothing else resolves.
 */

const SESSIONS: Record<string, string> = { tok_a: 'user_a', tok_b: 'user_b' };

const PUBLISHED = 'drm_revenge_0001';
const DELISTED = 'drm_offline_0007';
const UNPUBLISHED = 'drm_draft_0008';

let app: FastifyInstance;
let clockMs = Date.parse('2026-08-27T12:00:00.000Z');

async function startApp(dependencies: AppDependencies = {}): Promise<void> {
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      viewerResolver: createSessionViewerResolver((token) => SESSIONS[token]),
      now: () => clockMs,
      ...dependencies,
    },
  );
  await app.ready();
}

/** The app exactly as a real deployment builds it: no injected resolver, no injected store. */
async function startDeployedApp(): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
}

function url(dramaId: string): string {
  return `/v1/dramas/${dramaId}/favorite`;
}

function request(method: 'GET' | 'PUT' | 'DELETE', dramaId: string, token?: string) {
  return app.inject({
    method,
    url: url(dramaId),
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function errorCode(body: string): string {
  return (JSON.parse(body) as { error: { code: string } }).error.code;
}

afterEach(async () => {
  clockMs = Date.parse('2026-08-27T12:00:00.000Z');
  await app.close();
});

describe('favourites — without a resolvable viewer', () => {
  // No session in this deployment is verifiable, so the endpoints accept nothing. A resolver that
  // trusted a token, or read a user id from a header, would let a caller choose whose favourites to
  // read and write — and it would pass every other test in this file.
  it.each([['GET'], ['PUT'], ['DELETE']] as const)(
    'refuses %s with the app as deployed today',
    async (method) => {
      await startDeployedApp();

      const response = await request(method, PUBLISHED, 'tok_a');

      expect(response.statusCode).toBe(401);
      expect(errorCode(response.body)).toBe('AUTH_REQUIRED');
    },
  );

  it.each([['GET'], ['PUT'], ['DELETE']] as const)(
    'refuses %s with no credential',
    async (method) => {
      await startApp();

      const response = await request(method, PUBLISHED);

      expect(response.statusCode).toBe(401);
      expect(errorCode(response.body)).toBe('AUTH_REQUIRED');
    },
  );

  it('stores nothing when the write is refused', async () => {
    await startApp();

    expect((await request('PUT', PUBLISHED)).statusCode).toBe(401);

    const read = await request('GET', PUBLISHED, 'tok_a');
    expect(read.json<FavoriteState>().favorited).toBe(false);
  });

  // Which of "no token", "bad token" and "we cannot check tokens" applies is operator information,
  // and the difference is useful to someone probing the endpoint.
  it('does not tell the caller which credential problem it hit', async () => {
    await startApp();

    const noToken = await request('GET', PUBLISHED);
    const badToken = await request('GET', PUBLISHED, 'tok_forged');

    expect(badToken.statusCode).toBe(401);
    expect(errorCode(noToken.body)).toBe(errorCode(badToken.body));
    for (const body of [noToken.body, badToken.body]) {
      expect(body).not.toMatch(/NO_CREDENTIAL|SESSION_REJECTED|SESSION_UNVERIFIABLE/);
    }
  });

  // The refusal comes before the catalogue is consulted, so an unauthenticated caller cannot use
  // the endpoint to find out which dramas exist.
  it('refuses before it reveals whether the drama exists', async () => {
    await startApp();

    const real = await request('PUT', PUBLISHED);
    const invented = await request('PUT', 'drm_nope');

    expect(invented.statusCode).toBe(real.statusCode);
    expect(errorCode(invented.body)).toBe(errorCode(real.body));
  });
});

describe('GET /v1/dramas/:dramaId/favorite', () => {
  it('answers false for a drama the viewer does not follow, rather than 404', async () => {
    await startApp();

    const response = await request('GET', PUBLISHED, 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<FavoriteState>()).toEqual({ dramaId: PUBLISHED, favorited: false });
  });

  it('reports the favourite and when it was first recorded', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');
    const response = await request('GET', PUBLISHED, 'tok_a');

    expect(response.json<FavoriteState>()).toEqual({
      dramaId: PUBLISHED,
      favorited: true,
      favoritedAt: '2026-08-27T12:00:00.000Z',
    });
  });

  // A per-viewer answer in a shared cache is a cross-user leak waiting for a misconfigured proxy.
  it('forbids caching of a per-viewer answer', async () => {
    await startApp();

    const response = await request('GET', PUBLISHED, 'tok_a');

    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  // The row is why the drama is still on the viewer's favourites screen. Answering 410 here would
  // leave them unable to see what they are being shown.
  it('reads a favourite for a drama that has since been delisted', async () => {
    // Recorded directly, because the endpoint would refuse to create it now — which is the exact
    // situation a viewer is in the day a drama they follow is withdrawn.
    const favorites = createInMemoryFavoritesStore();
    await favorites.add('user_a', DELISTED, clockMs);
    await startApp({ favoritesStore: favorites });

    const response = await request('GET', DELISTED, 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<FavoriteState>()).toEqual({
      dramaId: DELISTED,
      favorited: true,
      favoritedAt: '2026-08-27T12:00:00.000Z',
    });
  });

  it('rejects a drama id longer than the bound', async () => {
    await startApp();

    const response = await request('GET', 'd'.repeat(65), 'tok_a');

    expect(response.statusCode).toBe(400);
    expect(errorCode(response.body)).toBe('COMMON_VALIDATION_FAILED');
  });

  it('returns no URL of any kind', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');
    const response = await request('GET', PUBLISHED, 'tok_a');

    expect(response.body).not.toMatch(/https?:\/\//);
  });
});

describe('PUT /v1/dramas/:dramaId/favorite', () => {
  it('answers 204 with an empty body', async () => {
    await startApp();

    const response = await request('PUT', PUBLISHED, 'tok_a');

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  // A double-tapped button is one decision, and "following since" is a fact about the viewer's
  // history rather than about their most recent tap.
  it('is idempotent, and does not move the timestamp', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');
    clockMs = Date.parse('2026-08-27T13:30:00.000Z');
    const second = await request('PUT', PUBLISHED, 'tok_a');

    expect(second.statusCode).toBe(204);
    expect((await request('GET', PUBLISHED, 'tok_a')).json<FavoriteState>().favoritedAt).toBe(
      '2026-08-27T12:00:00.000Z',
    );
  });

  it('records the server clock, not a client-supplied time', async () => {
    await startApp();
    clockMs = Date.parse('2026-08-27T13:30:00.000Z');

    await request('PUT', PUBLISHED, 'tok_a');

    expect((await request('GET', PUBLISHED, 'tok_a')).json<FavoriteState>().favoritedAt).toBe(
      '2026-08-27T13:30:00.000Z',
    );
  });

  // Following a drama creates a reference to it. A reference to something that does not exist
  // reaches the viewer as a permanently broken card on their favourites screen.
  it('refuses a drama that does not exist', async () => {
    await startApp();

    const response = await request('PUT', 'drm_nope', 'tok_a');

    expect(response.statusCode).toBe(404);
    const body = response.json<{
      error: { code: string; details: { resourceType: string; resourceId: string } };
    }>();
    expect(body.error.code).toBe('CONTENT_NOT_FOUND');
    expect(body.error.details).toEqual({ resourceType: 'drama', resourceId: 'drm_nope' });
  });

  // 410 would confirm that an unannounced drama exists, and an unpublished title is exactly what a
  // competitor would probe for.
  it('answers 404, not 410, for a drama that was never published', async () => {
    await startApp();

    const response = await request('PUT', UNPUBLISHED, 'tok_a');

    expect(response.statusCode).toBe(404);
    expect(errorCode(response.body)).toBe('CONTENT_NOT_FOUND');
  });

  it('answers 410 for a drama that was delisted', async () => {
    await startApp();

    const response = await request('PUT', DELISTED, 'tok_a');

    expect(response.statusCode).toBe(410);
    expect(errorCode(response.body)).toBe('CONTENT_OFFLINE');
  });

  it('stores nothing for a drama it refused', async () => {
    await startApp();

    await request('PUT', DELISTED, 'tok_a');

    expect((await request('GET', DELISTED, 'tok_a')).json<FavoriteState>().favorited).toBe(false);
  });

  it('rejects a drama id longer than the bound', async () => {
    await startApp();

    const response = await request('PUT', 'd'.repeat(65), 'tok_a');

    expect(response.statusCode).toBe(400);
    expect(errorCode(response.body)).toBe('COMMON_VALIDATION_FAILED');
  });
});

describe('DELETE /v1/dramas/:dramaId/favorite', () => {
  it('removes the favourite and answers 204', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');
    const response = await request('DELETE', PUBLISHED, 'tok_a');

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect((await request('GET', PUBLISHED, 'tok_a')).json<FavoriteState>()).toEqual({
      dramaId: PUBLISHED,
      favorited: false,
    });
  });

  // A retried DELETE is the reason DELETE is meant to be idempotent. A 404 for a row that is
  // already gone makes the retry look like a failure.
  it('answers 204 for a favourite that was not there', async () => {
    await startApp();

    expect((await request('DELETE', PUBLISHED, 'tok_a')).statusCode).toBe(204);
  });

  // Un-following must never be the operation that fails: refusing it for a delisted drama would
  // trap the row on the viewer's screen with no way to clear it.
  it.each([[DELISTED], [UNPUBLISHED], ['drm_nope']])(
    'answers 204 for %s, whatever the catalogue says',
    async (dramaId) => {
      await startApp();

      expect((await request('DELETE', dramaId, 'tok_a')).statusCode).toBe(204);
    },
  );

  it('lets a viewer follow again after unfollowing', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');
    await request('DELETE', PUBLISHED, 'tok_a');
    clockMs = Date.parse('2026-08-27T13:30:00.000Z');
    await request('PUT', PUBLISHED, 'tok_a');

    expect((await request('GET', PUBLISHED, 'tok_a')).json<FavoriteState>().favoritedAt).toBe(
      '2026-08-27T13:30:00.000Z',
    );
  });
});

describe('favourites are per viewer', () => {
  it('never serves one viewer the favourites of another', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');

    expect((await request('GET', PUBLISHED, 'tok_b')).json<FavoriteState>()).toEqual({
      dramaId: PUBLISHED,
      favorited: false,
    });
  });

  it('does not let one viewer remove another’s favourite', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');
    await request('DELETE', PUBLISHED, 'tok_b');

    expect((await request('GET', PUBLISHED, 'tok_a')).json<FavoriteState>().favorited).toBe(true);
  });

  it('keeps two dramas of one viewer independent', async () => {
    await startApp();

    await request('PUT', PUBLISHED, 'tok_a');
    await request('PUT', 'drm_sweet_0003', 'tok_a');
    await request('DELETE', PUBLISHED, 'tok_a');

    expect((await request('GET', PUBLISHED, 'tok_a')).json<FavoriteState>().favorited).toBe(false);
    expect((await request('GET', 'drm_sweet_0003', 'tok_a')).json<FavoriteState>().favorited).toBe(
      true,
    );
  });
});
