import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { defaultMigrationsDir } from './migrate.js';

/**
 * Exit-code tests for the L2 entry point. The library tests cover the rules; this covers the only
 * thing the G2.7 job actually reads — the process exit status — because a check that reports
 * success without having rolled back is the same fail-open `check-licenses` closed for an empty
 * store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-migrate-cli.ts', import.meta.url));

function tsxBin(): string {
  const candidates = [
    join(packageRoot, 'node_modules', '.bin', 'tsx'),
    join(packageRoot, '..', 'node_modules', '.bin', 'tsx'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`tsx not found in ${candidates.join(', ')}`);
  }
  return found;
}

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop() ?? '', { recursive: true, force: true });
  }
});

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-migrate CLI', () => {
  it('exits non-zero on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits non-zero when --dir is given without a directory', () => {
    const result = run(['--dir']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--dir requires a directory');
  });

  it('exits non-zero when a down file does not drop the table the up created', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-migrate-cli-noop-'));
    fixtures.push(dir);
    writeFileSync(join(dir, '0001_unlocks.up.sql'), 'CREATE TABLE unlocks (id TEXT);');
    writeFileSync(join(dir, '0001_unlocks.down.sql'), '-- forgot to drop\n');

    const result = run(['--dir', dir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('down did not drop: unlocks');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits non-zero on an up-only file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-migrate-cli-orphan-'));
    fixtures.push(dir);
    writeFileSync(join(dir, '0002_orphan.up.sql'), 'CREATE TABLE orphan (id TEXT);');

    const result = run(['--dir', dir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('0002_orphan has no 0002_orphan.down.sql');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits zero against the real migrations in this repository', () => {
    const result = run(['--dir', defaultMigrationsDir()]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('migrate up → down → up passed (7 migrations, 10 tables)');
    expect(result.stderr).not.toContain('did not drop');
    expect(result.stderr).not.toContain('up-only');
  });
});
