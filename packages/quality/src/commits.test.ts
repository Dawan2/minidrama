import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './paths.js';
import {
  CONVENTIONAL_TYPES,
  DEFAULT_FROM,
  DEFAULT_TO,
  LOG_FORMAT,
  TRACKER_RE,
  USAGE,
  buildLogArgv,
  buildRevParseArgv,
  evaluateCommit,
  findTrackerIds,
  formatHit,
  parseCommitArgs,
  parseConventionalHeader,
  parseLog,
  runCommitCheck,
  shortHash,
} from './commits.js';
import type { GitRunResult, GitRunner } from './commits.js';

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

function gitAt(
  cwd: string,
  argv: readonly string[],
): { status: number; stdout: string; stderr: string } {
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
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function initRepo(prefix: string): string {
  const root = tempDir(prefix);
  const init = gitAt(root, ['init', '-b', 'main']);
  if (init.status !== 0) {
    throw new Error(`git init failed: ${init.stderr}`);
  }
  const identity = [
    gitAt(root, ['config', 'user.name', 'G1.9']),
    gitAt(root, ['config', 'user.email', 'g19@invalid']),
    gitAt(root, ['config', 'commit.gpgsign', 'false']),
  ];
  for (const step of identity) {
    if (step.status !== 0) {
      throw new Error(`git config failed: ${step.stderr}`);
    }
  }
  return root;
}

function commitFile(root: string, relative: string, body: string, message: string): string {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
  const add = gitAt(root, ['add', relative]);
  if (add.status !== 0) {
    throw new Error(`git add failed: ${add.stderr}`);
  }
  const committed = gitAt(root, ['commit', '-m', message]);
  if (committed.status !== 0) {
    throw new Error(`git commit failed: ${committed.stderr}\n${committed.stdout}`);
  }
  const hash = gitAt(root, ['rev-parse', 'HEAD']);
  return hash.stdout.trim();
}

function scriptedGit(scripts: (argv: readonly string[]) => GitRunResult): GitRunner {
  return (options) => scripts(options.argv);
}

function okRun(stdout = '', stderr = ''): GitRunResult {
  return { status: 0, stdout, stderr, error: undefined };
}

function failRun(status: number, stderr: string): GitRunResult {
  return { status, stdout: '', stderr, error: undefined };
}

describe('parseCommitArgs', () => {
  it('defaults from origin/main, to HEAD, and git to the PATH binary', () => {
    expect(parseCommitArgs([], '/repo')).toEqual({
      ok: true,
      args: { root: '/repo', from: DEFAULT_FROM, to: DEFAULT_TO, gitBin: 'git' },
    });
    expect(DEFAULT_FROM).toBe('origin/main');
    expect(DEFAULT_TO).toBe('HEAD');
  });

  it('accepts --root, --from, --to, and --git', () => {
    const parsed = parseCommitArgs(
      ['--root', '/app', '--from', 'main', '--to', 'HEAD', '--git', '/bin/git'],
      '/repo',
    );
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/app', from: 'main', to: 'HEAD', gitBin: '/bin/git' },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseCommitArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag that is missing its value', () => {
    expect(parseCommitArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
    expect(parseCommitArgs(['--from', '--to', 'HEAD'], '/repo')).toEqual({
      ok: false,
      message: '--from requires a ref',
    });
    expect(parseCommitArgs(['--git'], '/repo')).toEqual({
      ok: false,
      message: '--git requires a path',
    });
    expect(parseCommitArgs(['--to'], '/repo')).toEqual({
      ok: false,
      message: '--to requires a ref',
    });
  });

  it('names the flags in USAGE', () => {
    expect(USAGE).toContain('--root');
    expect(USAGE).toContain('--from');
    expect(USAGE).toContain('--to');
    expect(USAGE).toContain('--git');
  });
});

describe('buildLogArgv / buildRevParseArgv', () => {
  it('asks git for a reverse log with the NUL/RS format', () => {
    expect(buildLogArgv('origin/main', 'HEAD')).toEqual([
      'log',
      '--reverse',
      `--format=${LOG_FORMAT}`,
      'origin/main..HEAD',
    ]);
    expect(LOG_FORMAT).toContain('%H');
    expect(LOG_FORMAT).toContain('%s');
  });

  it('verifies a ref as a commit without printing it', () => {
    expect(buildRevParseArgv('origin/main')).toEqual([
      'rev-parse',
      '--verify',
      '--quiet',
      'origin/main^{commit}',
    ]);
  });
});

describe('parseConventionalHeader', () => {
  it('accepts every documented type with a tracker-bearing description', () => {
    for (const type of CONVENTIONAL_TYPES) {
      const header = parseConventionalHeader(`${type}: add G1.9`);
      expect(header?.type).toBe(type);
      expect(header?.description).toBe('add G1.9');
      expect(header?.breaking).toBe(false);
      expect(header?.scope).toBeUndefined();
    }
  });

  it('parses a scope and a breaking bang', () => {
    const header = parseConventionalHeader('ci(g1.9)!: fail a prose subject');
    expect(header).toEqual({
      type: 'ci',
      scope: 'g1.9',
      breaking: true,
      description: 'fail a prose subject',
    });
  });

  it('rejects a prose subject, a missing space, and an uppercase type', () => {
    expect(parseConventionalHeader('Add the lint job')).toBeUndefined();
    expect(parseConventionalHeader('ci(g1.9):fail')).toBeUndefined();
    expect(parseConventionalHeader('Feat: add job')).toBeUndefined();
    expect(parseConventionalHeader('ci: ')).toBeUndefined();
  });
});

describe('findTrackerIds', () => {
  it('finds the ids this repository actually writes', () => {
    const text = 'ci(g1.9): x\n\nRefs: D-20 C5-01 INF-007 QA-011 T14 #12';
    const ids = findTrackerIds(text);
    expect(ids).toEqual(
      expect.arrayContaining(['g1.9', 'D-20', 'C5-01', 'INF-007', 'QA-011', 'T14', '#12']),
    );
    expect(ids).toHaveLength(7);
  });

  it('does not treat v1.0 or a bare number as a tracker', () => {
    expect(findTrackerIds('feat: bump v1.0 for 12 users')).toEqual([]);
    TRACKER_RE.lastIndex = 0;
  });

  it('dedupes the same id in different cases', () => {
    expect(findTrackerIds('ci(G1.9): mention g1.9 again')).toEqual(['G1.9']);
  });
});

describe('evaluateCommit', () => {
  it('accepts a conventional header whose scope is the tracker', () => {
    expect(
      evaluateCommit({
        parents: ['abc'],
        subject: 'ci(g1.9): fail a prose subject',
        body: '',
      }),
    ).toEqual({ ok: true, kind: 'conventional' });
  });

  it('accepts a conventional header whose footer carries D-20', () => {
    expect(
      evaluateCommit({
        parents: ['abc'],
        subject: 'ci: add the commit convention job',
        body: 'Refs: D-20\n',
      }),
    ).toEqual({ ok: true, kind: 'conventional' });
  });

  it('flags a conventional header with no requirement/defect id', () => {
    expect(
      evaluateCommit({
        parents: ['abc'],
        subject: 'feat: add a widget',
        body: '',
      }),
    ).toEqual({ ok: false, kind: 'missing-id' });
  });

  it('flags a prose subject rather than rewriting it', () => {
    expect(
      evaluateCommit({
        parents: ['abc'],
        subject: 'Add the L1 Conventional Commits job',
        body: '',
      }),
    ).toEqual({ ok: false, kind: 'prose' });
  });

  it('flags an empty subject', () => {
    expect(evaluateCommit({ parents: ['abc'], subject: '   ', body: '' })).toEqual({
      ok: false,
      kind: 'empty',
    });
  });

  it('exempts a merge commit with two parents so absorbing main is not G1.9 red', () => {
    expect(
      evaluateCommit({
        parents: ['aaa', 'bbb'],
        subject: 'Merge origin/main: prose stays on the merge',
        body: '',
      }),
    ).toEqual({ ok: true, kind: 'merge' });
  });

  it('does not exempt a one-parent commit whose subject starts with Merge', () => {
    expect(
      evaluateCommit({
        parents: ['aaa'],
        subject: 'Merge secrets into the repo',
        body: '',
      }),
    ).toEqual({ ok: false, kind: 'prose' });
  });
});

describe('shortHash / formatHit / parseLog', () => {
  it('truncates a full hash and leaves a short one', () => {
    expect(shortHash('abcdef1234567890')).toBe('abcdef1');
    expect(shortHash('abc')).toBe('abc');
  });

  it('formats a hit with the kind and the subject', () => {
    expect(
      formatHit({
        hash: 'abcdef1234567890',
        kind: 'prose',
        subject: 'Add the lint job',
      }),
    ).toBe('prose abcdef1 Add the lint job');
    expect(formatHit({ hash: 'abc', kind: 'empty', subject: '  ' })).toBe(
      'empty abc (empty subject)',
    );
  });

  it('parses a git log with NUL fields and RS records', () => {
    const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const parent = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const stdout = `${hash}\0${parent}\0ci(g1.9): add job\0Refs: D-20\n\x1e`;
    const parsed = parseLog(stdout);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.commits).toEqual([
      {
        hash,
        parents: [parent],
        subject: 'ci(g1.9): add job',
        body: 'Refs: D-20\n',
      },
    ]);
  });

  it('parses an empty log as zero commits rather than inventing one', () => {
    expect(parseLog('')).toEqual({ ok: true, commits: [] });
  });

  it('fails a truncated record rather than inventing a subject', () => {
    const parsed = parseLog('onlyhash\x1e');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('malformed');
  });

  it('fails a record whose hash is empty', () => {
    const parsed = parseLog('\0parent\0subject\0\x1e');
    expect(parsed.ok).toBe(false);
  });

  it('treats a missing parent field as a root commit', () => {
    const parsed = parseLog('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\0\0ci(g1.9): root\0\x1e');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.commits[0]?.parents).toEqual([]);
  });
});

describe('runCommitCheck', () => {
  it('fails when the root is missing', () => {
    const output = runCommitCheck({
      root: join(tempDir('commits-noroot-'), 'nope'),
      from: 'main',
      to: 'HEAD',
      gitBin: 'git',
    });
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when git is missing', () => {
    const root = tempDir('commits-nogit-');
    const error = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    const output = runCommitCheck({ root, from: 'main', to: 'HEAD', gitBin: 'git' }, () => ({
      status: null,
      stdout: '',
      stderr: '',
      error,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('git is required');
  });

  it('fails when git --version exits non-zero', () => {
    const root = tempDir('commits-badgit-');
    const output = runCommitCheck({ root, from: 'main', to: 'HEAD', gitBin: 'git' }, () =>
      failRun(127, 'not git'),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('git is required');
  });

  it('fails when the root is not a git repository', () => {
    const root = tempDir('commits-norepo-');
    const output = runCommitCheck(
      { root, from: 'main', to: 'HEAD', gitBin: 'git' },
      scriptedGit((argv) => {
        if (argv[0] === '--version') return okRun('git version 2.0\n');
        return failRun(128, 'fatal: not a git repository');
      }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('not a git repository');
  });

  it('fails when the to ref is absent', () => {
    const root = tempDir('commits-noto-');
    const output = runCommitCheck(
      { root, from: 'main', to: 'HEAD', gitBin: 'git' },
      scriptedGit((argv) => {
        if (argv[0] === '--version') return okRun('git version 2.0\n');
        if (argv[0] === 'rev-parse' && argv.includes('--git-dir')) return okRun('.git\n');
        if (argv[0] === 'rev-parse' && argv.includes('HEAD^{commit}')) {
          return failRun(1, '');
        }
        return failRun(1, 'unexpected');
      }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('range to is required');
  });

  it('fails when the from ref is absent rather than inventing a range', () => {
    const root = tempDir('commits-nofrom-');
    const output = runCommitCheck(
      { root, from: 'origin/main', to: 'HEAD', gitBin: 'git' },
      scriptedGit((argv) => {
        if (argv[0] === '--version') return okRun('git version 2.0\n');
        if (argv[0] === 'rev-parse' && argv.includes('--git-dir')) return okRun('.git\n');
        if (argv[0] === 'rev-parse' && argv.includes('HEAD^{commit}')) return okRun('');
        if (argv[0] === 'rev-parse' && argv.includes('origin/main^{commit}')) {
          return failRun(1, '');
        }
        return failRun(1, 'unexpected');
      }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('commit-check base is required');
    expect(output.stderr).toContain('will not invent a range');
  });

  it('fails when git log itself fails', () => {
    const root = tempDir('commits-logfail-');
    const output = runCommitCheck(
      { root, from: 'main', to: 'HEAD', gitBin: 'git' },
      scriptedGit((argv) => {
        if (argv[0] === '--version') return okRun('git version 2.0\n');
        if (argv[0] === 'rev-parse') return okRun('');
        if (argv[0] === 'log') return failRun(128, 'fatal: bad revision');
        return failRun(1, 'unexpected');
      }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('git log failed');
  });

  it('fails when git log disappears mid-run', () => {
    const root = tempDir('commits-loggone-');
    const error = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    const output = runCommitCheck(
      { root, from: 'main', to: 'HEAD', gitBin: 'git' },
      scriptedGit((argv) => {
        if (argv[0] === '--version') return okRun('git version 2.0\n');
        if (argv[0] === 'rev-parse') return okRun('');
        return { status: null, stdout: '', stderr: '', error };
      }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('git is required');
  });

  it('fails a malformed log rather than inventing a subject', () => {
    const root = tempDir('commits-badlog-');
    const output = runCommitCheck(
      { root, from: 'main', to: 'HEAD', gitBin: 'git' },
      scriptedGit((argv) => {
        if (argv[0] === '--version') return okRun('git version 2.0\n');
        if (argv[0] === 'rev-parse') return okRun('');
        if (argv[0] === 'log') return okRun('not-a-record\x1e');
        return failRun(1, 'unexpected');
      }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('malformed');
  });

  it('passes an empty range so history on main is not rewritten', () => {
    const root = tempDir('commits-empty-');
    const output = runCommitCheck(
      { root, from: 'origin/main', to: 'HEAD', gitBin: 'git' },
      scriptedGit((argv) => {
        if (argv[0] === '--version') return okRun('git version 2.0\n');
        if (argv[0] === 'rev-parse') return okRun('');
        if (argv[0] === 'log') return okRun('');
        return failRun(1, 'unexpected');
      }),
    );
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('0 new commits');
    expect(output.stdout).toContain('does not rewrite history');
  });
});

describe('runCommitCheck against a real git fixture', () => {
  it('exits non-zero when a new commit is a prose subject', () => {
    const root = initRepo('commits-prose-');
    commitFile(root, 'README.md', 'base\n', 'ci(g1.9): seed the base so history stays');
    gitAt(root, ['checkout', '-b', 'work']);
    commitFile(root, 'job.ts', 'export const x = 1\n', 'Add the lint job');
    const output = runCommitCheck({ root, from: 'main', to: 'HEAD', gitBin: 'git' });
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('G1.9 red');
    expect(output.stderr).toContain('prose');
    expect(output.stderr).toContain('Add the lint job');
    expect(output.stdout).not.toContain('commit-check passed');
  });

  it('exits non-zero when a conventional commit has no requirement id', () => {
    const root = initRepo('commits-noid-');
    commitFile(root, 'README.md', 'base\n', 'ci(g1.9): seed the base so history stays');
    gitAt(root, ['checkout', '-b', 'work']);
    commitFile(root, 'job.ts', 'export const x = 1\n', 'feat: add a widget');
    const output = runCommitCheck({ root, from: 'main', to: 'HEAD', gitBin: 'git' });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('missing-id');
    expect(output.stderr).toContain('feat: add a widget');
  });

  it('passes a conventional commit whose scope is G1.9', () => {
    const root = initRepo('commits-ok-');
    commitFile(root, 'README.md', 'base\n', 'prose history on main is not rewritten');
    gitAt(root, ['checkout', '-b', 'work']);
    commitFile(root, 'job.ts', 'export const x = 1\n', 'ci(g1.9): fail a prose subject');
    const output = runCommitCheck({ root, from: 'main', to: 'HEAD', gitBin: 'git' });
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('commit-check passed');
    expect(output.stdout).toContain('1 new commits, 0 prose, 0 merge');
  });

  it('passes an empty range against main itself', () => {
    const root = initRepo('commits-onmain-');
    commitFile(root, 'README.md', 'base\n', 'prose history on main is not rewritten');
    const output = runCommitCheck({ root, from: 'main', to: 'HEAD', gitBin: 'git' });
    expect(output.ok).toBe(true);
    expect(output.stdout).toContain('0 new commits');
  });

  it('exempts a two-parent merge when absorbing main onto a work branch', () => {
    const root = initRepo('commits-merge-');
    commitFile(root, 'README.md', 'base\n', 'prose history on main is not rewritten');
    gitAt(root, ['checkout', '-b', 'work']);
    commitFile(root, 'job.ts', 'export const x = 1\n', 'ci(g1.9): fail a prose subject');
    gitAt(root, ['checkout', 'main']);
    commitFile(root, 'other.ts', 'export const y = 2\n', 'Add an unrelated main commit');
    gitAt(root, ['checkout', 'work']);
    const merged = gitAt(root, [
      'merge',
      '--no-ff',
      '-m',
      'Merge main: prose merge subject',
      'main',
    ]);
    expect(merged.status).toBe(0);
    const output = runCommitCheck({ root, from: 'main', to: 'HEAD', gitBin: 'git' });
    expect(output.ok).toBe(true);
    expect(output.stdout).toContain('merge');
    expect(output.stderr).not.toContain('G1.9 red');
  });

  it('the commits not yet on origin/main are conventional, or the range is empty', () => {
    const output = runCommitCheck({
      root: repoRoot,
      from: 'origin/main',
      to: 'HEAD',
      gitBin: 'git',
    });
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('commit-check passed');
  });
});
