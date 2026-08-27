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
 * success without having seen oasdiff is the same fail-open G2.8 closed for an empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-contract.ts', import.meta.url));

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

function fakeOasdiff(script: string): string {
  const root = tempDir('fake-oasdiff-');
  const bin = join(root, 'oasdiff');
  writeFileSync(bin, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function writeSpecs(root: string): void {
  mkdirSync(join(root, 'contracts'), { recursive: true });
  writeFileSync(join(root, 'contracts', 'oasdiff-baseline.yaml'), 'openapi: 3.1.0\n');
  writeFileSync(join(root, 'contracts', 'openapi.yaml'), 'openapi: 3.1.0\n');
}

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('check-contract CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-contract');
  });

  it('exits non-zero when the baseline is missing', () => {
    const root = tempDir('cli-contract-nobase-');
    mkdirSync(join(root, 'contracts'));
    writeFileSync(join(root, 'contracts', 'openapi.yaml'), 'openapi: 3.1.0\n');
    const result = run(['--root', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('baseline spec is required');
    expect(result.stdout).not.toContain('contract passed');
  });

  it('exits non-zero when oasdiff is missing', () => {
    const root = tempDir('cli-contract-nobin-');
    writeSpecs(root);
    const result = run(['--root', root, '--oasdiff', join(root, 'no-such-oasdiff')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('oasdiff is required');
  });

  it('exits non-zero when oasdiff reports a deleted path', () => {
    const root = tempDir('cli-contract-hit-');
    writeSpecs(root);
    const bin = fakeOasdiff(`
process.stdout.write(JSON.stringify([{
  id: 'api-path-removed-without-deprecation',
  text: 'api path removed without deprecation',
  level: 3,
  operation: 'GET',
  path: '/v1/wallet',
}]));
process.exit(1);
`);
    const result = run(['--root', root, '--oasdiff', bin]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contract failed');
    expect(result.stderr).toContain('api-path-removed-without-deprecation GET /v1/wallet');
  });

  it('exits zero when oasdiff returns an empty changes array', () => {
    const root = tempDir('cli-contract-clean-');
    writeSpecs(root);
    const bin = fakeOasdiff(`
process.stdout.write('[]\\n');
process.exit(0);
`);
    const result = run(['--root', root, '--oasdiff', bin]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('contract passed');
    expect(result.stdout).toContain('0 ERR');
  });

  it('exits non-zero when a thinning .oasdiff.yaml is present', () => {
    const root = tempDir('cli-contract-toml-');
    writeSpecs(root);
    writeFileSync(join(root, '.oasdiff.yaml'), 'ignore: all\n');
    const result = run(['--root', root, '--oasdiff', join(root, 'unused')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('thinning ignore files is G1.6 red');
  });
});
