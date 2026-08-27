import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openMigratedSqlite } from '../../db/migrate.js';
import { createSqliteWatchProgressStore } from './sqlite-watch-progress-store.js';
import type { WatchProgressRecord } from './progress.js';

const NOW_MS = Date.parse('2026-08-27T12:00:00.000Z');

function record(overrides: Partial<WatchProgressRecord> = {}): WatchProgressRecord {
  return {
    userId: 'user_a',
    episodeId: 'ep_1',
    positionSec: 90,
    durationSec: 95,
    completed: true,
    clientUpdatedAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
    ...overrides,
  };
}

describe('createSqliteWatchProgressStore — durability', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a completed mark after the connection is closed and reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-progress-'));
    dirs.push(dir);
    const path = join(dir, 'progress.sqlite');

    const first = openMigratedSqlite(path);
    await createSqliteWatchProgressStore(first).save(record());
    first.close();

    const second = openMigratedSqlite(path);
    const found = await createSqliteWatchProgressStore(second).read('user_a', 'ep_1');
    second.close();

    expect(found).toEqual(record());
  });

  it('stores completed as INTEGER 0/1, not TEXT', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-progress-'));
    dirs.push(dir);
    const path = join(dir, 'progress.sqlite');
    const db = openMigratedSqlite(path);
    await createSqliteWatchProgressStore(db).save(record({ completed: true }));
    await createSqliteWatchProgressStore(db).save(
      record({ episodeId: 'ep_2', positionSec: 45, completed: false }),
    );

    const rows = db
      .prepare('SELECT episode_id, completed FROM watch_progress ORDER BY episode_id')
      .all();
    db.close();

    expect(rows).toEqual([
      { episode_id: 'ep_1', completed: 1 },
      { episode_id: 'ep_2', completed: 0 },
    ]);
    expect(typeof rows[0]?.['completed']).toBe('number');
  });
});
