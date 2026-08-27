// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the rules; this covers the only
 * thing the L2 job actually reads — the process exit status — because a check that reports
 * success without having seen an install is the same fail-open the guardrail suite already closed.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-licenses.ts', import.meta.url));

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

function repoWithStore(
  packages: ReadonlyArray<{
    readonly name: string;
    readonly version: string;
    readonly license?: string;
  }>,
): string {
  const root = mkdtempSync(join(tmpdir(), 'check-licenses-'));
  fixtures.push(root);
  const store = join(root, 'node_modules', '.pnpm');
  mkdirSync(store, { recursive: true });

  for (const pkg of packages) {
    const dest = join(store, `${pkg.name}@${pkg.version}`, 'node_modules', pkg.name);
    mkdirSync(dest, { recursive: true });
    const body: Record<string, string> = { name: pkg.name, version: pkg.version };
    if (pkg.license !== undefined) body.license = pkg.license;
    writeFileSync(join(dest, 'package.json'), `${JSON.stringify(body)}\n`);
  }

  return root;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-licenses CLI', () => {
  it('exits non-zero when the pnpm store is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-licenses-empty-'));
    fixtures.push(root);
    const result = run(['--root', root]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the dependency store is required');
    expect(result.stdout).not.toContain('license whitelist passed');
  });

  it('exits non-zero when the store exists but contains no packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-licenses-blank-'));
    fixtures.push(root);
    mkdirSync(join(root, 'node_modules', '.pnpm'), { recursive: true });
    const result = run(['--root', root]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the dependency store is empty');
  });

  it('exits non-zero on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
  });

  it('exits non-zero when a forbidden license is in the store', () => {
    const root = repoWithStore([
      { name: 'clean', version: '1.0.0', license: 'MIT' },
      { name: 'copyleft', version: '2.0.0', license: 'GPL-3.0' },
    ]);
    const result = run(['--root', root]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('license whitelist failed');
    expect(result.stderr).toContain('copyleft@2.0.0');
    expect(result.stderr).toContain('GPL-3.0');
  });

  it('exits zero on a store of allow-listed licenses', () => {
    const root = repoWithStore([{ name: 'clean', version: '1.0.0', license: 'MIT' }]);
    const result = run(['--root', root]);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('license whitelist passed');
  });

  it("exits zero against this repository's real install", () => {
    const result = run(['--root', repoRoot]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/license whitelist passed \(\d+ packages\)/);
  });
});
