#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkSqliteIntegration, sqliteFileUrl } from './check-integration.js';

/**
 * `pnpm --filter @minidrama/server check:integration` — the G2.2 L2 job.
 *
 * A temp sqlite file is created when `--db` and `--database-url` are omitted, so CI does not need
 * `DATABASE_URL` and cannot pass by pointing at an in-memory store or a postgres URL rewritten to
 * a file.
 */

const USAGE = 'usage: check-integration [--db <sqlite-path>] [--database-url <url>]';

interface ParsedArgs {
  readonly databaseUrl: string | undefined;
}

type ParseResult =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly message: string };

function parseIntegrationArgs(argv: readonly string[]): ParseResult {
  let databaseUrl: string | undefined;
  let dbPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--db' && flag !== '--database-url') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return {
        ok: false,
        message: `${flag} requires a ${flag === '--db' ? 'path' : 'url'}`,
      };
    }
    if (flag === '--db') {
      dbPath = value;
    } else {
      databaseUrl = value;
    }
    index += 1;
  }

  if (databaseUrl !== undefined && dbPath !== undefined) {
    return { ok: false, message: 'pass --db or --database-url, not both' };
  }

  if (databaseUrl !== undefined) {
    return { ok: true, args: { databaseUrl } };
  }
  if (dbPath !== undefined) {
    return { ok: true, args: { databaseUrl: sqliteFileUrl(dbPath) } };
  }
  return { ok: true, args: { databaseUrl: undefined } };
}

const parsed = parseIntegrationArgs(process.argv.slice(2));

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

let databaseUrl = parsed.args.databaseUrl;
let tempRoot: string | undefined;
if (databaseUrl === undefined) {
  tempRoot = mkdtempSync(join(tmpdir(), 'check-integration-'));
  databaseUrl = sqliteFileUrl(join(tempRoot, 'g22.sqlite'));
}

const result = await checkSqliteIntegration({ databaseUrl });
if (tempRoot !== undefined) {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (!result.ok) {
  process.stderr.write(`${result.message}\n`);
  process.exit(1);
}

process.stdout.write(`${result.message}\n`);
