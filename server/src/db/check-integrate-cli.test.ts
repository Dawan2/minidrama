import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * Exit-code tests for the L2 entry point. The library tests cover the rules; this covers the only
 * thing the G2.2 job actually reads — the process exit status — because a check that reports
 * success against postgres:// or :memory: is the same fail-open `check-migrate` closed for a
 * no-op down.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-integrate-cli.ts', import.meta.url));

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

describe('check-integrate CLI', () => {
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

  it('exits non-zero when --url is given without a value', () => {
    const result = run(['--url']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--url requires a DATABASE_URL');
  });

  it('exits non-zero on a postgres URL rather than rewriting it to a file', () => {
    const result = run(['--url', 'postgres://localhost/minidrama']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scheme "postgres"');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits non-zero on sqlite :memory:', () => {
    const result = run(['--url', 'sqlite::memory:']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('in-memory is not an integration suite');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits zero against a real sqlite file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-integrate-cli-'));
    fixtures.push(dir);

    const result = run(['--db', join(dir, 'g22.sqlite')]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'integrate against sqlite passed (catalogue, session, favourite bounce, gateway refused)',
    );
    expect(result.stderr).not.toContain('in-memory');
    expect(result.stderr).not.toContain('postgres');
  });
});
