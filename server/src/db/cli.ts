#!/usr/bin/env node
import { loadConfig } from '../config.js';
import { databaseNotWiredMessage } from './database-url.js';
import { migrateDown, openMigratedSqlite } from './migrate.js';
import { openSqlite } from './sqlite.js';

/**
 * `pnpm --filter @minidrama/server migrate` and `migrate:down`.
 *
 * Tests call `migrateUp` / `migrateDown` directly so CI exercises both directions without this
 * wrapper. The CLI exists so an operator can do the same against a file.
 */

const direction = process.argv[2] ?? 'up';

if (direction !== 'up' && direction !== 'down') {
  console.error('Usage: tsx src/db/cli.ts [up|down]');
  process.exit(1);
}

const database = loadConfig().database;

if (database.kind === 'memory') {
  console.error('DATABASE_URL is unset. Nothing to migrate. Set DATABASE_URL=sqlite:<path>.');
  process.exit(1);
}

if (database.kind === 'unwired') {
  console.error(databaseNotWiredMessage(database.scheme));
  process.exit(1);
}

if (direction === 'up') {
  const db = openMigratedSqlite(database.path);
  db.close();
  process.stdout.write(`migrated up ${database.path}\n`);
} else {
  const db = openSqlite(database.path);
  const batch = migrateDown(db);
  db.close();
  process.stdout.write(
    `migrated down ${batch.applied.join(', ') || '(nothing)'} on ${database.path}\n`,
  );
}
