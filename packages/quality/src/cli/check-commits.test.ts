// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the policy; this covers the
 * only thing L1 actually reads — the process exit status — because a check that reports
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

function gitAt(cwd: string, argv: readonly string[]): { status: number; stderr: string } {
  const result = spawnSync('git', [...argv], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'G1.9',
      GIT_AUTHOR_EMAIL: 'g19@invalid',
      GIT_COMMITTER_NAME: 'G1.9',
      GIT_COMMITTER_EMAIL: 'g19@invalid',
    },
  });
  return { status: result.status ?? -1, stderr: result.stderr };
}

function initRepo(prefix: string): string {
  const root = tempDir(prefix);
  expect(gitAt(root, ['init', '-b', 'main']).status).toBe(0);
  expect(gitAt(root, ['config', 'user.name', 'G1.9']).status).toBe(0);
  expect(gitAt(root, ['config', 'user.email', 'g19@invalid']).status).toBe(0);
  expect(gitAt(root, ['config', 'commit.gpgsign', 'false']).status).toBe(0);
  return root;
}

function commitFile(root: string, relative: string, body: string, message: string): void {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
  expect(gitAt(root, ['add', relative]).status).toBe(0);
  const committed = gitAt(root, ['commit', '-m', message]);
  expect(committed.status).toBe(0);
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

  it('exits non-zero when the base ref is missing', () => {
    const root = tempDir('cli-commits-nofrom-');
    const result = run(['--root', root, '--from', 'origin/main', '--to', 'HEAD']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/git is required|not a git repository/);
    expect(result.stdout).not.toContain('commit-check passed');
  });

  it('exits non-zero when a new commit is a prose subject', () => {
    const root = initRepo('cli-commits-prose-');
    commitFile(root, 'README.md', 'base\n', 'ci(g1.9): seed the base so history stays');
    expect(gitAt(root, ['checkout', '-b', 'work']).status).toBe(0);
    commitFile(root, 'job.ts', 'export const x = 1\n', 'Add the lint job');
    const result = run(['--root', root, '--from', 'main', '--to', 'HEAD']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('G1.9 red');
    expect(result.stderr).toContain('Add the lint job');
  });

  it('exits zero when every new commit is Conventional Commits with a tracker id', () => {
    const root = initRepo('cli-commits-ok-');
    commitFile(root, 'README.md', 'base\n', 'prose history on main is not rewritten');
    expect(gitAt(root, ['checkout', '-b', 'work']).status).toBe(0);
    commitFile(root, 'job.ts', 'export const x = 1\n', 'ci(g1.9): fail a prose subject');
    const result = run(['--root', root, '--from', 'main', '--to', 'HEAD']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('commit-check passed');
    expect(result.stdout).toContain('0 prose');
  });

  it('exits zero on an empty range so history on main is not rewritten', () => {
    const root = initRepo('cli-commits-empty-');
    commitFile(root, 'README.md', 'base\n', 'prose history on main is not rewritten');
    const result = run(['--root', root, '--from', 'main', '--to', 'HEAD']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 new commits');
  });
});
