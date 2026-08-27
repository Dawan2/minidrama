import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { EpisodeResumeView } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createSessionViewerResolver } from './viewer.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';

/**
 * The two endpoints over HTTP.
 *
 * Tests inject a resolver so there is an authenticated viewer to be per-user *about*: the default
 * resolver refuses everything, which is the subject of the first group below rather than an obstacle
 * to the rest. `tok_a` is `user_a` and `tok_b` is `user_b`; nothing else resolves.
 */

const SESSIONS: Record<string, string> = { tok_a: 'user_a', tok_b: 'user_b' };

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

function url(episodeId: string): string {
  return `/v1/progress/episodes/${episodeId}`;
}

function put(episodeId: string, payload: unknown, token?: string) {
  return app.inject({
    method: 'PUT',
    url: url(episodeId),
    payload: payload as object,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function get(episodeId: string, token?: string) {
  return app.inject({
    method: 'GET',
    url: url(episodeId),
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function reportBody(positionSec: number, atIso: string, durationSec = 95) {
  return { positionSec, durationSec, clientUpdatedAt: atIso };
}

afterEach(async () => {
  clockMs = Date.parse('2026-08-27T12:00:00.000Z');
  await app.close();
});

describe('watch progress — without a resolvable viewer', () => {
  // No session in this deployment is verifiable, so the endpoint accepts nothing. A resolver that
  // trusted a token, or a user id from a header, would let a caller choose whose progress to write.
  it('refuses to write with the app as deployed today', async () => {
    await startDeployedApp();

    const response = await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_REQUIRED');
  });

  it('refuses a read with no credential', async () => {
    await startApp();

    const response = await get('ep_1');

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AUTH_REQUIRED');
  });

  it('refuses a write with no credential, and stores nothing', async () => {
    await startApp();

    expect((await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'))).statusCode).toBe(401);

    const read = await get('ep_1', 'tok_a');
    expect(read.json<EpisodeResumeView>().recorded).toBe(false);
  });

  // Which of "no token", "bad token" and "we cannot check tokens" applies is operator information.
  it('does not tell the caller which credential problem it hit', async () => {
    await startApp();

    const noToken = await get('ep_1');
    const badToken = await get('ep_1', 'tok_forged');

    expect(badToken.statusCode).toBe(401);
    expect(noToken.json<{ error: { code: string } }>().error.code).toBe(
      badToken.json<{ error: { code: string } }>().error.code,
    );
    for (const body of [noToken.body, badToken.body]) {
      expect(body).not.toMatch(/NO_CREDENTIAL|SESSION_REJECTED|SESSION_UNVERIFIABLE/);
    }
  });
});

describe('GET /v1/progress/episodes/:episodeId', () => {
  it('answers zero for an episode the viewer never watched, rather than 404', async () => {
    await startApp();

    const response = await get('ep_never', 'tok_a');

    expect(response.statusCode).toBe(200);
    expect(response.json<EpisodeResumeView>()).toEqual({
      episodeId: 'ep_never',
      resumePositionSec: 0,
      completed: false,
      recorded: false,
    });
  });

  it('names the field resumePositionSec, as the playback descriptor does', async () => {
    await startApp();

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');
    const response = await get('ep_1', 'tok_a');

    expect(response.json<EpisodeResumeView>()).toMatchObject({
      episodeId: 'ep_1',
      resumePositionSec: 45,
      durationSec: 95,
      completed: false,
      recorded: true,
      updatedAt: '2026-08-27T12:00:00.000Z',
    });
  });

  // A per-viewer answer in a shared cache is a cross-user leak waiting for a misconfigured proxy.
  it('forbids caching of a per-viewer answer', async () => {
    await startApp();

    const response = await get('ep_1', 'tok_a');

    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('rejects an episode id longer than the bound', async () => {
    await startApp();

    const response = await get('e'.repeat(65), 'tok_a');

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  // Recorded because it is surprising, not because it is wanted. Past Fastify's default
  // `maxParamLength` of 100 the router refuses the request before any handler or error handler runs,
  // so this is the one failure in the server that does not wear our error envelope. Our own bound is
  // tighter, so no plausible identifier reaches it — and if the framework ever starts routing this
  // through `setErrorHandler`, this test is where that shows up.
  it('is refused by the router itself past the framework parameter limit', async () => {
    await startApp();

    const response = await get('e'.repeat(200), 'tok_a');

    expect(response.statusCode).toBe(414);
    expect(response.json<{ code: string }>().code).toBe('FST_ERR_MAX_PARAM_LENGTH');
  });

  it('returns no media URL of any kind', async () => {
    await startApp();

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');
    const response = await get('ep_1', 'tok_a');

    expect(response.body).not.toMatch(/https?:\/\//);
    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|vid"/i);
  });
});

describe('PUT /v1/progress/episodes/:episodeId', () => {
  it('answers 204 with an empty body', async () => {
    await startApp();

    const response = await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('is an upsert: the second report replaces the first', async () => {
    await startApp();

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');
    await put('ep_1', reportBody(60, '2026-08-27T12:00:10.000Z'), 'tok_a');

    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(60);
  });

  it('clamps a position that overshoots the duration', async () => {
    await startApp();

    await put('ep_1', reportBody(96, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(95);
  });

  it('refuses a position that cannot be true of the episode', async () => {
    await startApp();

    const response = await put('ep_1', reportBody(100_000, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: { code: string; details: { positionSec: number; durationSec: number } };
    }>();
    expect(body.error.code).toBe('PROGRESS_INVALID_POSITION');
    expect(body.error.details).toEqual({ positionSec: 100_000, durationSec: 95 });
  });

  it.each([
    [{}, 'positionSec'],
    [{ positionSec: 45 }, 'durationSec'],
    [{ positionSec: 45, durationSec: 95 }, 'clientUpdatedAt'],
    [{ positionSec: 45, durationSec: 95, clientUpdatedAt: 'yesterday' }, 'clientUpdatedAt'],
    [
      { positionSec: '45', durationSec: 95, clientUpdatedAt: '2026-08-27T12:00:00Z' },
      'positionSec',
    ],
  ])('rejects %j, naming the field %s', async (payload, field) => {
    await startApp();

    const response = await put('ep_1', payload, 'tok_a');

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: { code: string; details: { fields: { field: string }[] } };
    }>();
    expect(body.error.code).toBe('COMMON_VALIDATION_FAILED');
    expect(body.error.details.fields[0]?.field).toBe(field);
  });

  // `docs/12-error-catalog.md` §8: progress reporting is deliberately tolerant. A stale report is
  // not a client error, and telling the client otherwise teaches it to retry a report it is right
  // to have dropped.
  it('answers 204 for a stale report and keeps the newer position', async () => {
    await startApp();

    await put('ep_1', reportBody(60, '2026-08-27T12:00:10.000Z'), 'tok_a');
    const stale = await put('ep_1', reportBody(12, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect(stale.statusCode).toBe(204);
    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(60);
  });

  it('does not rewind for backward jitter, but honours a real rewind', async () => {
    await startApp();

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');
    await put('ep_1', reportBody(44, '2026-08-27T12:00:10.000Z'), 'tok_a');
    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(45);

    await put('ep_1', reportBody(20, '2026-08-27T12:00:20.000Z'), 'tok_a');
    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(20);
  });

  it('marks completion server-side and ignores a client that claims it', async () => {
    await startApp();

    await put('ep_1', { ...reportBody(10, '2026-08-27T12:00:00.000Z'), completed: true }, 'tok_a');

    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().completed).toBe(false);

    await put('ep_1', reportBody(90, '2026-08-27T12:00:10.000Z'), 'tok_a');

    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().completed).toBe(true);
  });

  it('records the server clock as updatedAt, not the client one', async () => {
    await startApp();
    clockMs = Date.parse('2026-08-27T13:30:00.000Z');

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().updatedAt).toBe(
      '2026-08-27T13:30:00.000Z',
    );
  });
});

describe('watch progress is per user and per episode', () => {
  it('never serves one viewer the position of another', async () => {
    await startApp();

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');
    await put('ep_1', reportBody(5, '2026-08-27T12:00:00.000Z'), 'tok_b');

    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(45);
    expect((await get('ep_1', 'tok_b')).json<EpisodeResumeView>().resumePositionSec).toBe(5);
  });

  it('does not surface one report on another viewer’s untouched episode', async () => {
    await startApp();

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect((await get('ep_1', 'tok_b')).json<EpisodeResumeView>()).toMatchObject({
      resumePositionSec: 0,
      recorded: false,
    });
  });

  it('keeps two episodes of one viewer independent', async () => {
    await startApp();

    await put('ep_1', reportBody(45, '2026-08-27T12:00:00.000Z'), 'tok_a');
    await put('ep_2', reportBody(5, '2026-08-27T12:00:00.000Z'), 'tok_a');

    expect((await get('ep_1', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(45);
    expect((await get('ep_2', 'tok_a')).json<EpisodeResumeView>().resumePositionSec).toBe(5);
  });
});
