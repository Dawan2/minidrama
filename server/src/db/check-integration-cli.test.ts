import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * Exit-code tests for the L2 entry point. The library tests cover the rules; this covers the only
 * thing the G2.2 job actually reads — the process exit status — because a check that reports
 * success without having talked to a file is the same fail-open `check-migrate` closed for a
 * no-op down.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-integration-cli.ts', import.meta.url));

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
  const result = spawnSync(tsxBin(), [cli, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-integration CLI', () => {
  it('exits non-zero on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits non-zero when --db is given without a path', () => {
    const result = run(['--db']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--db requires a path');
  });

  it('exits non-zero on a postgres URL rather than rewriting it to a file', () => {
    const result = run(['--database-url', 'postgres://localhost/minidrama']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scheme "postgres"');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits non-zero on :memory:', () => {
    const result = run(['--db', ':memory:']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(':memory: is not a database');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits zero against a temp sqlite file in this repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-integration-cli-live-'));
    fixtures.push(dir);

    const result = run(['--db', join(dir, 'g22.sqlite')]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sqlite integration passed');
    expect(result.stderr).not.toContain('in-memory');
    expect(result.stderr).not.toContain('postgres');
  });
});
