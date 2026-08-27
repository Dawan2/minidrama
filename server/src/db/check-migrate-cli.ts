#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkMigrateCycle } from './check-migrate.js';
import { defaultMigrationsDir } from './migrate.js';

/**
 * `pnpm --filter @minidrama/server check:migrate` — the G2.7 L2 job.
 *
 * A temp sqlite file is created when `--db` is omitted, so CI does not need `DATABASE_URL` and
 * cannot pass by pointing at an already-migrated file that was never rolled back.
 */

const USAGE = 'usage: check-migrate [--dir <migrations-dir>] [--db <sqlite-path>]';

interface ParsedArgs {
  readonly dir: string;
  readonly dbPath: string | undefined;
}

type ParseResult =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly message: string };

function parseArgs(argv: readonly string[], defaultDir: string): ParseResult {
  let dir = defaultDir;
  let dbPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--dir' && flag !== '--db') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, message: `${flag} requires a ${flag === '--db' ? 'path' : 'directory'}` };
    }
    if (flag === '--dir') {
      dir = value;
    } else {
      dbPath = value;
    }
    index += 1;
  }

  return { ok: true, args: { dir, dbPath } };
}

const parsed = parseArgs(process.argv.slice(2), defaultMigrationsDir());

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

let dbPath = parsed.args.dbPath;
let tempRoot: string | undefined;
if (dbPath === undefined) {
  tempRoot = mkdtempSync(join(tmpdir(), 'check-migrate-'));
  dbPath = join(tempRoot, 'g27.sqlite');
}

const result = checkMigrateCycle({ dir: parsed.args.dir, path: dbPath });
if (tempRoot !== undefined) {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (!result.ok) {
  process.stderr.write(`${result.message}\n`);
  process.exit(1);
}

process.stdout.write(`${result.message}\n`);
