import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Exit-code tests for the process the L2 job starts. The library tests cover the rules by calling
 * `runIntegrateCli` directly (so V8 coverage sees them). This file is the remaining injection:
 * a check that reports success against postgres:// is the same fail-open G2.7 closed for a no-op
 * down, and the job only reads the process status.
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

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-integrate CLI process', () => {
  it('exits non-zero on a postgres URL rather than rewriting it to a file', () => {
    const result = run(['--url', 'postgres://localhost/minidrama']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scheme "postgres"');
    expect(result.stdout).not.toContain('passed');
  });

  it('exits zero against a real sqlite file', () => {
    const result = run([]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'integrate against sqlite passed (catalogue, session, favourite bounce, gateway refused)',
    );
  });
});
