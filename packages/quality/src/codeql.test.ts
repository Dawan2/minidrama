import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './paths.js';
import {
  CRITICAL_SECURITY_SEVERITY_FLOOR,
  HIGH_SECURITY_SEVERITY_FLOOR,
  REQUIRED_CODEQL_QUERY_USES,
  REQUIRED_CODEQL_SUITE,
  USAGE,
  buildAnalyzeArgv,
  buildCreateArgv,
  defaultCodeqlRunner,
  defaultConfigPath,
  defaultDatabaseDir,
  evaluateSarif,
  formatCodeqlFinding,
  githubSeverity,
  isBlockingCodeqlSeverity,
  loadCodeqlConfig,
  missingRequiredQueryUses,
  parseCodeqlArgs,
  parseCodeqlConfigYaml,
  parseCodeqlRule,
  parseSarifFinding,
  runCodeqlCheck,
  type CodeqlRunResult,
  type CodeqlRunner,
} from './codeql.js';

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

function writeConfig(dir: string, uses: readonly string[] = [REQUIRED_CODEQL_QUERY_USES]): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'codeql-config.yml');
  const body = ['name: fixture', 'queries:', ...uses.map((id) => `  - uses: ${id}`), ''].join('\n');
  writeFileSync(path, body);
  return path;
}

function sarifOf(options: {
  readonly rules?: ReadonlyArray<{
    readonly id: string;
    readonly securitySeverity?: string;
    readonly problemSeverity?: string;
    readonly defaultLevel?: string;
  }>;
  readonly results?: ReadonlyArray<{
    readonly ruleId: string;
    readonly ruleIndex?: number;
    readonly level?: string;
    readonly path?: string;
    readonly line?: number;
    readonly message?: string;
  }>;
}): string {
  const rules = options.rules ?? [
    {
      id: 'js/unused-dummy',
      securitySeverity: '1.0',
      problemSeverity: 'recommendation',
      defaultLevel: 'note',
    },
  ];
  const results = options.results ?? [];
  return JSON.stringify({
    runs: [
      {
        tool: {
          driver: {
            rules: rules.map((rule) => ({
              id: rule.id,
              defaultLevel: rule.defaultLevel,
              properties: {
                'security-severity': rule.securitySeverity,
                'problem.severity': rule.problemSeverity,
              },
            })),
          },
        },
        results: results.map((result) => ({
          ruleId: result.ruleId,
          ruleIndex: result.ruleIndex,
          level: result.level,
          message: { text: result.message ?? '' },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: result.path ?? 'app.ts' },
                region: { startLine: result.line ?? 1 },
              },
            },
          ],
        })),
      },
    ],
  });
}

function runnerWriting(
  create: CodeqlRunResult,
  analyze: CodeqlRunResult | ((output: string) => CodeqlRunResult),
): { runner: CodeqlRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: CodeqlRunner = (options) => {
    calls.push([...options.argv]);
    if (options.argv[1] === 'create') return create;
    const outputAt = options.argv.indexOf('--output');
    const output = options.argv[outputAt + 1] ?? '';
    return typeof analyze === 'function' ? analyze(output) : analyze;
  };
  return { runner, calls };
}

function writeSarif(output: string, body: string): CodeqlRunResult {
  mkdirSync(join(output, '..'), { recursive: true });
  writeFileSync(output, body);
  return { status: 0, stdout: '', stderr: '', error: undefined };
}

describe('parseCodeqlArgs', () => {
  it('defaults config and db under the named root, and pins the security-extended suite', () => {
    const parsed = parseCodeqlArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/repo',
        configPath: '/repo/packages/quality/codeql/codeql-config.yml',
        db: '/repo/.codeql-database',
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
    });
  });

  it('accepts --root, --config, --db, --codeql, and --suite', () => {
    const parsed = parseCodeqlArgs(
      [
        '--root',
        '/app',
        '--config',
        '/cfg.yml',
        '--db',
        '/tmp/db',
        '--codeql',
        '/bin/codeql',
        '--suite',
        REQUIRED_CODEQL_SUITE,
      ],
      '/repo',
    );
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/app',
        configPath: '/cfg.yml',
        db: '/tmp/db',
        codeqlBin: '/bin/codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseCodeqlArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag with no value', () => {
    expect(parseCodeqlArgs(['--config'], '/repo')).toEqual({
      ok: false,
      message: '--config requires a path',
    });
    expect(parseCodeqlArgs(['--codeql', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--codeql requires a path',
    });
    expect(parseCodeqlArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
  });

  it('documents the usage string the CLI prints on parse failure', () => {
    expect(USAGE).toContain('check-codeql');
    expect(USAGE).toContain('--codeql');
  });
});

describe('default paths', () => {
  it('places the config next to the Semgrep rules tree', () => {
    expect(defaultConfigPath('/repo')).toBe('/repo/packages/quality/codeql/codeql-config.yml');
    expect(defaultDatabaseDir('/repo')).toBe('/repo/.codeql-database');
  });

  it('the committed config on this repo names security-extended', () => {
    const loaded = loadCodeqlConfig(defaultConfigPath(repoRoot));
    expect(missingRequiredQueryUses(loaded.uses)).toEqual([]);
    expect(loaded.uses).toContain(REQUIRED_CODEQL_QUERY_USES);
  });
});

describe('parseCodeqlConfigYaml', () => {
  it('reads uses entries out of a codescanning config', () => {
    expect(
      parseCodeqlConfigYaml(`
name: x
queries:
  - uses: security-extended
  - uses: security-and-quality
`),
    ).toEqual({ uses: ['security-extended', 'security-and-quality'] });
  });

  it('does not invent security-extended when the list is empty', () => {
    expect(parseCodeqlConfigYaml('name: x\nqueries: []\n')).toEqual({ uses: [] });
    expect(missingRequiredQueryUses([])).toEqual([REQUIRED_CODEQL_QUERY_USES]);
  });
});

describe('githubSeverity', () => {
  it('maps security-severity with GitHub code-scanning floors', () => {
    expect(
      githubSeverity({
        securitySeverity: CRITICAL_SECURITY_SEVERITY_FLOOR,
        level: '',
        problemSeverity: '',
      }),
    ).toBe('CRITICAL');
    expect(
      githubSeverity({
        securitySeverity: HIGH_SECURITY_SEVERITY_FLOOR,
        level: '',
        problemSeverity: '',
      }),
    ).toBe('HIGH');
    expect(githubSeverity({ securitySeverity: 4, level: '', problemSeverity: '' })).toBe('MEDIUM');
    expect(githubSeverity({ securitySeverity: 1, level: '', problemSeverity: '' })).toBe('LOW');
  });

  it('falls back to SARIF level / problem.severity when security-severity is absent', () => {
    expect(
      githubSeverity({ securitySeverity: undefined, level: 'error', problemSeverity: '' }),
    ).toBe('HIGH');
    expect(
      githubSeverity({ securitySeverity: undefined, level: '', problemSeverity: 'error' }),
    ).toBe('HIGH');
    expect(
      githubSeverity({ securitySeverity: undefined, level: 'warning', problemSeverity: '' }),
    ).toBe('MEDIUM');
    expect(
      githubSeverity({ securitySeverity: undefined, level: 'note', problemSeverity: '' }),
    ).toBe('NOTE');
  });

  it('treats CRITICAL and HIGH as blocking, matching G2.4', () => {
    expect(isBlockingCodeqlSeverity('CRITICAL')).toBe(true);
    expect(isBlockingCodeqlSeverity('HIGH')).toBe(true);
    expect(isBlockingCodeqlSeverity('MEDIUM')).toBe(false);
    expect(isBlockingCodeqlSeverity('LOW')).toBe(false);
  });
});

describe('evaluateSarif', () => {
  it('splits blocking high findings from notes', () => {
    const evaluated = evaluateSarif(
      sarifOf({
        rules: [
          {
            id: 'js/xss',
            securitySeverity: '9.8',
            problemSeverity: 'error',
            defaultLevel: 'error',
          },
          {
            id: 'js/trivial',
            securitySeverity: '1.0',
            problemSeverity: 'recommendation',
            defaultLevel: 'note',
          },
        ],
        results: [
          { ruleId: 'js/xss', path: 'Evil.tsx', line: 1, message: 'DOM XSS' },
          { ruleId: 'js/trivial', path: 'ok.ts', line: 8 },
        ],
      }),
    );
    expect(evaluated.blocking).toHaveLength(1);
    expect(formatCodeqlFinding(evaluated.blocking[0]!)).toBe('js/xss Evil.tsx:1 CRITICAL');
    expect(evaluated.findings).toHaveLength(2);
    expect(evaluated.rules).toHaveLength(2);
  });

  it('fails closed on non-JSON, a missing runs array, and a non-object run', () => {
    expect(() => evaluateSarif('not json')).toThrow(/not JSON/);
    expect(() => evaluateSarif('{"version":"2.1.0"}')).toThrow(/missing runs/);
    expect(() => evaluateSarif('{"runs":[null]}')).toThrow(/run is not an object/);
  });

  it('rejects a result that is not an object', () => {
    expect(() => parseSarifFinding(null, new Map(), [])).toThrow(/not an object/);
    expect(() => parseCodeqlRule(null)).toThrow(/not an object/);
  });

  it('rejects a rules or results value that is not an array', () => {
    expect(() =>
      evaluateSarif(JSON.stringify({ runs: [{ tool: { driver: { rules: {} } }, results: [] }] })),
    ).toThrow(/rules is not an array/);
    expect(() =>
      evaluateSarif(
        JSON.stringify({
          runs: [{ tool: { driver: { rules: [{ id: 'js/x' }] } }, results: {} }],
        }),
      ),
    ).toThrow(/results is not an array/);
  });

  it('reads defaultConfiguration.level when defaultLevel is absent', () => {
    const rule = parseCodeqlRule({
      id: 'js/xss',
      defaultConfiguration: { level: 'error' },
      properties: { 'problem.severity': 'error' },
    });
    expect(rule.defaultLevel).toBe('error');
    expect(rule.securitySeverity).toBeUndefined();
  });

  it('parses a numeric security-severity and an unparseable one', () => {
    expect(
      parseCodeqlRule({ id: 'a', properties: { 'security-severity': 8.1 } }).securitySeverity,
    ).toBe(8.1);
    expect(
      parseCodeqlRule({ id: 'b', properties: { 'security-severity': 'nope' } }).securitySeverity,
    ).toBeUndefined();
  });

  it('reads ruleIndex when ruleId is empty', () => {
    const evaluated = evaluateSarif(
      sarifOf({
        rules: [{ id: 'js/sql-injection', securitySeverity: '8.1', problemSeverity: 'error' }],
        results: [{ ruleId: '', ruleIndex: 0, path: 'db.ts', line: 4 }],
      }),
    );
    expect(evaluated.blocking[0]?.ruleId).toBe('js/sql-injection');
    expect(evaluated.blocking[0]?.severity).toBe('HIGH');
  });
});

describe('buildCreateArgv / buildAnalyzeArgv', () => {
  it('creates a javascript-typescript database with the local codescanning config', () => {
    const argv = buildCreateArgv({ db: '/tmp/db', root: '/src', configPath: '/cfg.yml' });
    expect(argv.slice(0, 3)).toEqual(['database', 'create', '/tmp/db']);
    expect(argv).toContain('javascript-typescript');
    const configAt = argv.indexOf('--codescanning-config');
    expect(argv[configAt + 1]).toBe('/cfg.yml');
    expect(argv).toContain('--overwrite');
  });

  it('analyzes the pinned security-extended suite and asks for SARIF, never a grep', () => {
    const argv = buildAnalyzeArgv({
      db: '/tmp/db',
      suite: REQUIRED_CODEQL_SUITE,
      output: '/tmp/db/results.sarif',
    });
    expect(argv).toContain('analyze');
    expect(argv).toContain(REQUIRED_CODEQL_SUITE);
    expect(argv).toContain('sarif-latest');
    expect(argv.filter((flag) => flag.includes('grep'))).toEqual([]);
    const formatAt = argv.indexOf('--format');
    expect(argv[formatAt + 1]).toBe('sarif-latest');
  });
});

describe('runCodeqlCheck', () => {
  it('fails when the codescanning config is missing', () => {
    const root = tempDir('codeql-noconfig-');
    const output = runCodeqlCheck(
      {
        root,
        configPath: join(root, 'missing.yml'),
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      () => ({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('codeql config is required');
  });

  it('fails when security-extended is dropped from the config, rather than scanning a thinner set', () => {
    const root = tempDir('codeql-thin-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'), ['security-and-quality']);
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      () => ({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('missing required query uses');
    expect(output.stderr).toContain('security-extended');
  });

  it('fails when the suite argv is not the required pack', () => {
    const root = tempDir('codeql-suite-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: 'javascript-code-scanning.qls',
      },
      () => ({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('not the required security-extended pack');
  });

  it('fails when the scan root has no source files', () => {
    const root = tempDir('codeql-empty-src-');
    const configPath = writeConfig(join(root, 'cfg'));
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      () => ({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root contained no source files');
  });

  it('fails when the scan root is missing', () => {
    const root = tempDir('codeql-missing-root-');
    const configPath = writeConfig(join(root, 'cfg'));
    const output = runCodeqlCheck(
      {
        root: join(root, 'no-src'),
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      () => ({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when CodeQL is not on PATH', () => {
    const root = tempDir('codeql-nobin-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: '/no/such/codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      () => ({
        status: null,
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('spawn /no/such/codeql ENOENT'), { code: 'ENOENT' }),
      }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('codeql is required');
    expect(output.stdout).not.toContain('codeql passed');
  });

  it('fails when database create exits 2', () => {
    const root = tempDir('codeql-create-fail-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      () => ({ status: 2, stdout: '', stderr: 'extractor crashed', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('codeql database create failed (2)');
    expect(output.stderr).toContain('extractor crashed');
  });

  it('fails when analyze exits 2', () => {
    const root = tempDir('codeql-analyze-fail-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      { status: 2, stdout: '', stderr: 'unknown suite', error: undefined },
    );
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('codeql database analyze failed (2)');
  });

  it('fails when analyze writes nothing', () => {
    const root = tempDir('codeql-silent-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      { status: 0, stdout: '', stderr: '', error: undefined },
    );
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('codeql produced no SARIF');
  });

  it('fails when the suite ran zero queries', () => {
    const root = tempDir('codeql-noqueries-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      (output) =>
        writeSarif(
          output,
          JSON.stringify({ runs: [{ tool: { driver: { rules: [] } }, results: [] }] }),
        ),
    );
    const result = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('codeql reported no queries');
  });

  it('fails when CodeQL reports DOM XSS at CRITICAL', () => {
    const root = tempDir('codeql-xss-');
    writeFileSync(
      join(root, 'Evil.tsx'),
      'export const Evil = () => <div dangerouslySetInnerHTML={{ __html: x }} />;\n',
    );
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner, calls } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      (output) =>
        writeSarif(
          output,
          sarifOf({
            rules: [{ id: 'js/xss', securitySeverity: '9.8', problemSeverity: 'error' }],
            results: [{ ruleId: 'js/xss', path: 'Evil.tsx', line: 1 }],
          }),
        ),
    );
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('codeql failed (1)');
    expect(output.stderr).toContain('js/xss');
    expect(output.stderr).toContain('Evil.tsx:1');
    expect(output.stdout).not.toContain('codeql passed');
    expect(calls[0]?.[1]).toBe('create');
    expect(calls[1]).toContain(REQUIRED_CODEQL_SUITE);
  });

  it('passes when CodeQL returns SARIF with queries and no blocking findings', () => {
    const root = tempDir('codeql-clean-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      (output) => writeSarif(output, sarifOf({})),
    );
    const result = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('codeql passed');
  });

  it('does not fail the gate on MEDIUM-only findings', () => {
    const root = tempDir('codeql-medium-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      (output) =>
        writeSarif(
          output,
          sarifOf({
            rules: [{ id: 'js/style', securitySeverity: '4.2', problemSeverity: 'warning' }],
            results: [{ ruleId: 'js/style', path: 'ok.ts', line: 1 }],
          }),
        ),
    );
    const result = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 non-blocking findings');
  });

  it('fails when the engine JSON is garbage after a findings exit', () => {
    const root = tempDir('codeql-garbage-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      (output) => writeSarif(output, '<html>nope</html>'),
    );
    const result = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('codeql output was not JSON');
  });

  it('the default runner reports ENOENT for a missing binary', () => {
    const run = defaultCodeqlRunner({
      bin: join(tempDir('no-bin-'), 'no-codeql'),
      argv: ['version'],
      cwd: process.cwd(),
    });
    expect(run.status).toBeNull();
    expect(run.error).toBeDefined();
  });

  it('fails when the SARIF file is empty', () => {
    const root = tempDir('codeql-empty-sarif-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      (output) => writeSarif(output, '   \n'),
    );
    const result = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('codeql produced no SARIF');
  });

  it('fails when analyze is missing the binary after a successful create', () => {
    const root = tempDir('codeql-analyze-nobin-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const configPath = writeConfig(join(root, 'cfg'));
    const { runner } = runnerWriting(
      { status: 0, stdout: '', stderr: '', error: undefined },
      {
        status: null,
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('spawn codeql ENOENT'), { code: 'ENOENT' }),
      },
    );
    const output = runCodeqlCheck(
      {
        root,
        configPath,
        db: join(root, 'db'),
        codeqlBin: 'codeql',
        suite: REQUIRED_CODEQL_SUITE,
      },
      runner,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('codeql is required');
  });
});
