import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * A SQLite connection. `node:sqlite` is the engine for this slice so CI does not need Postgres,
 * a native addon, or Redis. Production remains PostgreSQL (T14) behind the same store interfaces.
 */
export type SqliteDatabase = DatabaseSync;

export function openSqlite(
  path: string,
  options: { readonly readOnly?: boolean } = {},
): SqliteDatabase {
  if (path !== ':memory:' && options.readOnly !== true) {
    mkdirSync(dirname(path), { recursive: true });
  }

  return new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    readOnly: options.readOnly,
  });
}
