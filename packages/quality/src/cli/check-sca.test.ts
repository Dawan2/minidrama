// @vitest-environment node
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';
import { LOCKFILE_NAME } from '../sca.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the JSON policy; this covers the
 * only thing the L2 job actually reads — the process exit status — because a check that reports
 * success without having seen Trivy is the same fail-open G2.8 closed for an empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-sca.ts', import.meta.url));

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

function fakeTrivy(script: string): string {
  const root = tempDir('fake-trivy-');
  const bin = join(root, 'trivy');
  writeFileSync(bin, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-sca CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-sca');
  });

  it('exits non-zero when the lockfile is absent', () => {
    const root = tempDir('cli-sca-nolock-');
    mkdirSync(join(root, 'src'), { recursive: true });
    const result = run(['--root', root, '--lockfile', join(root, LOCKFILE_NAME)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lockfile is required');
    expect(result.stdout).not.toContain('sca passed');
  });

  it('exits non-zero when Trivy is missing', () => {
    const root = tempDir('cli-sca-nobin-');
    writeFileSync(join(root, LOCKFILE_NAME), 'lockfileVersion: 9.0\n');
    const result = run([
      '--root',
      root,
      '--lockfile',
      join(root, LOCKFILE_NAME),
      '--trivy',
      join(root, 'no-such-trivy'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('trivy is required');
  });

  it('exits non-zero when Trivy reports a CRITICAL finding', () => {
    const root = tempDir('cli-sca-crit-');
    writeFileSync(join(root, LOCKFILE_NAME), 'lockfileVersion: 9.0\n');
    const bin = fakeTrivy(`
process.stdout.write(JSON.stringify({
  Results: [{
    Target: 'pnpm-lock.yaml',
    Class: 'lang-pkgs',
    Type: 'pnpm',
    Vulnerabilities: [{
      VulnerabilityID: 'CVE-2024-9999',
      PkgName: 'evil',
      InstalledVersion: '1.0.0',
      FixedVersion: '',
      Severity: 'CRITICAL',
    }],
  }],
}));
process.exit(0);
`);
    const result = run(['--root', root, '--lockfile', join(root, LOCKFILE_NAME), '--trivy', bin]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sca failed');
    expect(result.stderr).toContain('CVE-2024-9999');
  });

  it('exits zero when Trivy returns a language-package target and no blocking findings', () => {
    const root = tempDir('cli-sca-clean-');
    writeFileSync(join(root, LOCKFILE_NAME), 'lockfileVersion: 9.0\n');
    const bin = fakeTrivy(`
process.stdout.write(JSON.stringify({
  Results: [{ Target: 'pnpm-lock.yaml', Class: 'lang-pkgs', Type: 'pnpm' }],
}));
process.exit(0);
`);
    const result = run(['--root', root, '--lockfile', join(root, LOCKFILE_NAME), '--trivy', bin]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sca passed');
  });
});
