import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './paths.js';
import {
  ALLOW_FAILURE_KEY,
  CONTINUE_ON_ERROR_KEY,
  ECHO_CMD,
  EXIT_ZERO,
  IF_KEY,
  OR_TRUE,
  SOFT_FAIL_KEY,
  USAGE,
  codePortion,
  defaultSource,
  formatHit,
  isWorkflowFileName,
  lineOf,
  listWorkflowFiles,
  marker,
  parseAuditArgs,
  runAuditCheck,
  scanWorkflowText,
  toRepoFile,
} from './audit.js';

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

const CLEAN_WORKFLOW = `name: CI
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm verify
`;

describe('marker', () => {
  it('joins pieces so the source of this file does not contain the YAML keys as a workflow', () => {
    expect(CONTINUE_ON_ERROR_KEY).toBe(marker(['continue', '-', 'on', '-', 'error']));
    expect(ALLOW_FAILURE_KEY).toBe(marker(['allow', '_', 'failure']));
    expect(SOFT_FAIL_KEY).toBe(marker(['soft', '_', 'fail']));
    expect(OR_TRUE).toBe(marker(['|', '|', ' true']));
    expect(ECHO_CMD).toBe(marker(['ec', 'ho']));
    expect(EXIT_ZERO).toBe(marker(['exit', ' 0']));
  });
});

describe('parseAuditArgs', () => {
  it('defaults the source to .github/workflows under the named root', () => {
    const parsed = parseAuditArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/repo', source: defaultSource('/repo') },
    });
    expect(defaultSource('/repo')).toBe('/repo/.github/workflows');
  });

  it('accepts --root and --source', () => {
    const parsed = parseAuditArgs(
      ['--root', '/app', '--source', '/app/.github/workflows'],
      '/repo',
    );
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/app', source: '/app/.github/workflows' },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseAuditArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag with no value', () => {
    expect(parseAuditArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
    expect(parseAuditArgs(['--source', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--source requires a path',
    });
  });

  it('names the flags in USAGE', () => {
    expect(USAGE).toContain('--root');
    expect(USAGE).toContain('--source');
  });
});

describe('isWorkflowFileName / listWorkflowFiles / toRepoFile', () => {
  it('accepts yml and yaml and ignores other files', () => {
    expect(isWorkflowFileName('ci.yml')).toBe(true);
    expect(isWorkflowFileName('l2.yaml')).toBe(true);
    expect(isWorkflowFileName('README.md')).toBe(false);
  });

  it('lists workflow files and skips node_modules', () => {
    const root = tempDir('audit-list-');
    writeSource(root, '.github/workflows/ci.yml', CLEAN_WORKFLOW);
    writeSource(root, '.github/workflows/nested/extra.yaml', CLEAN_WORKFLOW);
    writeSource(root, '.github/workflows/README.md', 'not a workflow\n');
    writeSource(root, 'node_modules/pkg/ci.yml', `${CONTINUE_ON_ERROR_KEY}: true\n`);
    const files = listWorkflowFiles(join(root, '.github', 'workflows'));
    expect(files.map((abs) => toRepoFile(abs, root)).sort()).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/nested/extra.yaml',
    ]);
  });
});

describe('codePortion', () => {
  it('drops a full-line comment that names the forbidden key', () => {
    expect(codePortion(`# There is no ${CONTINUE_ON_ERROR_KEY}: grepping is not S-C1.`)).toBe('');
  });

  it('keeps a key and strips a trailing comment', () => {
    expect(codePortion(`  ${CONTINUE_ON_ERROR_KEY}: true # note`)).toBe(
      `  ${CONTINUE_ON_ERROR_KEY}: true `,
    );
  });

  it('does not treat a hash inside a double-quoted string as a comment', () => {
    expect(codePortion('  run: "echo # not a comment"')).toBe('  run: "echo # not a comment"');
  });
});

describe('lineOf', () => {
  it('counts newlines and treats index 0 as line 1', () => {
    expect(lineOf('a\nb\nc', 0)).toBe(1);
    expect(lineOf('a\nb\nc', 2)).toBe(2);
    expect(lineOf('a\nb\nc', 4)).toBe(3);
  });
});

describe('scanWorkflowText', () => {
  it('does not treat a comment that names continue-on-error as a hit', () => {
    const text = `# There is no ${CONTINUE_ON_ERROR_KEY}: a comment is not INF-004.\njobs:\n  verify:\n    runs-on: ubuntu-latest\n`;
    expect(scanWorkflowText(text, 'ci.yml')).toEqual([]);
  });

  it('hits a continue-on-error true key', () => {
    const text = `jobs:\n  verify:\n    ${CONTINUE_ON_ERROR_KEY}: true\n`;
    const hits = scanWorkflowText(text, 'ci.yml');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('continue-on-error');
    expect(hits[0]?.line).toBe(3);
    expect(formatHit(hits[0]!)).toContain('ci.yml:3');
  });

  it('does not hit continue-on-error false', () => {
    const text = `jobs:\n  verify:\n    ${CONTINUE_ON_ERROR_KEY}: false\n`;
    expect(scanWorkflowText(text, 'ci.yml')).toEqual([]);
  });

  it('hits if: false on a job or step', () => {
    const text = `jobs:\n  verify:\n    ${IF_KEY}: false\n    steps:\n      - run: pnpm verify\n`;
    const hits = scanWorkflowText(text, 'ci.yml');
    expect(hits.map((hit) => hit.kind)).toEqual(['if-false']);
  });

  it('hits a quoted if: false', () => {
    const text = `jobs:\n  verify:\n    ${IF_KEY}: 'false'\n`;
    expect(scanWorkflowText(text, 'ci.yml').map((hit) => hit.kind)).toEqual(['if-false']);
  });

  it('hits a swallowed exit', () => {
    const text = `jobs:\n  verify:\n    steps:\n      - run: pnpm verify${OR_TRUE}\n`;
    const hits = scanWorkflowText(text, 'ci.yml');
    expect(hits.map((hit) => hit.kind)).toEqual(['or-true']);
  });

  it('hits a swallowed exit with no space after the pipes', () => {
    const text = 'jobs:\n  verify:\n    steps:\n      - run: pnpm verify||true\n';
    expect(scanWorkflowText(text, 'ci.yml').map((hit) => hit.kind)).toEqual(['or-true']);
  });

  it('hits an echo-only run step', () => {
    const text = `jobs:\n  verify:\n    steps:\n      - run: ${ECHO_CMD} ok\n`;
    const hits = scanWorkflowText(text, 'ci.yml');
    expect(hits.map((hit) => hit.kind)).toEqual(['echo-only']);
    expect(hits[0]?.line).toBe(4);
  });

  it('hits a true / exit 0 placeholder run', () => {
    expect(
      scanWorkflowText('jobs:\n  a:\n    steps:\n      - run: true\n', 'ci.yml').map(
        (hit) => hit.kind,
      ),
    ).toEqual(['echo-only']);
    expect(
      scanWorkflowText(`jobs:\n  a:\n    steps:\n      - run: ${EXIT_ZERO}\n`, 'ci.yml').map(
        (hit) => hit.kind,
      ),
    ).toEqual(['echo-only']);
  });

  it('does not treat a run that echoes and then invokes a real command as a placeholder', () => {
    const text = `jobs:\n  a:\n    steps:\n      - run: ${ECHO_CMD} start && pnpm verify\n`;
    expect(scanWorkflowText(text, 'ci.yml')).toEqual([]);
  });

  it('hits a block-scalar echo-only run and ignores a comment that names echo', () => {
    const text = `jobs:\n  a:\n    steps:\n      - run: |\n          ${ECHO_CMD} ok\n      - run: |\n          ${ECHO_CMD} start\n          pnpm verify\n`;
    expect(scanWorkflowText(text, 'ci.yml').map((hit) => hit.kind)).toEqual(['echo-only']);
    expect(
      scanWorkflowText(
        `# run: ${ECHO_CMD} ok\njobs:\n  a:\n    steps:\n      - run: pnpm verify\n`,
        'ci.yml',
      ),
    ).toEqual([]);
  });

  it('hits allow_failure and soft_fail truthy keys', () => {
    const text = `jobs:\n  a:\n    ${ALLOW_FAILURE_KEY}: true\n  b:\n    ${SOFT_FAIL_KEY}: yes\n`;
    expect(
      scanWorkflowText(text, 'ci.yml')
        .map((hit) => hit.kind)
        .sort(),
    ).toEqual(['allow-failure', 'soft-fail']);
  });

  it('does not treat workflow_dispatch as a bypass', () => {
    expect(scanWorkflowText(CLEAN_WORKFLOW, 'ci.yml')).toEqual([]);
  });
});

describe('runAuditCheck', () => {
  it('fails when the root is missing', () => {
    const output = runAuditCheck({
      root: join(tempDir('audit-noroot-'), 'nope'),
      source: '/tmp',
    });
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when the source is missing', () => {
    const root = tempDir('audit-nosource-');
    const output = runAuditCheck({ root, source: join(root, 'missing') });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scan source is required');
  });

  it('fails when the source has no workflow files', () => {
    const root = tempDir('audit-empty-');
    writeSource(root, 'README.md', 'no workflows\n');
    const output = runAuditCheck({ root, source: root });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('saw no workflows');
    expect(output.stdout).not.toContain('audit passed');
  });

  it('fails when a workflow contains continue-on-error: true', () => {
    const root = tempDir('audit-hit-');
    writeSource(
      root,
      '.github/workflows/blocked.yml',
      `name: blocked\njobs:\n  verify:\n    ${CONTINUE_ON_ERROR_KEY}: true\n    runs-on: ubuntu-latest\n`,
    );
    const output = runAuditCheck({ root, source: join(root, '.github', 'workflows') });
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('INF-004 red');
    expect(output.stderr).toContain('continue-on-error');
    expect(output.stderr).toContain('blocked.yml');
  });

  it('fails when a workflow contains if: false', () => {
    const root = tempDir('audit-iffalse-');
    writeSource(
      root,
      '.github/workflows/blocked.yml',
      `name: blocked\njobs:\n  verify:\n    ${IF_KEY}: false\n    runs-on: ubuntu-latest\n`,
    );
    const output = runAuditCheck({ root, source: join(root, '.github', 'workflows') });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('if-false');
  });

  it('fails when a workflow contains an echo-only run', () => {
    const root = tempDir('audit-echo-');
    writeSource(
      root,
      '.github/workflows/blocked.yml',
      `name: blocked\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${ECHO_CMD} ok\n`,
    );
    const output = runAuditCheck({ root, source: join(root, '.github', 'workflows') });
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('INF-004 red');
    expect(output.stderr).toContain('echo-only');
    expect(output.stderr).toContain('blocked.yml');
  });

  it('passes a tree whose workflows have no bypass keys', () => {
    const root = tempDir('audit-clean-');
    writeSource(root, '.github/workflows/ci.yml', CLEAN_WORKFLOW);
    const output = runAuditCheck({ root, source: join(root, '.github', 'workflows') });
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('audit passed');
    expect(output.stdout).toContain(
      '1 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only',
    );
  });

  it('the committed workflows have no continue-on-error, if: false, or swallowed exits', () => {
    const output = runAuditCheck({ root: repoRoot, source: defaultSource(repoRoot) });
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('audit passed');
    expect(output.stdout).toContain(
      '0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only',
    );
  });
});
