import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { DramaSearchResults } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { loadConfig } from '../../config.js';
import { openSqlite } from '../../db/sqlite.js';

/**
 * C3-06, after catalogue sqlite (`0007`): search is a directory over that store, not a second
 * table of titles. A process restart still returns the same hits, including a drama that exists
 * only in the sqlite file — so the answer cannot be rehydration from the shipped seed.
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

function ids(results: DramaSearchResults): readonly string[] {
  return results.items.map((item) => item.dramaId);
}

describe('a sqlite catalogue store survives a process restart as search hits', () => {
  it('still returns a seeded hit, and a drama written only to the file, after the process is replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-search-'));
    dirs.push(dir);
    const sqlitePath = join(dir, 'app.sqlite');

    const first = await start(sqlitePath);
    const before = await first.inject({ method: 'GET', url: '/v1/search?q=sweet' });
    expect(before.statusCode).toBe(200);
    expect(ids(before.json<DramaSearchResults>())).toEqual(['drm_sweet_0003']);

    await first.close();
    app = undefined;

    const db = openSqlite(sqlitePath);
    db.prepare(
      `INSERT INTO dramas (
        id, title, description, cover_url, horizontal_cover_url, category, tags, status,
        total_seasons, total_episodes, free_episodes, is_completed, release_at,
        play_count, favorite_count, score
      ) VALUES (
        'drm_durable_w13', 'Zxq Durable Probe', '',
        'https://cdn.example.invalid/covers/zxq.jpg', NULL, 'OTHER', '[]', 'PUBLISHED',
        0, 0, 0, 0, '2026-08-27T00:00:00.000Z', 7, 0, 0
      )`,
    ).run();
    db.close();

    const second = await start(sqlitePath);
    const seeded = await second.inject({ method: 'GET', url: '/v1/search?q=sweet' });
    expect(seeded.statusCode).toBe(200);
    expect(seeded.json<DramaSearchResults>()).toEqual(before.json<DramaSearchResults>());

    const extra = await second.inject({ method: 'GET', url: '/v1/search?q=Zxq' });
    expect(extra.statusCode).toBe(200);
    expect(ids(extra.json<DramaSearchResults>())).toEqual(['drm_durable_w13']);
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
