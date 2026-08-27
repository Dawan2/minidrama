// @vitest-environment node
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the JSON policy; this covers the
 * only thing L1 actually reads — the process exit status — because a check that reports
 * success without having seen Gitleaks is the same fail-open G2.8 closed for an empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-secrets.ts', import.meta.url));

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

function fakeGitleaks(script: string): string {
  const root = tempDir('fake-gitleaks-');
  const bin = join(root, 'gitleaks');
  writeFileSync(bin, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-secrets CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-secrets');
  });

  it('exits non-zero when the source has no files', () => {
    const root = tempDir('cli-secrets-empty-');
    const result = run(['--root', root, '--source', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('saw no files');
    expect(result.stdout).not.toContain('secrets passed');
  });

  it('exits non-zero when Gitleaks is missing', () => {
    const root = tempDir('cli-secrets-nobin-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export const x = 1\n');
    const result = run([
      '--root',
      root,
      '--source',
      root,
      '--gitleaks',
      join(root, 'no-such-gitleaks'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('gitleaks is required');
  });

  it('exits non-zero when Gitleaks reports a finding', () => {
    const root = tempDir('cli-secrets-hit-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export const x = 1\n');
    const bin = fakeGitleaks(`
process.stdout.write(JSON.stringify([{
  RuleID: 'aws-access-token',
  File: 'leak.env',
  StartLine: 1,
  Description: 'AWS Access Key',
}]));
process.exit(1);
`);
    const result = run(['--root', root, '--source', root, '--gitleaks', bin]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('secrets failed');
    expect(result.stderr).toContain('aws-access-token leak.env:1');
  });

  it('exits zero when Gitleaks returns an empty findings array', () => {
    const root = tempDir('cli-secrets-clean-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export const x = 1\n');
    const bin = fakeGitleaks(`
process.stdout.write('[]\\n');
process.exit(0);
`);
    const result = run(['--root', root, '--source', root, '--gitleaks', bin]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('secrets passed');
    expect(result.stdout).toContain('0 findings');
  });

  it('exits non-zero when a thinning .gitleaks.toml is present', () => {
    const root = tempDir('cli-secrets-toml-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export const x = 1\n');
    writeFileSync(join(root, '.gitleaks.toml'), 'title = "allow all"\n');
    const result = run(['--root', root, '--source', root, '--gitleaks', join(root, 'unused')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('thinning allowlists is G1.8 red');
  });
});
