import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { ok } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';
import type { DramaProgressView } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { loadConfig } from '../../config.js';

/**
 * C3-06, the next store after webhook events: a completed mark written, a process restart, the
 * same GET /v1/progress/dramas/{id} still paints it. Unlock receipts, sessions, and webhook
 * events already survive this bounce; the order store stays in memory.
 */

const dirs: string[] = [];
let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app !== undefined) {
    await app.close();
    app = undefined;
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

async function start(sqlitePath: string): Promise<FastifyInstance> {
  const instance = await buildApp(
    { ...loadConfig({ DATABASE_URL: `sqlite:${sqlitePath}` }), logLevel: 'silent' },
    {
      identityPort: { exchangeAuthCode: async () => ok({ openId: 'open_durable' }) },
    },
  );
  await instance.ready();
  app = instance;
  return instance;
}

describe('a sqlite watch-progress store survives a process restart', () => {
  it('still paints a completed mark after the process is replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-progress-'));
    dirs.push(dir);
    const sqlitePath = join(dir, 'app.sqlite');

    const first = await start(sqlitePath);
    const login = await first.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { provider: 'TIKTOK', authCode: 'code_abc' },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken } = login.json<{ accessToken: string }>();

    expect(
      (
        await first.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_revenge_e01',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            positionSec: 45,
            durationSec: 95,
            clientUpdatedAt: '2026-08-27T12:00:00.000Z',
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await first.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_revenge_e02',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            positionSec: 90,
            durationSec: 95,
            clientUpdatedAt: '2026-08-27T12:01:00.000Z',
          },
        })
      ).statusCode,
    ).toBe(204);

    const before = await first.inject({
      method: 'GET',
      url: '/v1/progress/dramas/drm_revenge_0001',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json<DramaProgressView>()).toEqual({
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

    await first.close();
    app = undefined;

    const second = await start(sqlitePath);
    const after = await second.inject({
      method: 'GET',
      url: '/v1/progress/dramas/drm_revenge_0001',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(after.statusCode).toBe(200);
    expect(after.json<DramaProgressView>()).toEqual(before.json<DramaProgressView>());
    expect(
      after.json<DramaProgressView>().items.find((item) => item.episodeId === 'ep_revenge_e02')
        ?.completed,
    ).toBe(true);
  });

  it('refuses to start behind a postgres URL rather than serving a file', async () => {
    await expect(
      buildApp({
        ...loadConfig({ DATABASE_URL: 'postgres://localhost/minidrama' }),
        logLevel: 'silent',
      }),
    ).rejects.toThrow(/scheme "postgres"/);
  });
});
