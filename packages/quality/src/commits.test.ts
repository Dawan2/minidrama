import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CONVENTIONAL_SUBJECT,
  CONVENTIONAL_TYPES,
  DEFAULT_BASE,
  USAGE,
  buildLogArgv,
  buildMergeBaseArgv,
  buildRevParseArgv,
  defaultGitRunner,
  formatViolation,
  isConventionalSubject,
  parseCommitsArgs,
  parseGitSubjects,
  runCommitsCheck,
  type GitRunResult,
} from './commits.js';

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

function gitResult(overrides: Partial<GitRunResult> = {}): GitRunResult {
  return {
    status: 0,
    stdout: '',
    stderr: '',
    error: undefined,
    ...overrides,
  };
}

function sequenceRunner(
  results: readonly GitRunResult[],
): (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}) => GitRunResult {
  let index = 0;
  return () => {
    const next = results[index];
    index += 1;
    if (next === undefined) {
      return gitResult({ status: 99, stderr: 'unexpected git invocation' });
    }
    return next;
  };
}

describe('parseCommitsArgs', () => {
  it('defaults the base to origin/main and git to the PATH binary', () => {
    expect(parseCommitsArgs([], '/repo')).toEqual({
      ok: true,
      args: { root: '/repo', base: DEFAULT_BASE, gitBin: 'git' },
    });
    expect(DEFAULT_BASE).toBe('origin/main');
  });

  it('accepts --root, --base, and --git', () => {
    expect(
      parseCommitsArgs(['--root', '/app', '--base', 'main', '--git', '/bin/git'], '/repo'),
    ).toEqual({
      ok: true,
      args: { root: '/app', base: 'main', gitBin: '/bin/git' },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseCommitsArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag with no value', () => {
    expect(parseCommitsArgs(['--base'], '/repo')).toEqual({
      ok: false,
      message: '--base requires a ref',
    });
    expect(parseCommitsArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
    expect(parseCommitsArgs(['--git'], '/repo')).toEqual({
      ok: false,
      message: '--git requires a path',
    });
  });

  it('rejects a flag whose value is another flag', () => {
    expect(parseCommitsArgs(['--base', '--git'], '/repo')).toEqual({
      ok: false,
      message: '--base requires a ref',
    });
  });

  it('names the usage string the CI entry point prints on a bad flag', () => {
    expect(USAGE).toContain('check-commits');
    expect(USAGE).toContain('--base');
  });
});

describe('isConventionalSubject', () => {
  it('accepts the documented types, optional scope, and optional breaking bang', () => {
    expect(isConventionalSubject('feat: add skip detection')).toBe(true);
    expect(isConventionalSubject('fix(player): hold pre-seek heartbeats')).toBe(true);
    expect(isConventionalSubject('docs(handoff)!: record the G1.9 remainder')).toBe(true);
    expect(isConventionalSubject('ci: add G1.9 Conventional Commits L1 check')).toBe(true);
    expect(CONVENTIONAL_TYPES).toContain('chore');
    expect(CONVENTIONAL_SUBJECT.test('chore: initial')).toBe(true);
  });

  it('rejects the prose subjects this repository has been landing', () => {
    expect(isConventionalSubject('Wire SCR-04 Continue watching from progress lastWatched.')).toBe(
      false,
    );
    expect(
      isConventionalSubject('Add the L1 G1.10 skip/empty-test job: a committed skip is red'),
    ).toBe(false);
    expect(isConventionalSubject('Note that playback-ux and playback-ux2 landed')).toBe(false);
  });

  it('rejects a missing space after the colon, an empty description, and Title Case types', () => {
    expect(isConventionalSubject('feat:add')).toBe(false);
    expect(isConventionalSubject('feat:')).toBe(false);
    expect(isConventionalSubject('feat: ')).toBe(false);
    expect(isConventionalSubject('Feat: add detector')).toBe(false);
    expect(isConventionalSubject('feat(): empty scope')).toBe(false);
  });
});

describe('parseGitSubjects', () => {
  it('splits on newlines and keeps a subject that is only punctuation', () => {
    expect(parseGitSubjects('feat: one\nfix: two\n')).toEqual(['feat: one', 'fix: two']);
    expect(parseGitSubjects('feat: one\r\n\r\nfix: two')).toEqual(['feat: one', 'fix: two']);
  });
});

describe('git argv', () => {
  it('asks git for the merge-base SHA, then no-merge subjects', () => {
    expect(buildRevParseArgv('origin/main')).toEqual([
      'rev-parse',
      '--verify',
      '--quiet',
      'origin/main',
    ]);
    expect(buildMergeBaseArgv('main')).toEqual(['merge-base', 'main', 'HEAD']);
    expect(buildLogArgv('abc123')).toEqual(['log', '--no-merges', '--format=%s', 'abc123..HEAD']);
  });
});

describe('formatViolation', () => {
  it('echoes the prose subject so the log can be grepped without rewriting it', () => {
    expect(formatViolation('Wire the skip detector')).toBe('Wire the skip detector');
  });
});

describe('defaultGitRunner', () => {
  it('returns git --version output from the real binary', () => {
    const result = defaultGitRunner({ bin: 'git', argv: ['--version'], cwd: process.cwd() });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/git version/);
    expect(result.error).toBeUndefined();
  });
});

describe('runCommitsCheck', () => {
  it('fails when the root is missing rather than reporting 0 prose of nothing', () => {
    const output = runCommitsCheck(
      { root: join(tempDir('commits-noroot-'), 'nope'), base: 'main', gitBin: 'git' },
      sequenceRunner([]),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when git is missing', () => {
    const root = tempDir('commits-nogit-');
    const output = runCommitsCheck({ root, base: 'main', gitBin: 'git' }, () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }),
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('git is required');
    expect(output.stdout).not.toContain('commits passed');
  });

  it('fails when the base ref is absent', () => {
    const root = tempDir('commits-nobase-');
    const output = runCommitsCheck(
      { root, base: 'origin/main', gitBin: 'git' },
      sequenceRunner([gitResult({ status: 1, stderr: 'unknown revision' })]),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('base ref is required');
    expect(output.stderr).toContain('origin/main');
  });

  it('fails when merge-base cannot run', () => {
    const root = tempDir('commits-nomerge-');
    const output = runCommitsCheck(
      { root, base: 'main', gitBin: 'git' },
      sequenceRunner([
        gitResult({ status: 0, stdout: 'abc\n' }),
        gitResult({ status: 128, stderr: 'not a git repository' }),
      ]),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('git merge-base failed (128)');
  });

  it('fails when merge-base prints no SHA', () => {
    const root = tempDir('commits-emptysha-');
    const output = runCommitsCheck(
      { root, base: 'main', gitBin: 'git' },
      sequenceRunner([
        gitResult({ status: 0, stdout: 'abc\n' }),
        gitResult({ status: 0, stdout: '\n' }),
      ]),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('produced no SHA');
  });

  it('fails when git log fails', () => {
    const root = tempDir('commits-logfail-');
    const output = runCommitsCheck(
      { root, base: 'main', gitBin: 'git' },
      sequenceRunner([
        gitResult({ status: 0, stdout: 'abc\n' }),
        gitResult({ status: 0, stdout: 'def\n' }),
        gitResult({ status: 128, stderr: 'bad revision' }),
      ]),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('git log failed (128)');
  });

  it('passes on an empty range — that is HEAD already on the base, not a rewrite', () => {
    const root = tempDir('commits-empty-');
    const output = runCommitsCheck(
      { root, base: 'origin/main', gitBin: 'git' },
      sequenceRunner([
        gitResult({ status: 0, stdout: 'abc\n' }),
        gitResult({ status: 0, stdout: 'abc\n' }),
        gitResult({ status: 0, stdout: '' }),
      ]),
    );
    expect(output.ok).toBe(true);
    expect(output.stdout).toContain('commits passed (0 new commits vs origin/main, 0 prose)');
  });

  it('passes when every unique commit is conventional', () => {
    const root = tempDir('commits-ok-');
    const output = runCommitsCheck(
      { root, base: 'main', gitBin: 'git' },
      sequenceRunner([
        gitResult({ status: 0, stdout: 'aaa\n' }),
        gitResult({ status: 0, stdout: 'aaa\n' }),
        gitResult({ status: 0, stdout: 'feat: add detector\nci: wire the L1 job\n' }),
      ]),
    );
    expect(output.ok).toBe(true);
    expect(output.stdout).toContain('commits passed (2 new commits vs main, 0 prose)');
  });

  it('fails a prose unique commit and quotes the subject — the reverse of rewriting it', () => {
    const root = tempDir('commits-prose-');
    const output = runCommitsCheck(
      { root, base: 'origin/main', gitBin: 'git' },
      sequenceRunner([
        gitResult({ status: 0, stdout: 'aaa\n' }),
        gitResult({ status: 0, stdout: 'aaa\n' }),
        gitResult({
          status: 0,
          stdout:
            'feat: add skip detection\nWire SCR-04 Continue watching from progress lastWatched.\n',
        }),
      ]),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('commits failed (1)');
    expect(output.stderr).toContain('prose subjects are G1.9 red');
    expect(output.stderr).toContain('Wire SCR-04 Continue watching from progress lastWatched.');
    expect(output.stderr).not.toContain('feat: add skip detection');
  });
});
