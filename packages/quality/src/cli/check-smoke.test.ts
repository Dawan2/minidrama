// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';
import { REQUIRED_SMOKE_SPEC_STEMS } from '../smoke.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover preflight and the runner; this
 * covers the only thing the L2 job actually reads — the process exit status — because a check
 * that reports success without having seen Playwright is the same fail-open G2.8 closed for an
 * empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-smoke.ts', import.meta.url));

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

function writeTree(root: string): void {
  mkdirSync(join(root, 'app', 'dist'), { recursive: true });
  mkdirSync(join(root, 'packages', 'quality', 'e2e', 'specs'), { recursive: true });
  writeFileSync(join(root, 'app', 'dist', 'index.html'), '<!doctype html><title>cli</title>');
  writeFileSync(
    join(root, 'packages', 'quality', 'e2e', 'playwright.config.ts'),
    'export default {};\n',
  );
  for (const stem of REQUIRED_SMOKE_SPEC_STEMS) {
    writeFileSync(
      join(root, 'packages', 'quality', 'e2e', 'specs', `${stem}.spec.ts`),
      `test('${stem}', async () => {});\n`,
    );
  }
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-smoke CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-smoke');
  });

  it('exits non-zero when the built client is absent', () => {
    const root = tempDir('cli-smoke-nodist-');
    mkdirSync(join(root, 'src'), { recursive: true });
    const result = run(['--root', root, '--dist', join(root, 'app', 'dist')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('app/dist/index.html is absent');
    expect(result.stdout).not.toContain('smoke passed');
  });

  it('exits non-zero when Playwright is missing', () => {
    const root = tempDir('cli-smoke-nobin-');
    writeTree(root);
    const result = run(['--root', root, '--playwright', join(root, 'no-such-playwright')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('playwright is required');
    expect(result.stdout).not.toContain('smoke passed');
  });
});
