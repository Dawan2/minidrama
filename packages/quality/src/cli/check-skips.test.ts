// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';
import { SKIP_CALL, emptyItFixture } from '../skips.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the scan; this covers the
 * only thing L1 actually reads — the process exit status — because a check that reports
 * success without having seen tests is the same fail-open G2.8 closed for an empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-skips.ts', import.meta.url));

function tsxBin(): string {
  const candidates = [
    join(packageRoot, 'node_modules', '.bin', 'tsx'),
    join(repoRoot, 'node_modules', '.bin', 'tsx'),
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

function tempDir(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  fixtures.push(root);
  return root;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-skips CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-skips');
  });

  it('exits non-zero when the source has no test files', () => {
    const root = tempDir('cli-skips-empty-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export const x = 1\n');
    const result = run(['--root', root, '--source', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('saw no tests');
    expect(result.stdout).not.toContain('skip-check passed');
  });

  it('exits non-zero when a test file contains a skip call', () => {
    const root = tempDir('cli-skips-hit-');
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src', 'blocked.test.ts'),
      `it${SKIP_CALL}'blocked', () => {\n  expect(1).toBe(1)\n})\n`,
    );
    const result = run(['--root', root, '--source', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('G1.10 red');
    expect(result.stderr).toContain('blocked.test.ts');
  });

  it('exits non-zero when a test file contains an empty it callback', () => {
    const root = tempDir('cli-skips-empty-it-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'blocked.test.ts'), `${emptyItFixture('blocked')}\n`);
    const result = run(['--root', root, '--source', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('empty');
    expect(result.stderr).toContain('blocked.test.ts');
  });

  it('exits zero when every test file has a body and no skip markers', () => {
    const root = tempDir('cli-skips-clean-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'ok.test.ts'), "it('ok', () => {\n  expect(1).toBe(1)\n})\n");
    const result = run(['--root', root, '--source', root]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('skip-check passed');
    expect(result.stdout).toContain('0 skips, 0 empty');
  });
});
