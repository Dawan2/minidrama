import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  THINNING_FILE_NAMES,
  USAGE,
  buildGitleaksArgv,
  defaultGitleaksRunner,
  defaultSource,
  formatFinding,
  listScanFiles,
  listThinningFiles,
  parseGitleaksReport,
  parseSecretFinding,
  parseSecretsArgs,
  runSecretsCheck,
  type GitleaksRunResult,
  type SecretFinding,
} from './secrets.js';

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

function runnerOf(result: GitleaksRunResult): () => GitleaksRunResult {
  return () => result;
}

function sampleFinding(overrides: Partial<SecretFinding> = {}): SecretFinding {
  return {
    ruleId: 'aws-access-token',
    file: 'leak.env',
    line: 1,
    description: 'AWS Access Key',
    ...overrides,
  };
}

describe('parseSecretsArgs', () => {
  it('defaults the source to the named root and gitleaks to the PATH binary', () => {
    const parsed = parseSecretsArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/repo',
        source: '/repo',
        gitleaksBin: 'gitleaks',
      },
    });
  });

  it('accepts --root, --source, and --gitleaks', () => {
    const parsed = parseSecretsArgs(
      ['--root', '/app', '--source', '/app/src', '--gitleaks', '/bin/gitleaks'],
      '/repo',
    );
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/app',
        source: '/app/src',
        gitleaksBin: '/bin/gitleaks',
      },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseSecretsArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag with no value', () => {
    expect(parseSecretsArgs(['--source'], '/repo')).toEqual({
      ok: false,
      message: '--source requires a path',
    });
    expect(parseSecretsArgs(['--gitleaks', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--gitleaks requires a path',
    });
    expect(parseSecretsArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
  });

  it('documents the usage string the CLI prints on parse failure', () => {
    expect(USAGE).toContain('check-secrets');
    expect(USAGE).toContain('--gitleaks');
    expect(defaultSource('/repo')).toBe('/repo');
  });
});

describe('listScanFiles / listThinningFiles', () => {
  it('walks files and skips node_modules, dist, coverage, and .git', () => {
    const root = tempDir('secrets-walk-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    writeSource(root, 'node_modules/secret.env', 'AKIAIOSFODNN7EXAMPLE\n');
    writeSource(root, 'dist/out.js', 'ak=1\n');
    writeSource(root, 'coverage/lcov.info', 'TN:\n');
    writeSource(root, '.git/config', '[core]\n');
    expect(listScanFiles(root)).toEqual([join(root, 'src/ok.ts')]);
  });

  it('returns an empty list for an empty directory', () => {
    const root = tempDir('secrets-empty-');
    expect(listScanFiles(root)).toEqual([]);
  });

  it('names the thinning allowlist files at the scan root', () => {
    expect(THINNING_FILE_NAMES).toEqual(['.gitleaks.toml', '.gitleaksignore']);
    const root = tempDir('secrets-thin-');
    writeSource(root, '.gitleaks.toml', 'title = "empty"\n');
    writeSource(root, '.gitleaksignore', 'leak.env:aws-access-token:1\n');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    expect(listThinningFiles(root).sort()).toEqual(
      [join(root, '.gitleaks.toml'), join(root, '.gitleaksignore')].sort(),
    );
  });
});

describe('buildGitleaksArgv', () => {
  it('invokes dir with JSON on stdout, redact, and ignore-gitleaks-allow', () => {
    expect(buildGitleaksArgv({ source: '/repo' })).toEqual([
      'dir',
      '--no-banner',
      '--no-color',
      '--redact',
      '--ignore-gitleaks-allow',
      '--log-level',
      'error',
      '--report-format',
      'json',
      '--report-path',
      '/dev/stdout',
      '/repo',
    ]);
  });
});

describe('parseGitleaksReport', () => {
  it('reads RuleID / File / StartLine and never requires the secret value', () => {
    const findings = parseGitleaksReport(
      JSON.stringify([
        {
          RuleID: 'aws-access-token',
          File: 'leak.env',
          StartLine: 3,
          Description: 'AWS Access Key',
          Secret: 'AKIAIOSFODNN7EXAMPLE',
        },
      ]),
    );
    expect(findings).toEqual([
      {
        ruleId: 'aws-access-token',
        file: 'leak.env',
        line: 3,
        description: 'AWS Access Key',
      },
    ]);
    expect(formatFinding(findings[0] ?? sampleFinding())).toBe('aws-access-token leak.env:3');
  });

  it('falls back to FilePath / Rule when the engine uses those keys', () => {
    expect(
      parseSecretFinding({
        Rule: 'github-pat',
        FilePath: 'token.txt',
        StartLine: 2,
        Description: 'GitHub PAT',
      }),
    ).toEqual({
      ruleId: 'github-pat',
      file: 'token.txt',
      line: 2,
      description: 'GitHub PAT',
    });
  });

  it('formats a missing line without a colon-zero', () => {
    expect(formatFinding(sampleFinding({ line: 0, file: 'a.env', ruleId: '' }))).toBe(
      'unknown-rule a.env',
    );
  });

  it('rejects non-JSON, a non-array, and a non-object finding', () => {
    expect(() => parseGitleaksReport('not-json')).toThrow(/not JSON/);
    expect(() => parseGitleaksReport('{"Findings":[]}')).toThrow(/findings array/);
    expect(() => parseGitleaksReport('[1]')).toThrow(/not an object/);
  });
});

describe('runSecretsCheck', () => {
  it('fails when the root is missing', () => {
    const output = runSecretsCheck(
      { root: join(tempDir('secrets-noroot-'), 'nope'), source: '/tmp', gitleaksBin: 'gitleaks' },
      runnerOf({ status: 0, stdout: '[]', stderr: '', error: undefined }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when the source is missing', () => {
    const root = tempDir('secrets-nosource-');
    const output = runSecretsCheck(
      { root, source: join(root, 'missing'), gitleaksBin: 'gitleaks' },
      runnerOf({ status: 0, stdout: '[]', stderr: '', error: undefined }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scan source is required');
  });

  it('fails when the source has no files', () => {
    const root = tempDir('secrets-nofiles-');
    const output = runSecretsCheck(
      { root, source: root, gitleaksBin: 'gitleaks' },
      runnerOf({ status: 0, stdout: '[]', stderr: '', error: undefined }),
    );
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('saw no files');
  });

  it('fails before the engine when a thinning config is present', () => {
    const root = tempDir('secrets-allowlist-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    writeSource(root, '.gitleaks.toml', "[allowlist]\npaths = ['.*']\n");
    let called = false;
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => {
      called = true;
      return { status: 0, stdout: '[]', stderr: '', error: undefined };
    });
    expect(called).toBe(false);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('thinning allowlists is G1.8 red');
    expect(output.stderr).toContain('.gitleaks.toml');
  });

  it('fails when the binary is missing', () => {
    const root = tempDir('secrets-nobin-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('spawn gitleaks ENOENT'), { code: 'ENOENT' }),
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('gitleaks is required');
  });

  it('fails when the engine exits with a status that is not 0 or 1', () => {
    const root = tempDir('secrets-crash-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => ({
      status: 2,
      stdout: '',
      stderr: 'boom',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('gitleaks failed (2)');
    expect(output.stderr).toContain('boom');
  });

  it('fails when stdout is empty even on exit 0', () => {
    const root = tempDir('secrets-empty-out-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => ({
      status: 0,
      stdout: '',
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('saw no engine output');
  });

  it('fails when stdout is not JSON', () => {
    const root = tempDir('secrets-notjson-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => ({
      status: 0,
      stdout: 'ok\n',
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('not JSON');
  });

  it('fails on a finding even when the body does not include the secret', () => {
    const root = tempDir('secrets-finding-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => ({
      status: 1,
      stdout: JSON.stringify([
        {
          RuleID: 'aws-access-token',
          File: 'leak.env',
          StartLine: 1,
          Description: 'AWS Access Key',
        },
      ]),
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('secrets failed (1)');
    expect(output.stderr).toContain('aws-access-token leak.env:1');
    expect(output.stderr).not.toMatch(/AKIA|Secret|ghp_/);
  });

  it('fails on a finding even if the engine exits 0', () => {
    const root = tempDir('secrets-exit0-finding-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => ({
      status: 0,
      stdout: JSON.stringify([{ RuleID: 'github-pat', File: 'a.txt', StartLine: 4 }]),
      stderr: '',
      error: undefined,
    }));
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('github-pat a.txt:4');
  });

  it('passes when the engine returns an empty findings array', () => {
    const root = tempDir('secrets-clean-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    const output = runSecretsCheck({ root, source: root, gitleaksBin: 'gitleaks' }, () => ({
      status: 0,
      stdout: '[]\n',
      stderr: '',
      error: undefined,
    }));
    expect(output).toEqual({
      ok: true,
      exitCode: 0,
      stdout: 'secrets passed (1 files, 0 findings)\n',
      stderr: '',
    });
  });

  it('invokes the runner with dir argv against the named source', () => {
    const root = tempDir('secrets-argv-');
    writeSource(root, 'src/ok.ts', 'export const x = 1\n');
    let captured: { bin: string; argv: readonly string[]; cwd: string } | undefined;
    runSecretsCheck({ root, source: root, gitleaksBin: '/opt/gitleaks' }, (options) => {
      captured = options;
      return { status: 0, stdout: '[]', stderr: '', error: undefined };
    });
    expect(captured?.bin).toBe('/opt/gitleaks');
    expect(captured?.cwd).toBe(root);
    expect(captured?.argv).toEqual(buildGitleaksArgv({ source: root }));
  });
});

describe('defaultGitleaksRunner', () => {
  it('reports ENOENT for a missing binary without throwing', () => {
    const result = defaultGitleaksRunner({
      bin: join(tempDir('secrets-runner-'), 'no-such-gitleaks'),
      argv: ['version'],
      cwd: process.cwd(),
    });
    expect(result.status).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error !== undefined && 'code' in result.error ? result.error.code : '').toBe(
      'ENOENT',
    );
  });
});
