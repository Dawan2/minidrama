import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './paths.js';
import {
  IT_TODO,
  ONLY_CALL,
  SKIP_CALL,
  SKIP_IF_CALL,
  USAGE,
  XDESCRIBE_CALL,
  XIT_CALL,
  defaultSource,
  emptyItFixture,
  formatHit,
  isTestFileName,
  lineOf,
  listTestFiles,
  marker,
  parseSkipArgs,
  runSkipCheck,
  scanEmptyTests,
  scanSkipTokens,
  scanTestFile,
  toRepoFile,
} from './skips.js';

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

function writeSource(root: string, relative: string, body: string): string {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
  return path;
}

describe('marker / emptyItFixture', () => {
  it('joins pieces so the source of this file does not contain the skip call', () => {
    expect(SKIP_CALL).toBe(marker(['.', 'skip', '(']));
    expect(emptyItFixture('blocked')).toBe(marker(['it(', '"blocked"', ', ', '() => {', '}']));
  });
});

describe('parseSkipArgs', () => {
  it('defaults the source to the named root', () => {
    const parsed = parseSkipArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/repo', source: '/repo' },
    });
    expect(defaultSource('/repo')).toBe('/repo');
  });

  it('accepts --root and --source', () => {
    const parsed = parseSkipArgs(['--root', '/app', '--source', '/app/src'], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/app', source: '/app/src' },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseSkipArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag that is missing its value', () => {
    expect(parseSkipArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
    expect(parseSkipArgs(['--source', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--source requires a path',
    });
  });

  it('names the flags in USAGE', () => {
    expect(USAGE).toContain('--root');
    expect(USAGE).toContain('--source');
  });
});

describe('isTestFileName / listTestFiles', () => {
  it('accepts vitest and playwright stems and ignores other files', () => {
    expect(isTestFileName('a.test.ts')).toBe(true);
    expect(isTestFileName('a.test.tsx')).toBe(true);
    expect(isTestFileName('browse-play.spec.ts')).toBe(true);
    expect(isTestFileName('skips.ts')).toBe(false);
    expect(isTestFileName('a.d.ts')).toBe(false);
  });

  it('walks nested tests and skips node_modules / dist / coverage', () => {
    const root = tempDir('skips-walk-');
    writeSource(root, 'app/src/ok.test.ts', 'export {}\n');
    writeSource(root, 'app/src/ok.ts', 'export {}\n');
    writeSource(root, 'node_modules/pkg/x.test.ts', 'export {}\n');
    writeSource(root, 'dist/x.test.ts', 'export {}\n');
    writeSource(root, 'coverage/x.test.ts', 'export {}\n');
    const files = listTestFiles(root);
    expect(files).toEqual([join(root, 'app/src/ok.test.ts')]);
  });
});

describe('lineOf / toRepoFile / formatHit', () => {
  it('counts newlines before the match index as 1-based lines', () => {
    expect(lineOf('a\nb\nc', 0)).toBe(1);
    expect(lineOf('a\nb\nc', 2)).toBe(2);
    expect(lineOf('a\nb\nc', 4)).toBe(3);
  });

  it('formats a hit with a repo-relative path', () => {
    expect(toRepoFile('/repo/app/src/a.test.ts', '/repo')).toBe('app/src/a.test.ts');
    expect(toRepoFile('/elsewhere/a.test.ts', '/repo')).toBe('/elsewhere/a.test.ts');
    expect(
      formatHit({
        file: 'app/src/a.test.ts',
        line: 4,
        kind: 'skip',
        excerpt: marker(['it', SKIP_CALL, "'x')"]),
      }),
    ).toContain('skip app/src/a.test.ts:4');
    const long = `${'x'.repeat(90)} ${SKIP_CALL}`;
    const hits = scanSkipTokens(long, 'a.test.ts');
    expect(hits[0]?.excerpt.endsWith('...')).toBe(true);
  });
});

describe('scanSkipTokens', () => {
  it('flags a skip call on its line', () => {
    const body = ['it(', '  expect(1).toBe(1)', ')'].join('\n');
    const text = `it${SKIP_CALL}'blocked', () => {\n${body}\n})\n`;
    const hits = scanSkipTokens(text, 'a.test.ts');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('skip');
    expect(hits[0]?.line).toBe(1);
  });

  it('does not treat process.exit as xit', () => {
    expect(scanSkipTokens('process.exit(0);\n', 'a.test.ts')).toEqual([]);
  });

  it('does not treat wait.todo as the vitest todo marker', () => {
    expect(scanSkipTokens('const wait = { todo: 1 }\nvoid wait.todo\n', 'a.test.ts')).toEqual([]);
  });

  it('flags only, todo, xit, xdescribe, and skipIf', () => {
    const text = [
      `it${ONLY_CALL}'focused', () => { expect(1).toBe(1) })`,
      `${IT_TODO}('later')`,
      `${XIT_CALL}'old', () => { expect(1).toBe(1) })`,
      `${XDESCRIBE_CALL}'suite', () => {})`,
      `it${SKIP_IF_CALL}true)('cond', () => { expect(1).toBe(1) })`,
    ].join('\n');
    const kinds = scanSkipTokens(text, 'a.test.ts').map((hit) => hit.kind);
    expect(kinds).toEqual(['only', 'todo', 'skip', 'skip', 'skip']);
  });
});

describe('scanEmptyTests', () => {
  it('flags an empty it callback', () => {
    const text = `${emptyItFixture('blocked')}\n`;
    const hits = scanEmptyTests(text, 'a.test.ts');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('empty');
    expect(hits[0]?.line).toBe(1);
  });

  it('does not flag an empty it that only exists inside a string fixture', () => {
    const text = 'writeFileSync(p, `' + emptyItFixture('x') + '`);\n';
    expect(scanEmptyTests(text, 'a.test.ts')).toEqual([]);
  });

  it('does not flag a test that has a body', () => {
    const text = "it('ok', () => {\n  expect(1).toBe(1)\n})\n";
    expect(scanEmptyTests(text, 'a.test.ts')).toEqual([]);
  });

  it('flags an empty function callback', () => {
    const text = marker(['it(', "'blocked', ", 'function () {', '}']);
    const hits = scanEmptyTests(text, 'a.test.ts');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('empty');
  });
});

describe('scanTestFile', () => {
  it('returns skip and empty hits together', () => {
    const text = `it${SKIP_CALL}'blocked', () => {})\n${emptyItFixture('also')}\n`;
    const hits = scanTestFile(text, 'a.test.ts');
    expect(hits.map((hit) => hit.kind).sort()).toEqual(['empty', 'empty', 'skip']);
  });
});

describe('runSkipCheck', () => {
  it('fails when the root is missing', () => {
    const output = runSkipCheck({
      root: join(tempDir('skips-noroot-'), 'nope'),
      source: '/tmp',
    });
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when the source is missing', () => {
    const root = tempDir('skips-nosource-');
    const output = runSkipCheck({ root, source: join(root, 'missing') });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scan source is required');
  });

  it('fails when the source has no test files', () => {
    const root = tempDir('skips-empty-');
    writeSource(root, 'app/src/ok.ts', 'export const x = 1\n');
    const output = runSkipCheck({ root, source: root });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('saw no tests');
    expect(output.stdout).not.toContain('skip-check passed');
  });

  it('fails when a test file contains a skip call', () => {
    const root = tempDir('skips-hit-');
    writeSource(
      root,
      'app/src/blocked.test.ts',
      `it${SKIP_CALL}'blocked', () => {\n  expect(1).toBe(1)\n})\n`,
    );
    const output = runSkipCheck({ root, source: root });
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('G1.10 red');
    expect(output.stderr).toContain('skip');
    expect(output.stderr).toContain('blocked.test.ts');
  });

  it('fails when a test file contains an empty it callback', () => {
    const root = tempDir('skips-empty-it-');
    writeSource(root, 'app/src/blocked.test.ts', `${emptyItFixture('blocked')}\n`);
    const output = runSkipCheck({ root, source: root });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('empty');
    expect(output.stderr).toContain('blocked.test.ts');
  });

  it('passes a tree whose tests all have bodies and no skip markers', () => {
    const root = tempDir('skips-clean-');
    writeSource(root, 'app/src/ok.test.ts', "it('ok', () => {\n  expect(1).toBe(1)\n})\n");
    const output = runSkipCheck({ root, source: root });
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('skip-check passed');
    expect(output.stdout).toContain('1 test files, 0 skips, 0 empty');
  });

  it('the committed tree has no skip or empty product tests', () => {
    const output = runSkipCheck({ root: repoRoot, source: repoRoot });
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('skip-check passed');
    expect(output.stdout).toContain('0 skips, 0 empty');
  });
});
