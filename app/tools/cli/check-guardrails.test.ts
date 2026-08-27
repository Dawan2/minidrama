// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { SDK_SCRIPT_SRC } from '../html-integrity.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the rules; this covers the only
 * thing CI actually reads — the process exit status — because the fail-open being closed here was
 * precisely a check that reported success without having run.
 */

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const tsx = join(appRoot, 'node_modules', '.bin', 'tsx');
const cli = fileURLToPath(new URL('./check-guardrails.ts', import.meta.url));

const CLEAN_DOCUMENT = `<!doctype html><html><head><script src="${SDK_SCRIPT_SRC}"></script></head><body><script type="module" src="./assets/main.js"></script></body></html>`;

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop() ?? '', { recursive: true, force: true });
  }
});

function fixtureRoot(dist?: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'check-guardrails-'));
  fixtures.push(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'main.ts'), 'export const ready = true;\n');
  writeFileSync(join(root, 'index.html'), CLEAN_DOCUMENT);
  if (dist !== undefined) {
    mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
    for (const [path, contents] of Object.entries(dist)) {
      writeFileSync(join(root, 'dist', path), contents);
    }
  }
  return root;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsx, [cli, ...args], { cwd: appRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-guardrails CLI', () => {
  it('exits non-zero when the artifact directory is absent', () => {
    const root = fixtureRoot();
    const result = run(['--app-root', root, '--dist', join(root, 'dist')]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the build artifact is required');
    expect(result.stdout).not.toContain('platform guardrails passed');
  });

  it('exits non-zero when the artifact directory is empty', () => {
    const root = fixtureRoot({});
    const result = run(['--app-root', root, '--dist', join(root, 'dist')]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('the build artifact is required');
  });

  it('exits non-zero when --dist is not given, rather than guessing a layout', () => {
    const result = run([]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--dist is required');
  });

  it('exits non-zero on an unknown argument', () => {
    const root = fixtureRoot({ 'index.html': CLEAN_DOCUMENT });
    const result = run(['--dist', join(root, 'dist'), '--allow-missing-dist']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
  });

  it('exits non-zero when the artifact contains a banned media element', () => {
    const root = fixtureRoot({
      'index.html': CLEAN_DOCUMENT,
      'assets/main-abc.js': "const v=document.createElement('video');export{v};\n",
    });
    const result = run(['--app-root', root, '--dist', join(root, 'dist')]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no <video> element');
  });

  it('exits zero on a compliant source tree and artifact', () => {
    const root = fixtureRoot({
      'index.html': CLEAN_DOCUMENT,
      'assets/main-abc.js': 'const a=1;export{a};\n',
    });
    const result = run(['--app-root', root, '--dist', join(root, 'dist')]);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('platform guardrails passed');
  });
});
