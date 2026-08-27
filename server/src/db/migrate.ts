import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openSqlite } from './sqlite.js';
import type { SqliteDatabase } from './sqlite.js';

/**
 * Reversible SQL migrations.
 *
 * drizzle-kit's runner is forward-only. C2's exit standard (`docs/plan/wave-protocol.md` §5.1) is
 * that migrations run forward **and** roll back, both exercised in CI, so the files are plain SQL
 * with a matching `.down.sql` and this runner applies both directions. A later slot can generate
 * the SQL with drizzle-kit; it cannot drop the down files and still meet the standard.
 *
 * The journal is `schema_migrations`. It is created by the runner rather than by a migration,
 * because a migration cannot record that it ran until the journal exists.
 */

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function defaultMigrationsDir(): string {
  return DEFAULT_MIGRATIONS_DIR;
}

export interface Migration {
  readonly id: string;
  readonly upSql: string;
  readonly downSql: string;
}

export interface MigrationBatch {
  readonly applied: readonly string[];
}

export function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): readonly Migration[] {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith('.up.sql'))
    .sort();
  return names.map((upName) => {
    const id = upName.slice(0, -'.up.sql'.length);
    const downName = `${id}.down.sql`;
    let downSql: string;
    try {
      downSql = readFileSync(join(dir, downName), 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error(
          `Migration ${id} has no ${downName}. C2 requires rollback; an up-only file is not a migration.`,
        );
      }
      throw error;
    }

    return {
      id,
      upSql: readFileSync(join(dir, upName), 'utf8'),
      downSql,
    };
  });
}

function ensureJournal(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL
    )
  `);
}

function appliedIds(db: SqliteDatabase): string[] {
  ensureJournal(db);
  const rows = db.prepare('SELECT id FROM schema_migrations ORDER BY id').all();
  const ids: string[] = [];
  for (const row of rows) {
    const id = row['id'];
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

function runInTransaction(db: SqliteDatabase, sql: string, after: () => void): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    after();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function migrateUp(
  db: SqliteDatabase,
  options: { readonly dir?: string; readonly nowMs?: number } = {},
): MigrationBatch {
  const migrations = loadMigrations(options.dir);
  const applied = new Set(appliedIds(db));
  const nowMs = options.nowMs ?? Date.now();
  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at_ms) VALUES (?, ?)');
  const ran: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    runInTransaction(db, migration.upSql, () => {
      insert.run(migration.id, nowMs);
    });
    ran.push(migration.id);
  }

  return { applied: ran };
}

export function migrateDown(
  db: SqliteDatabase,
  options: { readonly dir?: string; readonly steps?: number } = {},
): MigrationBatch {
  const migrations = loadMigrations(options.dir);
  const byId = new Map(migrations.map((migration) => [migration.id, migration]));
  const applied = appliedIds(db).sort().reverse();
  const steps = options.steps ?? applied.length;
  const remove = db.prepare('DELETE FROM schema_migrations WHERE id = ?');
  const ran: string[] = [];

  for (const id of applied.slice(0, steps)) {
    const migration = byId.get(id);
    if (migration === undefined) {
      throw new Error(`schema_migrations names ${id}, but there is no matching SQL on disk.`);
    }
    runInTransaction(db, migration.downSql, () => {
      remove.run(id);
    });
    ran.push(id);
  }

  return { applied: ran };
}

/** Open a file (or `:memory:`), apply every pending up migration, and return the connection. */
export function openMigratedSqlite(
  path: string,
  options: { readonly dir?: string } = {},
): SqliteDatabase {
  const db = openSqlite(path);
  migrateUp(db, options.dir === undefined ? {} : { dir: options.dir });
  return db;
}
