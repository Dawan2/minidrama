import { loadMigrations, migrateDown, migrateUp } from './migrate.js';
import { openSqlite } from './sqlite.js';
import type { SqliteDatabase } from './sqlite.js';

/**
 * G2.7 (`docs/14-quality-gates.md` §4): migrations run forward, they roll back, and the tables
 * they created are gone after down. The unit suite already asserts this; this module is the L2
 * job's entry so a no-op down or an up-only file fails CI the same way a forbidden license fails
 * G2.8 — by the process exit status, not by a comment.
 *
 * Postgres is T14 and is not rewritten to a file. This check uses sqlite, which is the durable
 * slice the runner actually applies today.
 */

const USER_TABLES_SQL = `
  SELECT name FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'
  ORDER BY name
`;

export function listUserTables(db: SqliteDatabase): string[] {
  const rows = db.prepare(USER_TABLES_SQL).all();
  return rows.flatMap((row) => (typeof row['name'] === 'string' ? [row['name']] : []));
}

export type MigrateCheckResult =
  | {
      readonly ok: true;
      readonly migrations: readonly string[];
      readonly tables: readonly string[];
      readonly message: string;
    }
  | { readonly ok: false; readonly message: string };

export function checkMigrateCycle(options: {
  readonly dir: string;
  readonly path: string;
}): MigrateCheckResult {
  let migrations: ReturnType<typeof loadMigrations>;
  try {
    migrations = loadMigrations(options.dir);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  if (migrations.length === 0) {
    return {
      ok: false,
      message: 'the migrations directory is empty: a migrate check that saw no files has not run',
    };
  }

  const db = openSqlite(options.path);
  try {
    migrateUp(db, { dir: options.dir });
    const afterUp = listUserTables(db);
    if (afterUp.length === 0) {
      return {
        ok: false,
        message: 'migrate up created no tables: a no-op up is not a migration',
      };
    }

    migrateDown(db, { dir: options.dir });
    const afterDown = listUserTables(db);
    if (afterDown.length > 0) {
      return {
        ok: false,
        message:
          `down did not drop: ${afterDown.join(', ')}. ` +
          'G2.7 requires rollback; a no-op down is not a migration.',
      };
    }

    migrateUp(db, { dir: options.dir });
    const afterSecond = listUserTables(db);
    if (afterSecond.join('\0') !== afterUp.join('\0')) {
      return {
        ok: false,
        message:
          `second up tables [${afterSecond.join(', ')}] do not match first up ` +
          `[${afterUp.join(', ')}]`,
      };
    }

    return {
      ok: true,
      migrations: migrations.map((migration) => migration.id),
      tables: afterSecond,
      message:
        `migrate up → down → up passed (${String(migrations.length)} migrations, ` +
        `${String(afterSecond.length)} tables)`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    db.close();
  }
}
