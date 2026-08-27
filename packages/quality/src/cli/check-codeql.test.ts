// @vitest-environment node
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';
import { REQUIRED_CODEQL_QUERY_USES, REQUIRED_CODEQL_SUITE } from '../codeql.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover the config and SARIF policy; this
 * covers the only thing the L2 job actually reads — the process exit status — because a check
 * that reports success without having seen CodeQL is the same fail-open G2.8 closed for an
 * empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-codeql.ts', import.meta.url));

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

function writeConfig(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'codeql-config.yml');
  writeFileSync(path, `name: fixture\nqueries:\n  - uses: ${REQUIRED_CODEQL_QUERY_USES}\n`);
  return path;
}

function fakeCodeql(script: string): string {
  const root = tempDir('fake-codeql-');
  const bin = join(root, 'codeql');
  writeFileSync(bin, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-codeql CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-codeql');
  });

  it('exits non-zero when the codescanning config is absent', () => {
    const root = tempDir('cli-codeql-noconfig-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const result = run([
      '--root',
      root,
      '--config',
      join(root, 'missing.yml'),
      '--db',
      join(root, 'db'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('codeql config is required');
    expect(result.stdout).not.toContain('codeql passed');
  });

  it('exits non-zero when CodeQL is missing', () => {
    const root = tempDir('cli-codeql-nobin-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const config = writeConfig(join(root, 'cfg'));
    const result = run([
      '--root',
      root,
      '--config',
      config,
      '--db',
      join(root, 'db'),
      '--codeql',
      join(root, 'no-such-codeql'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('codeql is required');
  });

  it('exits non-zero when CodeQL reports js/xss', () => {
    const root = tempDir('cli-codeql-xss-');
    writeFileSync(
      join(root, 'Evil.tsx'),
      'export const Evil = () => <div dangerouslySetInnerHTML={{ __html: x }} />;\n',
    );
    const config = writeConfig(join(root, 'cfg'));
    const bin = fakeCodeql(`
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[1] === 'create') process.exit(0);
const output = argv[argv.indexOf('--output') + 1];
fs.mkdirSync(require('node:path').dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({
  runs: [{
    tool: { driver: { rules: [{ id: 'js/xss', properties: { 'security-severity': '9.8', 'problem.severity': 'error' } }] } },
    results: [{
      ruleId: 'js/xss',
      message: { text: 'DOM XSS' },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'Evil.tsx' }, region: { startLine: 1 } } }],
    }],
  }],
}));
process.exit(0);
`);
    const result = run([
      '--root',
      root,
      '--config',
      config,
      '--db',
      join(root, 'db'),
      '--codeql',
      bin,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('codeql failed');
    expect(result.stderr).toContain('js/xss');
    expect(result.stderr).toContain('Evil.tsx');
  });

  it('exits zero when CodeQL returns queries and an empty results array', () => {
    const root = tempDir('cli-codeql-clean-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    const config = writeConfig(join(root, 'cfg'));
    const bin = fakeCodeql(`
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[1] === 'create') process.exit(0);
const output = argv[argv.indexOf('--output') + 1];
fs.mkdirSync(require('node:path').dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({
  runs: [{
    tool: { driver: { rules: [{ id: 'js/unused-dummy', properties: { 'security-severity': '1.0' } }] } },
    results: [],
  }],
}));
process.exit(0);
`);
    const result = run([
      '--root',
      root,
      '--config',
      config,
      '--db',
      join(root, 'db'),
      '--codeql',
      bin,
      '--suite',
      REQUIRED_CODEQL_SUITE,
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('codeql passed');
  });

  it('exits non-zero when --suite is a thinner pack', () => {
    const root = tempDir('cli-codeql-thinsuite-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    const config = writeConfig(join(root, 'cfg'));
    const result = run([
      '--root',
      root,
      '--config',
      config,
      '--db',
      join(root, 'db'),
      '--suite',
      'javascript-code-scanning.qls',
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not the required security-extended pack');
  });
});
