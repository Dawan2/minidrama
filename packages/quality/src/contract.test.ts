import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BASELINE_RELATIVE,
  ERR_LEVEL,
  REVISION_RELATIVE,
  THINNING_FILE_NAMES,
  USAGE,
  buildOasdiffArgv,
  collectThinningFiles,
  defaultBase,
  defaultOasdiffRunner,
  defaultRevision,
  formatChange,
  isErrChange,
  parseBreakingChange,
  parseContractArgs,
  parseOasdiffReport,
  runContractCheck,
  type BreakingChange,
  type OasdiffRunResult,
} from './contract.js';

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

function runnerOf(result: OasdiffRunResult): () => OasdiffRunResult {
  return () => result;
}

function sampleChange(overrides: Partial<BreakingChange> = {}): BreakingChange {
  return {
    id: 'api-path-removed-without-deprecation',
    text: 'api path removed without deprecation',
    level: ERR_LEVEL,
    operation: 'GET',
    path: '/v1/wallet',
    ...overrides,
  };
}

function specPair(root: string): { base: string; revision: string } {
  const base = writeSource(root, 'contracts/oasdiff-baseline.yaml', 'openapi: 3.1.0\n');
  const revision = writeSource(root, 'contracts/openapi.yaml', 'openapi: 3.1.0\n');
  return { base, revision };
}

describe('parseContractArgs', () => {
  it('defaults base and revision under contracts/ and oasdiff to the PATH binary', () => {
    const parsed = parseContractArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/repo',
        base: '/repo/contracts/oasdiff-baseline.yaml',
        revision: '/repo/contracts/openapi.yaml',
        oasdiffBin: 'oasdiff',
      },
    });
  });

  it('accepts --root, --base, --revision, and --oasdiff', () => {
    const parsed = parseContractArgs(
      [
        '--root',
        '/app',
        '--base',
        '/app/old.yaml',
        '--revision',
        '/app/new.yaml',
        '--oasdiff',
        '/bin/oasdiff',
      ],
      '/repo',
    );
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/app',
        base: '/app/old.yaml',
        revision: '/app/new.yaml',
        oasdiffBin: '/bin/oasdiff',
      },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseContractArgs(['--err-ignore', 'skip.md'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --err-ignore',
    });
  });

  it('rejects a flag with no value', () => {
    expect(parseContractArgs(['--base'], '/repo')).toEqual({
      ok: false,
      message: '--base requires a path',
    });
    expect(parseContractArgs(['--oasdiff', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--oasdiff requires a path',
    });
    expect(parseContractArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
  });

  it('documents the usage string and the relative spec paths', () => {
    expect(USAGE).toContain('check-contract');
    expect(USAGE).toContain('--oasdiff');
    expect(BASELINE_RELATIVE).toBe('contracts/oasdiff-baseline.yaml');
    expect(REVISION_RELATIVE).toBe('contracts/openapi.yaml');
    expect(defaultBase('/repo')).toBe('/repo/contracts/oasdiff-baseline.yaml');
    expect(defaultRevision('/repo')).toBe('/repo/contracts/openapi.yaml');
  });
});

describe('buildOasdiffArgv', () => {
  it('invokes breaking with JSON and --fail-on ERR, never an ignore file', () => {
    expect(buildOasdiffArgv({ base: '/base.yaml', revision: '/rev.yaml' })).toEqual([
      'breaking',
      '--format',
      'json',
      '--fail-on',
      'ERR',
      '/base.yaml',
      '/rev.yaml',
    ]);
    const argv = buildOasdiffArgv({ base: '/b', revision: '/r' }).join(' ');
    expect(argv).not.toContain('err-ignore');
    expect(argv).not.toContain('warn-ignore');
    expect(argv).not.toContain('severity-levels');
    expect(argv).not.toContain('--open');
    expect(argv).not.toContain('--config');
  });
});

describe('collectThinningFiles', () => {
  it('names ignore and severity files next to the spec', () => {
    expect(THINNING_FILE_NAMES).toContain('.oasdiff.yaml');
    expect(THINNING_FILE_NAMES).toContain('err.ignore');
    const root = tempDir('contract-thin-');
    const { base, revision } = specPair(root);
    writeSource(root, 'contracts/.oasdiff.yaml', 'ignore: true\n');
    writeSource(root, 'err.ignore', 'GET /v1/wallet\n');
    expect(collectThinningFiles({ root, base, revision, oasdiffBin: 'oasdiff' })).toEqual([
      join(root, 'contracts/.oasdiff.yaml'),
      join(root, 'err.ignore'),
    ]);
  });
});

describe('parseOasdiffReport', () => {
  it('reads id / level / operation / path from the oasdiff schema', () => {
    const changes = parseOasdiffReport(
      JSON.stringify([
        {
          id: 'api-path-removed-without-deprecation',
          text: 'api path removed without deprecation',
          level: 3,
          operation: 'GET',
          operationId: 'getWallet',
          path: '/v1/wallet',
          section: 'paths',
        },
      ]),
    );
    expect(changes).toEqual([
      {
        id: 'api-path-removed-without-deprecation',
        text: 'api path removed without deprecation',
        level: 3,
        operation: 'GET',
        path: '/v1/wallet',
      },
    ]);
    expect(formatChange(changes[0] ?? sampleChange())).toBe(
      'api-path-removed-without-deprecation GET /v1/wallet',
    );
    expect(isErrChange(changes[0] ?? sampleChange())).toBe(true);
  });

  it('treats WARN (level 2) as non-blocking', () => {
    const warn = parseBreakingChange({
      id: 'request-parameter-removed-before-sunset',
      text: 'maybe',
      level: 2,
      operation: 'GET',
      path: '/v1/x',
    });
    expect(isErrChange(warn)).toBe(false);
    expect(formatChange(sampleChange({ id: '', operation: '', path: '' }))).toBe('unknown-check');
  });

  it('rejects non-JSON, a non-array, and a non-object change', () => {
    expect(() => parseOasdiffReport('not-json')).toThrow(/not JSON/);
    expect(() => parseOasdiffReport('{"breakingChanges":[]}')).toThrow(/changes array/);
    expect(() => parseOasdiffReport('[1]')).toThrow(/not an object/);
  });
});

describe('runContractCheck', () => {
  it('fails when the root is missing', () => {
    const output = runContractCheck(
      {
        root: join(tempDir('contract-noroot-'), 'nope'),
        base: '/tmp/b.yaml',
        revision: '/tmp/r.yaml',
        oasdiffBin: 'oasdiff',
      },
      runnerOf({ status: 0, stdout: '[]', stderr: '', error: undefined }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when the baseline is missing', () => {
    const root = tempDir('contract-nobase-');
    writeSource(root, 'contracts/openapi.yaml', 'openapi: 3.1.0\n');
    const output = runContractCheck(
      {
        root,
        base: join(root, 'contracts/oasdiff-baseline.yaml'),
        revision: join(root, 'contracts/openapi.yaml'),
        oasdiffBin: 'oasdiff',
      },
      runnerOf({ status: 0, stdout: '[]', stderr: '', error: undefined }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('baseline spec is required');
  });

  it('fails when the revision is missing', () => {
    const root = tempDir('contract-norev-');
    writeSource(root, 'contracts/oasdiff-baseline.yaml', 'openapi: 3.1.0\n');
    const output = runContractCheck(
      {
        root,
        base: join(root, 'contracts/oasdiff-baseline.yaml'),
        revision: join(root, 'contracts/openapi.yaml'),
        oasdiffBin: 'oasdiff',
      },
      runnerOf({ status: 0, stdout: '[]', stderr: '', error: undefined }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('revision spec is required');
  });

  it('fails before the engine when a thinning ignore file is present', () => {
    const root = tempDir('contract-allowlist-');
    const { base, revision } = specPair(root);
    writeSource(root, 'err.ignore', 'GET /v1/wallet removed\n');
    let called = false;
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => {
      called = true;
      return { status: 0, stdout: '[]', stderr: '', error: undefined };
    });
    expect(called).toBe(false);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('thinning ignore files is G1.6 red');
    expect(output.stderr).toContain('err.ignore');
  });

  it('fails when the binary is missing', () => {
    const root = tempDir('contract-nobin-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('spawn oasdiff ENOENT'), { code: 'ENOENT' }),
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('oasdiff is required');
  });

  it('fails when the engine exits with a status that is not 0 or 1', () => {
    const root = tempDir('contract-crash-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: 102,
      stdout: '',
      stderr: 'mapping key "PageInfo" already defined',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('oasdiff failed (102)');
    expect(output.stderr).toContain('PageInfo');
  });

  it('fails when stdout is empty even on exit 0', () => {
    const root = tempDir('contract-empty-out-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: 0,
      stdout: '',
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('saw no engine output');
  });

  it('fails when stdout is not JSON', () => {
    const root = tempDir('contract-notjson-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: 0,
      stdout: 'ok\n',
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('not JSON');
  });

  it('fails on an ERR-level path removal even if the engine exits 0', () => {
    const root = tempDir('contract-finding-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: 0,
      stdout: JSON.stringify([
        {
          id: 'api-path-removed-without-deprecation',
          text: 'api path removed without deprecation',
          level: 3,
          operation: 'GET',
          path: '/v1/wallet',
        },
      ]),
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('contract failed (1)');
    expect(output.stderr).toContain('api-path-removed-without-deprecation GET /v1/wallet');
  });

  it('fails on a new required request property', () => {
    const root = tempDir('contract-required-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: 1,
      stdout: JSON.stringify([
        {
          id: 'new-required-request-property',
          text: 'added the new required request property `extra`',
          level: 3,
          operation: 'POST',
          path: '/v1/items',
        },
      ]),
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('new-required-request-property POST /v1/items');
  });

  it('passes when the engine returns an empty changes array', () => {
    const root = tempDir('contract-clean-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: 0,
      stdout: '[]\n',
      stderr: '',
      error: undefined,
    }));
    expect(output).toEqual({
      ok: true,
      exitCode: 0,
      stdout: 'contract passed (0 ERR, 0 WARN)\n',
      stderr: '',
    });
  });

  it('passes on WARN-only output', () => {
    const root = tempDir('contract-warn-');
    const { base, revision } = specPair(root);
    const output = runContractCheck({ root, base, revision, oasdiffBin: 'oasdiff' }, () => ({
      status: 0,
      stdout: JSON.stringify([
        { id: 'maybe', text: 'unspecified', level: 2, operation: 'GET', path: '/v1/x' },
      ]),
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(true);
    expect(output.stdout).toContain('0 ERR, 1 WARN');
  });

  it('invokes the runner with breaking argv against the named specs', () => {
    const root = tempDir('contract-argv-');
    const { base, revision } = specPair(root);
    let captured: { bin: string; argv: readonly string[]; cwd: string } | undefined;
    runContractCheck({ root, base, revision, oasdiffBin: '/opt/oasdiff' }, (options) => {
      captured = options;
      return { status: 0, stdout: '[]', stderr: '', error: undefined };
    });
    expect(captured?.bin).toBe('/opt/oasdiff');
    expect(captured?.cwd).toBe(root);
    expect(captured?.argv).toEqual(buildOasdiffArgv({ base, revision }));
  });
});

describe('defaultOasdiffRunner', () => {
  it('reports ENOENT for a missing binary without throwing', () => {
    const result = defaultOasdiffRunner({
      bin: join(tempDir('contract-runner-'), 'no-such-oasdiff'),
      argv: ['-v'],
      cwd: process.cwd(),
    });
    expect(result.status).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error !== undefined && 'code' in result.error ? result.error.code : '').toBe(
      'ENOENT',
    );
  });
});
