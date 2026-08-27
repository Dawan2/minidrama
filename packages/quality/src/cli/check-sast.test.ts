// @vitest-environment node
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';
import { REQUIRED_SAST_RULE_IDS } from '../sast.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the rules and JSON policy; this
 * covers the only thing the L2 job actually reads — the process exit status — because a check
 * that reports success without having seen Semgrep is the same fail-open G2.8 closed for an
 * empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-sast.ts', import.meta.url));

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

function writeCompleteRules(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const body = [
    'rules:',
    ...REQUIRED_SAST_RULE_IDS.flatMap((id) => [`  - id: ${id}`, '    severity: ERROR']),
    '',
  ].join('\n');
  writeFileSync(join(dir, 'rules.yml'), body);
}

function fakeSemgrep(script: string): string {
  const root = tempDir('fake-semgrep-');
  const bin = join(root, 'semgrep');
  writeFileSync(bin, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-sast CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-sast');
  });

  it('exits non-zero when the rules directory is absent', () => {
    const root = tempDir('cli-sast-norules-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const result = run(['--root', root, '--rules', join(root, 'missing')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('semgrep rules are required');
    expect(result.stdout).not.toContain('sast passed');
  });

  it('exits non-zero when Semgrep is missing', () => {
    const root = tempDir('cli-sast-nobin-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    writeCompleteRules(join(root, 'rules'));
    const result = run([
      '--root',
      root,
      '--rules',
      join(root, 'rules'),
      '--semgrep',
      join(root, 'no-such-semgrep'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('semgrep is required');
  });

  it('exits non-zero when Semgrep reports dangerouslySetInnerHTML', () => {
    const root = tempDir('cli-sast-xss-');
    writeFileSync(
      join(root, 'Evil.tsx'),
      'export const Evil = () => <div dangerouslySetInnerHTML={{ __html: x }} />;\n',
    );
    writeCompleteRules(join(root, 'rules'));
    const bin = fakeSemgrep(`
process.stdout.write(JSON.stringify({
  results: [{
    check_id: 'ban-dangerously-set-inner-html',
    path: 'Evil.tsx',
    start: { line: 1 },
    extra: { severity: 'ERROR', message: 'XSS' },
  }],
  errors: [],
}));
process.exit(1);
`);
    const result = run(['--root', root, '--rules', join(root, 'rules'), '--semgrep', bin]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sast failed');
    expect(result.stderr).toContain('ban-dangerously-set-inner-html');
    expect(result.stderr).toContain('Evil.tsx');
  });

  it('exits zero when Semgrep returns an empty results array', () => {
    const root = tempDir('cli-sast-clean-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    writeCompleteRules(join(root, 'rules'));
    const bin = fakeSemgrep(`
process.stdout.write(JSON.stringify({ results: [], errors: [] }));
process.exit(0);
`);
    const result = run(['--root', root, '--rules', join(root, 'rules'), '--semgrep', bin]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sast passed');
  });
});
