import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadMigrations, migrateDown, migrateUp, openMigratedSqlite } from './migrate.js';
import { openSqlite } from './sqlite.js';
import type { SqliteDatabase } from './sqlite.js';

/**
 * C2's first exit condition, as commands: migrations run forward, they roll back, and after a
 * rollback the table they created is gone — so a later `INSERT` fails. Running only `up` would
 * leave rollback as documentation.
 */

const USER_TABLES = `
  SELECT name FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'
  ORDER BY name
`;

let db: SqliteDatabase | undefined;
const tempDirs: string[] = [];

afterEach(() => {
  db?.close();
  db = undefined;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function memory(): SqliteDatabase {
  db = openSqlite(':memory:');
  return db;
}

function tables(connection: SqliteDatabase): string[] {
  const rows = connection.prepare(USER_TABLES).all();
  return rows.flatMap((row) => (typeof row['name'] === 'string' ? [row['name']] : []));
}

describe('migrateUp / migrateDown', () => {
  it('creates the unlocks, sessions, webhook event, unlock order, watch-progress, and favorites tables on the way up', () => {
    const connection = memory();

    expect(migrateUp(connection)).toEqual({
      applied: [
        '0001_unlocks',
        '0002_sessions',
        '0003_webhook_events',
        '0004_unlock_orders',
        '0005_watch_progress',
        '0006_favorites',
      ],
    });
    expect(tables(connection)).toEqual([
      'favorite',
      'sessions',
      'unlock_orders',
      'unlocks',
      'watch_progress',
      'webhook_events',
      'webhook_idempotency_keys',
    ]);
  });

  it('is a no-op the second time', () => {
    const connection = memory();
    migrateUp(connection);

    expect(migrateUp(connection)).toEqual({ applied: [] });
  });

  it('drops the favorites, watch-progress, unlock order, webhook, sessions, and unlocks tables on the way down', () => {
    const connection = memory();
    migrateUp(connection);

    expect(migrateDown(connection)).toEqual({
      applied: [
        '0006_favorites',
        '0005_watch_progress',
        '0004_unlock_orders',
        '0003_webhook_events',
        '0002_sessions',
        '0001_unlocks',
      ],
    });
    expect(tables(connection)).toEqual([]);
  });

  it('is a no-op when nothing has been applied', () => {
    expect(migrateDown(memory())).toEqual({ applied: [] });
  });

  /**
   * Reverse verification: after rollback, the table the up migration created is gone, so an
   * insert that would have succeeded now fails. After a second up, it succeeds again. A down
   * file that did not actually reverse the up would leave this green if we only checked the
   * journal.
   */
  it('refuses an insert after rollback, and accepts one after a second up', () => {
    const connection = memory();
    const insert = () =>
      connection
        .prepare(
          `INSERT INTO unlocks (
            id, user_id, episode_id, drama_id, method, cost_coins, order_id, granted_at_ms
          ) VALUES ('ulk_1', 'usr_1', 'ep_1', 'drm_1', 'COIN', 300, 'uord_1', 0)`,
        )
        .run();

    migrateUp(connection);
    expect(insert().changes).toBe(1);

    migrateDown(connection);
    expect(insert).toThrow(/no such table: unlocks/i);
    expect(() =>
      connection
        .prepare(
          `INSERT INTO sessions (fingerprint, user_id, expires_at_ms, created_at_ms)
           VALUES ('fp', 'usr_1', 0, 0)`,
        )
        .run(),
    ).toThrow(/no such table: sessions/i);
    expect(() =>
      connection
        .prepare(
          `INSERT INTO webhook_events (
            id, source, raw_payload, headers, received_at_ms, verified, processed
          ) VALUES ('evt_1', 'TIKTOK', x'7b7d', '{}', 0, 0, 0)`,
        )
        .run(),
    ).toThrow(/no such table: webhook_events/i);
    expect(() =>
      connection
        .prepare(
          `INSERT INTO unlock_orders (
            id, user_id, episode_id, drama_id, price_coins, trade_order_id, idempotency_key,
            status, created_at_ms
          ) VALUES ('uord_1', 'usr_1', 'ep_1', 'drm_1', 300, 'tto_1', 'key-1', 'PENDING', 0)`,
        )
        .run(),
    ).toThrow(/no such table: unlock_orders/i);
    expect(() =>
      connection
        .prepare(
          `INSERT INTO watch_progress (
            user_id, episode_id, position_sec, duration_sec, completed,
            client_updated_at_ms, updated_at_ms
          ) VALUES ('usr_1', 'ep_1', 45, 95, 1, 0, 0)`,
        )
        .run(),
    ).toThrow(/no such table: watch_progress/i);
    expect(() =>
      connection
        .prepare(
          `INSERT INTO favorite (user_id, drama_id, created_at_ms) VALUES ('usr_1', 'drm_1', 0)`,
        )
        .run(),
    ).toThrow(/no such table: favorite/i);

    migrateUp(connection);
    expect(insert().changes).toBe(1);
    expect(
      connection
        .prepare(
          `INSERT INTO sessions (fingerprint, user_id, expires_at_ms, created_at_ms)
           VALUES ('fp', 'usr_1', 0, 0)`,
        )
        .run().changes,
    ).toBe(1);
    expect(
      connection
        .prepare(
          `INSERT INTO webhook_events (
            id, source, raw_payload, headers, received_at_ms, verified, processed
          ) VALUES ('evt_1', 'TIKTOK', x'7b7d', '{}', 0, 0, 0)`,
        )
        .run().changes,
    ).toBe(1);
    expect(
      connection
        .prepare(`INSERT INTO webhook_idempotency_keys (key) VALUES ('trade_order:to_1')`)
        .run().changes,
    ).toBe(1);
    expect(
      connection
        .prepare(
          `INSERT INTO unlock_orders (
            id, user_id, episode_id, drama_id, price_coins, trade_order_id, idempotency_key,
            status, created_at_ms
          ) VALUES ('uord_1', 'usr_1', 'ep_1', 'drm_1', 300, 'tto_1', 'key-1', 'PENDING', 0)`,
        )
        .run().changes,
    ).toBe(1);
    expect(
      connection
        .prepare(
          `INSERT INTO watch_progress (
            user_id, episode_id, position_sec, duration_sec, completed,
            client_updated_at_ms, updated_at_ms
          ) VALUES ('usr_1', 'ep_1', 45, 95, 1, 0, 0)`,
        )
        .run().changes,
    ).toBe(1);
    expect(
      connection
        .prepare(
          `INSERT INTO favorite (user_id, drama_id, created_at_ms) VALUES ('usr_1', 'drm_1', 0)`,
        )
        .run().changes,
    ).toBe(1);
  });

  it('refuses an up file that has no matching down file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-migrate-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, '0002_orphan.up.sql'), 'CREATE TABLE orphan (id TEXT);');

    expect(() => loadMigrations(dir)).toThrow(/0002_orphan has no 0002_orphan.down.sql/);
  });

  it('openMigratedSqlite applies pending ups on a file that survives close', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-migrate-'));
    tempDirs.push(dir);
    const path = join(dir, 'app.sqlite');

    const first = openMigratedSqlite(path);
    first.close();

    const second = openSqlite(path);
    db = second;
    expect(tables(second)).toEqual([
      'favorite',
      'sessions',
      'unlock_orders',
      'unlocks',
      'watch_progress',
      'webhook_events',
      'webhook_idempotency_keys',
    ]);
    expect(migrateUp(second)).toEqual({ applied: [] });
  });
});
