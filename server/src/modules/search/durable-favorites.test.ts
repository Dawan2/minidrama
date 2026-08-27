import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { ok } from '@minidrama/shared';
import type { FavoriteList, FavoriteState } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { loadConfig } from '../../config.js';

/**
 * C3-06, the next store after watch progress: a favourite written, a process restart, the
 * same GET still reports it. Unlock receipts, sessions, webhook events, and watch progress
 * already survive this bounce; the order store stays in memory.
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

describe('a sqlite favorites store survives a process restart', () => {
  it('still reports a favourite after the process is replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-favorites-'));
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
          url: '/v1/dramas/drm_revenge_0001/favorite',
          headers: { authorization: `Bearer ${accessToken}` },
        })
      ).statusCode,
    ).toBe(204);

    const before = await first.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001/favorite',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json<FavoriteState>()).toMatchObject({
      dramaId: 'drm_revenge_0001',
      favorited: true,
    });
    expect(before.json<FavoriteState>().favoritedAt).toEqual(expect.any(String));

    const listBefore = await first.inject({
      method: 'GET',
      url: '/v1/users/me/favorites',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listBefore.statusCode).toBe(200);
    expect(listBefore.json<FavoriteList>().items.map((item) => item.dramaId)).toEqual([
      'drm_revenge_0001',
    ]);

    await first.close();
    app = undefined;

    const second = await start(sqlitePath);
    const after = await second.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001/favorite',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(after.statusCode).toBe(200);
    expect(after.json<FavoriteState>()).toEqual(before.json<FavoriteState>());

    const listAfter = await second.inject({
      method: 'GET',
      url: '/v1/users/me/favorites',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listAfter.statusCode).toBe(200);
    expect(listAfter.json<FavoriteList>()).toEqual(listBefore.json<FavoriteList>());
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
