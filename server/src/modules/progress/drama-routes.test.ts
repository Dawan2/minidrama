import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { DramaProgressView } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createCatalogDramaProgressPort } from '../catalog/drama-progress-lookup.js';
import { createFakeSessionResolver } from './test-sessions.js';
import { createInMemoryCatalogStore } from '../catalog/store.js';
import { createUnavailableDramaProgressCatalogPort } from './drama-catalog-port.js';
import { createUnresolvedViewerResolver } from '../entitlement/viewer-resolver.js';
import { loadConfig } from '../../config.js';
import { DRAMA_PROGRESS_PATH } from './drama-routes.js';
import type { AppDependencies } from '../../app.js';

/**
 * `GET /v1/progress/dramas/{dramaId}` over HTTP.
 *
 * The assembled app wires the seed catalogue, so a signed-in viewer who has never reported a
 * position is answered `200 { items: [], lastWatched: null }` — that is "never watched this",
 * and it is not `503`. Tests that need the catalogue down inject the unavailable port; tests
 * that need rows PUT through the per-episode write so the two registrations share one store.
 */

let app: FastifyInstance;
let clockMs = Date.parse('2026-08-27T12:00:00.000Z');

async function startApp(dependencies: AppDependencies = {}): Promise<void> {
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      viewerResolver: createFakeSessionResolver(),
      now: () => clockMs,
      ...dependencies,
    },
  );
  await app.ready();
}

async function startDeployedApp(): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
}

function dramaUrl(dramaId: string): string {
  return `/v1/progress/dramas/${dramaId}`;
}

function getDrama(dramaId: string, token?: string) {
  return app.inject({
    method: 'GET',
    url: dramaUrl(dramaId),
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function putEpisode(episodeId: string, positionSec: number, atIso: string, token: string) {
  return app.inject({
    method: 'PUT',
    url: `/v1/progress/episodes/${episodeId}`,
    payload: { positionSec, durationSec: 95, clientUpdatedAt: atIso },
    headers: { authorization: `Bearer ${token}` },
  });
}

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

afterEach(async () => {
  clockMs = Date.parse('2026-08-27T12:00:00.000Z');
  await app.close();
});

describe('GET /v1/progress/dramas/:dramaId — without a resolvable viewer', () => {
  it('refuses with the app as deployed today, which issues no session to this token', async () => {
    await startDeployedApp();

    const response = await getDrama('drm_revenge_0001', 'tok_a');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('refuses a request that carries no credential, and does not look like an empty watch', async () => {
    await startApp();

    const response = await getDrama('drm_revenge_0001');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
    expect(response.body).not.toMatch(/"items"/);
  });

  it('does not tell the caller which credential problem it hit', async () => {
    await startApp();

    const noToken = await getDrama('drm_revenge_0001');
    const badToken = await getDrama('drm_revenge_0001', 'tok_forged');

    expect(badToken.statusCode).toBe(401);
    expect(errorCode(noToken)).toBe(errorCode(badToken));
    for (const body of [noToken.body, badToken.body]) {
      expect(body).not.toMatch(/NO_CREDENTIAL|SESSION_REJECTED|SESSION_UNRESOLVABLE/);
    }
  });

  it('answers 503 when sessions cannot be resolved, not an empty list', async () => {
    await startApp({ viewerResolver: createUnresolvedViewerResolver() });

    const response = await getDrama('drm_revenge_0001', 'tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.json()).not.toMatchObject({ items: [] });
  });
});

describe('GET /v1/progress/dramas/:dramaId — signed in', () => {
  it('answers 200 with no items when this viewer has never watched the drama', async () => {
    await startApp();

    const response = await getDrama('drm_revenge_0001', 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<DramaProgressView>()).toEqual({ items: [], lastWatched: null });
  });

  it('forbids caching of a per-viewer answer, including on the refusal', async () => {
    await startApp();

    expect((await getDrama('drm_revenge_0001', 'tok_a')).headers['cache-control']).toBe(
      'private, no-store',
    );
    expect((await getDrama('drm_revenge_0001')).headers['cache-control']).toBe('private, no-store');
  });

  it('returns the stored rows, numbered by catalog, after the per-episode write', async () => {
    await startApp();

    expect(
      (await putEpisode('ep_revenge_e01', 45, '2026-08-27T12:00:00.000Z', 'tok_a')).statusCode,
    ).toBe(204);
    expect(
      (await putEpisode('ep_revenge_e02', 90, '2026-08-27T12:01:00.000Z', 'tok_a')).statusCode,
    ).toBe(204);

    const response = await getDrama('drm_revenge_0001', 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<DramaProgressView>()).toEqual({
      items: [
        {
          episodeId: 'ep_revenge_e01',
          episodeNumber: 1,
          positionSec: 45,
          completed: false,
        },
        {
          episodeId: 'ep_revenge_e02',
          episodeNumber: 2,
          positionSec: 90,
          completed: true,
        },
      ],
      lastWatched: { episodeId: 'ep_revenge_e02', episodeNumber: 2, positionSec: 90 },
    });
  });

  it('numbers a later-season episode across the drama, not as episode 1 of its season', async () => {
    await startApp();

    await putEpisode('ep_dynasty_s2e01', 30, '2026-08-27T12:00:00.000Z', 'tok_a');
    const response = await getDrama('drm_dynasty_0002', 'tok_a');

    expect(response.json<DramaProgressView>().items).toEqual([
      {
        episodeId: 'ep_dynasty_s2e01',
        episodeNumber: 4,
        positionSec: 30,
        completed: false,
      },
    ]);
  });

  it('does not leak another viewer’s rows', async () => {
    await startApp();

    await putEpisode('ep_revenge_e01', 45, '2026-08-27T12:00:00.000Z', 'tok_a');
    const other = await getDrama('drm_revenge_0001', 'tok_b');

    expect(other.json<DramaProgressView>()).toEqual({ items: [], lastWatched: null });
  });

  it('does not emit a row for another drama, a draft, or an offline season', async () => {
    await startApp();

    await putEpisode('ep_revenge_e01', 20, '2026-08-27T12:00:00.000Z', 'tok_a');
    await putEpisode('ep_revenge_e08', 20, '2026-08-27T12:00:00.000Z', 'tok_a');
    await putEpisode('ep_dynasty_s3e01', 20, '2026-08-27T12:00:00.000Z', 'tok_a');

    const revenge = await getDrama('drm_revenge_0001', 'tok_a');
    const dynasty = await getDrama('drm_dynasty_0002', 'tok_a');

    expect(revenge.json<DramaProgressView>().items.map((item) => item.episodeId)).toEqual([
      'ep_revenge_e01',
    ]);
    expect(dynasty.json<DramaProgressView>().items).toEqual([]);
  });

  it('answers empty for a drama the catalogue does not list, not a 404 that the picker would retry', async () => {
    await startApp();

    const response = await getDrama('drm_not_a_thing', 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<DramaProgressView>()).toEqual({ items: [], lastWatched: null });
  });

  it('refuses a drama id past the bound', async () => {
    await startApp();

    const response = await getDrama('d'.repeat(65), 'tok_a');

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
  });
});

describe('GET /v1/progress/dramas/:dramaId — catalogue down', () => {
  it('answers 503 rather than an empty list when rows exist and catalog cannot number them', async () => {
    await startApp({
      dramaProgressCatalogPort: createUnavailableDramaProgressCatalogPort(),
    });

    await putEpisode('ep_revenge_e01', 45, '2026-08-27T12:00:00.000Z', 'tok_a');
    const response = await getDrama('drm_revenge_0001', 'tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/"items":\[\]/);
    expect(response.body).not.toMatch(/ep_revenge_e01/);
  });

  it('answers 503 even when the store is empty, rather than claiming the viewer watched nothing', async () => {
    await startApp({
      dramaProgressCatalogPort: createUnavailableDramaProgressCatalogPort(),
    });

    const response = await getDrama('drm_revenge_0001', 'tok_a');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
  });

  it('registers the documented path, not a colon-less alias the contract would miss', () => {
    expect(DRAMA_PROGRESS_PATH).toBe('/v1/progress/dramas/:dramaId');
  });
});

describe('GET /v1/progress/dramas/:dramaId — the seed adapter', () => {
  it('is the same catalogue the episode list is served from', async () => {
    const catalogStore = createInMemoryCatalogStore();
    await startApp({
      catalogStore,
      dramaProgressCatalogPort: createCatalogDramaProgressPort(catalogStore),
    });

    await putEpisode('ep_dynasty_s2e01', 12, '2026-08-27T12:00:00.000Z', 'tok_a');
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/dramas/drm_dynasty_0002/episodes?limit=100',
    });
    const progress = await getDrama('drm_dynasty_0002', 'tok_a');

    const episodes = listed.json<{
      items: readonly { id: string; globalEpisodeNumber: number }[];
    }>().items;
    const seasonTwo = episodes.find((episode) => episode.id === 'ep_dynasty_s2e01');

    expect(seasonTwo?.globalEpisodeNumber).toBe(4);
    expect(progress.json<DramaProgressView>().items[0]?.episodeNumber).toBe(
      seasonTwo?.globalEpisodeNumber,
    );
  });
});
