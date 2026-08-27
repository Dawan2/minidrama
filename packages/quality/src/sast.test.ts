import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './paths.js';
import {
  BLOCKING_SEVERITIES,
  REQUIRED_SAST_RULE_IDS,
  USAGE,
  buildSemgrepArgv,
  defaultRulesDir,
  evaluateSemgrepJson,
  formatFinding,
  listSourceFiles,
  loadSastRules,
  missingRequiredRuleIds,
  nonBlockingRequiredRules,
  parseSastArgs,
  parseSemgrepFinding,
  parseSemgrepRulesYaml,
  runSastCheck,
  type SemgrepRunResult,
} from './sast.js';

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

function writeRules(
  dir: string,
  rules: ReadonlyArray<{ readonly id: string; readonly severity: string }>,
): string {
  mkdirSync(dir, { recursive: true });
  const body = [
    'rules:',
    ...rules.flatMap((rule) => [`  - id: ${rule.id}`, `    severity: ${rule.severity}`]),
    '',
  ].join('\n');
  writeFileSync(join(dir, 'rules.yml'), body);
  return dir;
}

function completeRules(
  extra: ReadonlyArray<{ readonly id: string; readonly severity: string }> = [],
): ReadonlyArray<{ readonly id: string; readonly severity: string }> {
  return [...REQUIRED_SAST_RULE_IDS.map((id) => ({ id, severity: 'ERROR' })), ...extra];
}

function findingJson(
  findings: ReadonlyArray<{
    readonly check_id: string;
    readonly path: string;
    readonly line: number;
    readonly severity: string;
    readonly message?: string;
  }>,
): string {
  return JSON.stringify({
    results: findings.map((finding) => ({
      check_id: finding.check_id,
      path: finding.path,
      start: { line: finding.line },
      extra: { severity: finding.severity, message: finding.message ?? '' },
    })),
    errors: [],
  });
}

function runnerOf(result: SemgrepRunResult): () => SemgrepRunResult {
  return () => result;
}

describe('parseSastArgs', () => {
  it('defaults rules to packages/quality/semgrep under the named root', () => {
    const parsed = parseSastArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/repo',
        rulesDir: '/repo/packages/quality/semgrep',
        semgrepBin: 'semgrep',
      },
    });
  });

  it('accepts --root, --rules, and --semgrep', () => {
    const parsed = parseSastArgs(
      ['--root', '/app', '--rules', '/rules', '--semgrep', '/bin/semgrep'],
      '/repo',
    );
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/app', rulesDir: '/rules', semgrepBin: '/bin/semgrep' },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseSastArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag with no value', () => {
    expect(parseSastArgs(['--rules'], '/repo')).toEqual({
      ok: false,
      message: '--rules requires a directory',
    });
    expect(parseSastArgs(['--semgrep', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--semgrep requires a path',
    });
  });

  it('documents the usage string the CLI prints on parse failure', () => {
    expect(USAGE).toContain('check-sast');
    expect(USAGE).toContain('--semgrep');
  });
});

describe('parseSemgrepRulesYaml', () => {
  it('reads ids and severities out of a Semgrep rules file', () => {
    const rules = parseSemgrepRulesYaml(`
rules:
  - id: ban-eval
    severity: ERROR
  - id: ban-v-html
    severity: HIGH
`);
    expect(rules).toEqual([
      { id: 'ban-eval', severity: 'ERROR' },
      { id: 'ban-v-html', severity: 'HIGH' },
    ]);
  });

  it('treats a missing severity as empty rather than inventing ERROR', () => {
    expect(parseSemgrepRulesYaml('rules:\n  - id: ban-eval\n')).toEqual([
      { id: 'ban-eval', severity: '' },
    ]);
  });
});

describe('required rule ids', () => {
  it('names every 14-security §2.1 clause stack-decision D13 asked Semgrep to carry', () => {
    expect([...REQUIRED_SAST_RULE_IDS]).toEqual([
      'ban-dangerously-set-inner-html',
      'ban-v-html',
      'ban-innerhtml-assignment',
      'ban-document-write',
      'ban-eval',
      'ban-string-concat-sql',
      'ban-shell-concat',
    ]);
  });

  it('reports ids the YAML dropped, which is how greening G2.4 by deleting a rule fails', () => {
    const rules = [{ id: 'ban-eval', severity: 'ERROR' }];
    expect(missingRequiredRuleIds(rules)).toContain('ban-dangerously-set-inner-html');
    expect(missingRequiredRuleIds(rules)).toContain('ban-string-concat-sql');
  });

  it('reports a required rule whose severity was lowered below high', () => {
    const rules = REQUIRED_SAST_RULE_IDS.map((id) => ({
      id,
      severity: id === 'ban-eval' ? 'INFO' : 'ERROR',
    }));
    expect(nonBlockingRequiredRules(rules)).toEqual(['ban-eval']);
  });

  it('loads the committed ruleset and finds every required id at blocking severity', () => {
    const rules = loadSastRules(defaultRulesDir(repoRoot));
    expect(missingRequiredRuleIds(rules)).toEqual([]);
    expect(nonBlockingRequiredRules(rules)).toEqual([]);
    for (const rule of rules) {
      if ((REQUIRED_SAST_RULE_IDS as readonly string[]).includes(rule.id)) {
        expect(BLOCKING_SEVERITIES.has(rule.severity.toUpperCase())).toBe(true);
      }
    }
  });
});

describe('listSourceFiles', () => {
  it('skips node_modules, dist, coverage, tests, and declaration files', () => {
    const root = tempDir('sast-src-');
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'src', 'ok.ts'), 'export const x = 1;\n');
    writeFileSync(join(root, 'src', 'ok.test.ts'), 'export const t = 1;\n');
    writeFileSync(join(root, 'src', 'skip.d.ts'), 'export {};\n');
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
    writeFileSync(join(root, 'dist', 'chunk.js'), 'console.log(1);\n');

    expect(listSourceFiles(root)).toEqual([join(root, 'src', 'ok.ts')]);
  });
});

describe('evaluateSemgrepJson', () => {
  it('splits blocking high findings from warnings', () => {
    const evaluated = evaluateSemgrepJson(
      findingJson([
        {
          check_id: 'ban-eval',
          path: 'app.ts',
          line: 4,
          severity: 'ERROR',
          message: 'eval',
        },
        {
          check_id: 'style',
          path: 'app.ts',
          line: 8,
          severity: 'WARNING',
        },
      ]),
    );
    expect(evaluated.blocking).toHaveLength(1);
    expect(formatFinding(evaluated.blocking[0]!)).toBe('ban-eval app.ts:4 ERROR');
    expect(evaluated.findings).toHaveLength(2);
  });

  it('treats HIGH and CRITICAL as blocking, matching G2.4', () => {
    const evaluated = evaluateSemgrepJson(
      findingJson([
        { check_id: 'a', path: 'a.ts', line: 1, severity: 'HIGH' },
        { check_id: 'b', path: 'b.ts', line: 1, severity: 'CRITICAL' },
        { check_id: 'c', path: 'c.ts', line: 1, severity: 'INFO' },
      ]),
    );
    expect(evaluated.blocking.map((finding) => finding.checkId)).toEqual(['a', 'b']);
  });

  it('fails closed on non-JSON, a missing results array, and engine errors', () => {
    expect(() => evaluateSemgrepJson('not json')).toThrow(/not JSON/);
    expect(() => evaluateSemgrepJson('{"version":1}')).toThrow(/missing results/);
    expect(() => evaluateSemgrepJson('{"results":[],"errors":[{}]}')).toThrow(/engine error/);
  });

  it('rejects a finding that is not an object', () => {
    expect(() => parseSemgrepFinding(null)).toThrow(/not an object/);
  });
});

describe('buildSemgrepArgv', () => {
  it('points Semgrep at the local rules and asks for JSON, never a registry p/ config', () => {
    const argv = buildSemgrepArgv({ rulesDir: '/rules', root: '/src' });
    expect(argv).toContain('scan');
    expect(argv).toContain('--json');
    expect(argv).toContain('--error');
    expect(argv).toContain('--metrics=off');
    expect(argv.filter((flag) => flag.startsWith('p/'))).toEqual([]);
    const configAt = argv.indexOf('--config');
    expect(argv[configAt + 1]).toBe('/rules');
    expect(argv.at(-1)).toBe('/src');
  });
});

describe('runSastCheck', () => {
  it('fails when the rules directory is missing', () => {
    const root = tempDir('sast-norules-');
    const output = runSastCheck(
      { root, rulesDir: join(root, 'no-such-rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('semgrep rules are required');
  });

  it('fails when the rules directory exists but contains no yaml', () => {
    const root = tempDir('sast-empty-rules-');
    mkdirSync(join(root, 'rules'));
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('semgrep rules directory is empty');
  });

  it('fails when a required rule id is absent, rather than scanning with a thinner set', () => {
    const root = tempDir('sast-thin-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    writeRules(join(root, 'rules'), [{ id: 'ban-eval', severity: 'ERROR' }]);
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('missing required ids');
    expect(output.stderr).toContain('ban-dangerously-set-inner-html');
  });

  it('fails when a required rule is lowered to INFO', () => {
    const root = tempDir('sast-info-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    writeRules(
      join(root, 'rules'),
      REQUIRED_SAST_RULE_IDS.map((id) => ({
        id,
        severity: id === 'ban-eval' ? 'INFO' : 'ERROR',
      })),
    );
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('not blocking severity');
    expect(output.stderr).toContain('ban-eval');
  });

  it('fails when the scan root has no source files', () => {
    const root = tempDir('sast-empty-src-');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root contained no source files');
  });

  it('fails when the scan root is missing', () => {
    const root = tempDir('sast-missing-root-');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      {
        root: join(root, 'no-src'),
        rulesDir: join(root, 'rules'),
        semgrepBin: 'semgrep',
      },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when Semgrep is not on PATH', () => {
    const root = tempDir('sast-nobin-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: '/no/such/semgrep' },
      runnerOf({
        status: null,
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('spawn /no/such/semgrep ENOENT'), { code: 'ENOENT' }),
      }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('semgrep is required');
    expect(output.stdout).not.toContain('sast passed');
  });

  it('fails when Semgrep exits 2', () => {
    const root = tempDir('sast-crash-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 2, stdout: '', stderr: 'invalid config', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('semgrep failed (2)');
    expect(output.stderr).toContain('invalid config');
  });

  it('fails when Semgrep prints nothing', () => {
    const root = tempDir('sast-silent-');
    writeFileSync(join(root, 'app.ts'), 'export const x = 1;\n');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('semgrep produced no JSON');
  });

  it('fails when Semgrep reports dangerouslySetInnerHTML at ERROR', () => {
    const root = tempDir('sast-xss-');
    writeFileSync(
      join(root, 'Evil.tsx'),
      'export const Evil = () => <div dangerouslySetInnerHTML={{ __html: x }} />;\n',
    );
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({
        status: 1,
        stdout: findingJson([
          {
            check_id: 'ban-dangerously-set-inner-html',
            path: 'Evil.tsx',
            line: 1,
            severity: 'ERROR',
          },
        ]),
        stderr: '',
        error: undefined,
      }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('sast failed (1)');
    expect(output.stderr).toContain('ban-dangerously-set-inner-html');
    expect(output.stderr).toContain('Evil.tsx:1');
    expect(output.stdout).not.toContain('sast passed');
  });

  it('passes when Semgrep returns JSON with no blocking findings', () => {
    const root = tempDir('sast-clean-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({
        status: 0,
        stdout: findingJson([]),
        stderr: '',
        error: undefined,
      }),
    );
    expect(output.stderr).toBe('');
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('sast passed');
  });

  it('does not fail the gate on WARNING-only findings', () => {
    const root = tempDir('sast-warn-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({
        status: 1,
        stdout: findingJson([{ check_id: 'style', path: 'ok.ts', line: 1, severity: 'WARNING' }]),
        stderr: '',
        error: undefined,
      }),
    );
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('1 non-blocking findings');
  });

  it('fails when the engine JSON is garbage after a findings exit', () => {
    const root = tempDir('sast-garbage-');
    writeFileSync(join(root, 'ok.ts'), 'export const x = 1;\n');
    writeRules(join(root, 'rules'), completeRules());
    const output = runSastCheck(
      { root, rulesDir: join(root, 'rules'), semgrepBin: 'semgrep' },
      runnerOf({ status: 1, stdout: '<html>nope</html>', stderr: '', error: undefined }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('semgrep output was not JSON');
  });
});
