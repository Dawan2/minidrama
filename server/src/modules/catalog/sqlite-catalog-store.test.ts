import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { SEED_CATALOG } from './store.js';
import { createSqliteCatalogStore, dramasByIdsSql } from './sqlite-catalog-store.js';

describe('createSqliteCatalogStore — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the seed after the connection is closed and reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-catalog-'));
    dirs.push(dir);
    const path = join(dir, 'catalog.sqlite');

    const first = openMigratedSqlite(path);
    const before = await createSqliteCatalogStore(first).getDrama('drm_revenge_0001');
    first.close();

    const second = openMigratedSqlite(path);
    const after = await createSqliteCatalogStore(second).getDrama('drm_revenge_0001');
    const count = second.prepare('SELECT COUNT(*) AS n FROM dramas').get()?.['n'];
    second.close();

    expect(before?.drama.id).toBe('drm_revenge_0001');
    expect(after).toEqual(before);
    expect(count).toBe(SEED_CATALOG.dramas.length);
  });

  it('does not re-seed a file that already holds the catalogue', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-catalog-'));
    dirs.push(dir);
    const path = join(dir, 'catalog.sqlite');

    const first = openMigratedSqlite(path);
    createSqliteCatalogStore(first);
    first
      .prepare(
        `INSERT INTO dramas (
          id, title, description, cover_url, horizontal_cover_url, category, tags, status,
          total_seasons, total_episodes, free_episodes, is_completed, release_at,
          play_count, favorite_count, score
        ) VALUES (
          'drm_extra_0009', 'Extra', '', 'https://cdn.example.invalid/covers/extra.jpg',
          NULL, 'OTHER', '[]', 'PUBLISHED', 0, 0, 0, 0, '2026-08-27T00:00:00.000Z', 1, 0, 0
        )`,
      )
      .run();
    first.close();

    const second = openMigratedSqlite(path);
    const store = createSqliteCatalogStore(second);
    const extra = await store.getDrama('drm_extra_0009');
    const listed = await store.listDramas({ sort: 'HOT' });
    second.close();

    expect(extra?.drama.title).toBe('Extra');
    expect(listed.map((drama) => drama.id)).toContain('drm_extra_0009');
  });

  it('stores is_completed as INTEGER 0/1, not TEXT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-catalog-'));
    dirs.push(dir);
    const path = join(dir, 'catalog.sqlite');
    const db = openMigratedSqlite(path);
    createSqliteCatalogStore(db);

    const rows = db
      .prepare('SELECT id, is_completed FROM dramas WHERE id IN (?, ?) ORDER BY id')
      .all('drm_revenge_0001', 'drm_dynasty_0002');
    db.close();

    expect(rows.every((row) => typeof row['is_completed'] === 'number')).toBe(true);
    expect(rows.every((row) => row['is_completed'] === 0 || row['is_completed'] === 1)).toBe(true);
  });

  it('asks sqlite for a page of ids in one IN list, not one statement per id', () => {
    expect(dramasByIdsSql(1).match(/\?/g)).toHaveLength(1);
    expect(dramasByIdsSql(20).match(/\?/g)).toHaveLength(20);
    expect(dramasByIdsSql(20).match(/SELECT/g)).toHaveLength(1);
    expect(() => dramasByIdsSql(0)).toThrow(/at least one id/);
  });
});
