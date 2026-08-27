import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { createSqliteFavoritesStore } from './sqlite-favorites-store.js';

const NOW = Date.parse('2026-08-27T12:00:00.000Z');

describe('createSqliteFavoritesStore — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a favourite after the connection is closed and reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-favorites-'));
    dirs.push(dir);
    const path = join(dir, 'favorites.sqlite');

    const first = openMigratedSqlite(path);
    await createSqliteFavoritesStore(first).add('user_a', 'drm_1', NOW);
    first.close();

    const second = openMigratedSqlite(path);
    const found = await createSqliteFavoritesStore(second).read('user_a', 'drm_1');
    second.close();

    expect(found).toEqual({ userId: 'user_a', dramaId: 'drm_1', favoritedAtMs: NOW });
  });

  it('stores created_at_ms as INTEGER milliseconds, not TEXT', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-favorites-'));
    dirs.push(dir);
    const path = join(dir, 'favorites.sqlite');
    const db = openMigratedSqlite(path);
    await createSqliteFavoritesStore(db).add('user_a', 'drm_1', NOW);
    await createSqliteFavoritesStore(db).add('user_a', 'drm_1', NOW + 60_000);

    const rows = db.prepare('SELECT drama_id, created_at_ms FROM favorite').all();
    db.close();

    expect(rows).toEqual([{ drama_id: 'drm_1', created_at_ms: NOW }]);
    expect(typeof rows[0]?.['created_at_ms']).toBe('number');
  });
});
