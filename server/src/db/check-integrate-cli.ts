#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkIntegrate } from './check-integrate.js';

/**
 * `pnpm --filter @minidrama/server check:integrate` — the G2.2 L2 job.
 *
 * A temp sqlite file is created when `--db` / `--url` are omitted, so CI does not need
 * `DATABASE_URL` and cannot pass by pointing at an in-memory store that never bounced.
 */

const USAGE = 'usage: check-integrate [--db <sqlite-path>] [--url <DATABASE_URL>]';

interface ParsedArgs {
  readonly databaseUrl: string | undefined;
}

type ParseResult =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly message: string };

function parseArgs(argv: readonly string[]): ParseResult {
  let databaseUrl: string | undefined;
  let dbPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--db' && flag !== '--url') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return {
        ok: false,
        message: `${flag} requires a ${flag === '--url' ? 'DATABASE_URL' : 'path'}`,
      };
    }
    if (flag === '--db') {
      if (databaseUrl !== undefined) {
        return { ok: false, message: '--db and --url cannot both be set' };
      }
      dbPath = value;
    } else {
      if (dbPath !== undefined) {
        return { ok: false, message: '--db and --url cannot both be set' };
      }
      databaseUrl = value;
    }
    index += 1;
  }

  if (dbPath !== undefined) {
    return { ok: true, args: { databaseUrl: `sqlite:${dbPath}` } };
  }
  return { ok: true, args: { databaseUrl } };
}

const parsed = parseArgs(process.argv.slice(2));

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

let databaseUrl = parsed.args.databaseUrl;
let tempRoot: string | undefined;
if (databaseUrl === undefined) {
  tempRoot = mkdtempSync(join(tmpdir(), 'check-integrate-'));
  databaseUrl = `sqlite:${join(tempRoot, 'g22.sqlite')}`;
}

const result = await checkIntegrate({ databaseUrl });
if (tempRoot !== undefined) {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (!result.ok) {
  process.stderr.write(`${result.message}\n`);
  process.exit(1);
}

process.stdout.write(`${result.message}\n`);
