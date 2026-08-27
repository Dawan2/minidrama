// @vitest-environment node
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the subject policy; this covers
 * the only thing L1 actually reads — the process exit status — because a check that reports
 * success without having seen git is the same fail-open G2.8 closed for an empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-commits.ts', import.meta.url));

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

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
}

function initRepo(): string {
  const root = tempDir('cli-commits-');
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'dev@example.com']);
  git(root, ['config', 'user.name', 'Dev']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(root, 'README.md'), 'init\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'chore: initial']);
  return root;
}

function fakeGit(script: string): string {
  const root = tempDir('fake-git-');
  const bin = join(root, 'git');
  writeFileSync(bin, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-commits CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-commits');
  });

  it('exits non-zero when git is missing', () => {
    const root = tempDir('cli-commits-nobin-');
    mkdirSync(join(root, 'src'));
    const result = run(['--root', root, '--base', 'main', '--git', join(root, 'no-such-git')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('git is required');
    expect(result.stdout).not.toContain('commits passed');
  });

  it('exits non-zero when a unique commit is prose — rewriting it is not the gate', () => {
    const root = initRepo();
    git(root, ['checkout', '-b', 'feature']);
    writeFileSync(join(root, 'note.txt'), 'work\n');
    git(root, ['add', 'note.txt']);
    git(root, ['commit', '-m', 'Wire the skip detector']);
    const result = run(['--root', root, '--base', 'main']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('commits failed (1)');
    expect(result.stderr).toContain('Wire the skip detector');
    expect(result.stdout).not.toContain('commits passed');
  });

  it('exits zero when the unique commit is conventional and carries a tracker id', () => {
    const root = initRepo();
    git(root, ['checkout', '-b', 'feature']);
    writeFileSync(join(root, 'note.txt'), 'work\n');
    git(root, ['add', 'note.txt']);
    git(root, ['commit', '-m', 'feat(g1.9): add skip detection']);
    const result = run(['--root', root, '--base', 'main']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'commits passed (1 new commits vs main, 0 prose, 0 missing-id)',
    );
  });

  it('exits non-zero when a conventional commit has no requirement/defect id', () => {
    const root = initRepo();
    git(root, ['checkout', '-b', 'feature']);
    writeFileSync(join(root, 'note.txt'), 'work\n');
    git(root, ['add', 'note.txt']);
    git(root, ['commit', '-m', 'feat: add skip detection']);
    const result = run(['--root', root, '--base', 'main']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing-id');
    expect(result.stderr).toContain('feat: add skip detection');
    expect(result.stdout).not.toContain('commits passed');
  });

  it('skips a merge commit so absorbing main does not rewrite history', () => {
    const root = initRepo();
    git(root, ['checkout', '-b', 'feature']);
    writeFileSync(join(root, 'note.txt'), 'work\n');
    git(root, ['add', 'note.txt']);
    git(root, ['commit', '-m', 'feat(g1.9): add skip detection']);
    git(root, ['checkout', 'main']);
    writeFileSync(join(root, 'other.txt'), 'trunk\n');
    git(root, ['add', 'other.txt']);
    git(root, ['commit', '-m', 'chore: trunk move']);
    git(root, ['checkout', 'feature']);
    const merge = spawnSync(
      'git',
      ['merge', 'main', '-m', 'Merge main into feature without a conventional type'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(merge.status).toBe(0);
    const result = run(['--root', root, '--base', 'main']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'commits passed (1 new commits vs main, 0 prose, 0 missing-id)',
    );
  });

  it('exits zero on an empty range — HEAD is already the base', () => {
    const root = initRepo();
    const result = run(['--root', root, '--base', 'main']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'commits passed (0 new commits vs main, 0 prose, 0 missing-id)',
    );
  });

  it('exits non-zero when a fake git reports a finding-shaped prose subject', () => {
    const root = tempDir('cli-commits-fake-');
    mkdirSync(join(root, '.git'));
    const bin = fakeGit(`
const argv = process.argv.slice(2).join(' ');
if (argv.includes('rev-parse')) { process.stdout.write('aaa\\n'); process.exit(0); }
if (argv.includes('merge-base')) { process.stdout.write('aaa\\n'); process.exit(0); }
if (argv.includes('log')) {
  process.stdout.write('Add the L1 G1.10 skip/empty-test job: a committed skip is red\\n');
  process.exit(0);
}
process.exit(1);
`);
    const result = run(['--root', root, '--base', 'main', '--git', bin]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Add the L1 G1.10 skip/empty-test job');
  });
});
