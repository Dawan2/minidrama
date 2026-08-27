import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkMigrateCycle } from './check-migrate.js';
import { defaultMigrationsDir } from './migrate.js';

/**
 * Reverse verification for G2.7. The L2 job runs the CLI; these fixtures are the injection that
 * proves a down which does not drop a table, or an up-only file, turns the check red. A coverage
 * number without a failing fixture is the D-01 shape; a migrate job that only runs `up` is the
 * same shape for rollback.
 */

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function sqlitePath(dir: string): string {
  return join(dir, 'g27.sqlite');
}

describe('checkMigrateCycle', () => {
  it('passes up → down → up against the real migrations', () => {
    const dir = tempDir('check-migrate-real-');
    const result = checkMigrateCycle({ dir: defaultMigrationsDir(), path: sqlitePath(dir) });

    expect(result).toEqual({
      ok: true,
      migrations: [
        '0001_unlocks',
        '0002_sessions',
        '0003_webhook_events',
        '0004_unlock_orders',
        '0005_watch_progress',
        '0006_favorites',
        '0007_catalog',
        '0008_ad_unlock',
      ],
      tables: [
        'ad_reward_log',
        'ad_unlock_sessions',
        'dramas',
        'episodes',
        'favorite',
        'seasons',
        'sessions',
        'unlock_orders',
        'unlocks',
        'watch_progress',
        'webhook_events',
        'webhook_idempotency_keys',
      ],
      message: 'migrate up → down → up passed (8 migrations, 12 tables)',
    });
  });

  it('fails when the migrations directory is empty', () => {
    const dir = tempDir('check-migrate-empty-');
    const result = checkMigrateCycle({ dir, path: sqlitePath(dir) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('the migrations directory is empty');
  });

  it('fails on an up file that has no matching down file', () => {
    const dir = tempDir('check-migrate-orphan-');
    writeFileSync(join(dir, '0002_orphan.up.sql'), 'CREATE TABLE orphan (id TEXT);');

    const result = checkMigrateCycle({ dir, path: sqlitePath(dir) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('0002_orphan has no 0002_orphan.down.sql');
    expect(result.message).toContain('an up-only file is not a migration');
  });

  it('fails when a down file does not drop the table the up created', () => {
    const dir = tempDir('check-migrate-noop-down-');
    writeFileSync(join(dir, '0001_unlocks.up.sql'), 'CREATE TABLE unlocks (id TEXT);');
    writeFileSync(join(dir, '0001_unlocks.down.sql'), '-- forgot to drop\n');

    const result = checkMigrateCycle({ dir, path: sqlitePath(dir) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('down did not drop: unlocks');
    expect(result.message).toContain('a no-op down is not a migration');
  });

  it('fails when a down drops only some of the tables the up created', () => {
    const dir = tempDir('check-migrate-partial-down-');
    writeFileSync(
      join(dir, '0001_pair.up.sql'),
      'CREATE TABLE unlocks (id TEXT);\nCREATE TABLE sessions (id TEXT);\n',
    );
    writeFileSync(join(dir, '0001_pair.down.sql'), 'DROP TABLE IF EXISTS unlocks;\n');

    const result = checkMigrateCycle({ dir, path: sqlitePath(dir) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('down did not drop: sessions');
    expect(result.message).not.toContain('unlocks');
  });
});
