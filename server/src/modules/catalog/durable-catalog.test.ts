import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DramaDetail } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { loadConfig } from '../../config.js';
import { openSqlite } from '../../db/sqlite.js';
import { SEED_CATALOG } from './store.js';

/**
 * C3-06, the next store after watch progress and the in-flight favourites slice: a drama
 * served, a process restart, the same GET /v1/dramas/{id} still answers. Unlock receipts,
 * sessions, webhook events, coin unlock orders, and watch progress already survive this
 * bounce; favourites persist too (`0006`, landed while this slot ran).
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
  const instance = await buildApp({
    ...loadConfig({ DATABASE_URL: `sqlite:${sqlitePath}` }),
    logLevel: 'silent',
  });
  await instance.ready();
  app = instance;
  return instance;
}

describe('a sqlite catalogue store survives a process restart', () => {
  it('still serves a published drama after the process is replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-catalog-'));
    dirs.push(dir);
    const sqlitePath = join(dir, 'app.sqlite');

    const first = await start(sqlitePath);
    const before = await first.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001',
    });
    expect(before.statusCode).toBe(200);
    expect(before.json<DramaDetail>().id).toBe('drm_revenge_0001');
    expect(before.json<DramaDetail>().title).toBe(
      SEED_CATALOG.dramas.find((drama) => drama.id === 'drm_revenge_0001')?.title,
    );

    await first.close();
    app = undefined;

    const second = await start(sqlitePath);
    const after = await second.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001',
    });
    expect(after.statusCode).toBe(200);
    expect(after.json<DramaDetail>()).toEqual(before.json<DramaDetail>());
  });

  it('does not revert an extra row to the seed on restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-catalog-'));
    dirs.push(dir);
    const sqlitePath = join(dir, 'app.sqlite');

    const first = await start(sqlitePath);
    await first.close();
    app = undefined;

    const db = openSqlite(sqlitePath);
    db.prepare(
      `INSERT INTO dramas (
        id, title, description, cover_url, horizontal_cover_url, category, tags, status,
        total_seasons, total_episodes, free_episodes, is_completed, release_at,
        play_count, favorite_count, score
      ) VALUES (
        'drm_extra_0009', 'Extra', '', 'https://cdn.example.invalid/covers/extra.jpg',
        NULL, 'OTHER', '[]', 'PUBLISHED', 0, 0, 0, 0, '2026-08-27T00:00:00.000Z', 9, 0, 0
      )`,
    ).run();
    db.close();

    const second = await start(sqlitePath);
    const listed = await second.inject({ method: 'GET', url: '/v1/dramas?sort=HOT' });
    expect(listed.statusCode).toBe(200);
    const ids = listed.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id);
    expect(ids).toContain('drm_extra_0009');
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
