import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('reports the service as healthy', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'minidrama-api' });
  });
});

describe('unknown routes', () => {
  it('answers with the standard error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ error: { code: string; traceId: string } }>();
    expect(body.error.code).toBe('COMMON_RESOURCE_NOT_FOUND');
    expect(body.error.traceId).toMatch(/^req_/);
  });
});

describe('POST /v1/playback/sessions', () => {
  it('rejects a request without an episodeId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  it('issues a playback descriptor for an entitled episode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_free_0001' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      albumId: 'album_demo_0001',
      episodeId: 'ep_free_0001',
      vid: 'vid_demo_0001',
      resumePositionSec: 0,
    });
  });

  // Correction A4: playback authorization is identifier-based. A media URL in this response
  // would mean we had quietly rebuilt the self-hosted delivery path the platform forbids.
  it('never returns a media URL or a quality ladder', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_free_0001' },
    });

    expect(response.body).not.toMatch(/https?:\/\//);
    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|definitions?"/i);
  });

  it('denies a locked episode with unlock context rather than a generic error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      payload: { episodeId: 'ep_locked_0002' },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json<{ error: { code: string; details: { unlockOptions: string[] } } }>();
    expect(body.error.code).toBe('EPISODE_LOCKED');
    expect(body.error.details.unlockOptions).toContain('COINS');
  });
});
