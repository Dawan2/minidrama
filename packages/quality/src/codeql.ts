import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { listSourceFiles } from './sast.js';

/**
 * G2.4 (`docs/14-quality-gates.md` §4, `docs/03-stack-decision.md` D13): CodeQL, the other
 * half of SAST after Semgrep. High-and-above findings fail. A missing binary, a missing
 * codescanning config, a suite with no queries, or a tree with no source files fails — the
 * same fail-open G2.8 closed for an absent pnpm store.
 *
 * This module invokes CodeQL. A TypeScript grep of SARIF rule ids is not G2.4.
 */

export const USAGE =
  'usage: check-codeql [--root <repo-root>] [--config <yml>] [--db <dir>] [--codeql <binary>] [--suite <qls>]';

/** Pack-qualified security-extended suite. A later slice must not silently swap this for `code-scanning`. */
export const REQUIRED_CODEQL_SUITE =
  'codeql/javascript-queries:codeql-suites/javascript-security-extended.qls';

export const REQUIRED_CODEQL_QUERY_USES = 'security-extended';

/** GitHub code-scanning mapping: security-severity ≥ 7.0 is high; ≥ 9.0 is critical. */
export const HIGH_SECURITY_SEVERITY_FLOOR = 7.0;
export const CRITICAL_SECURITY_SEVERITY_FLOOR = 9.0;

export interface CodeqlCheckArgs {
  readonly root: string;
  readonly configPath: string;
  readonly db: string;
  readonly codeqlBin: string;
  readonly suite: string;
}

export type ParseCodeqlArgsResult =
  | { readonly ok: true; readonly args: CodeqlCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface CodeqlCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CodeqlRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export type CodeqlRunner = (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}) => CodeqlRunResult;

export interface CodeqlFinding {
  readonly ruleId: string;
  readonly path: string;
  readonly line: number;
  readonly severity: string;
  readonly message: string;
}

export interface CodeqlRule {
  readonly id: string;
  readonly securitySeverity: number | undefined;
  readonly problemSeverity: string;
  readonly defaultLevel: string;
}

export function defaultConfigPath(root: string): string {
  return join(root, 'packages', 'quality', 'codeql', 'codeql-config.yml');
}

export function defaultDatabaseDir(root: string): string {
  return join(root, '.codeql-database');
}

export function parseCodeqlArgs(
  argv: readonly string[],
  defaultRoot: string,
): ParseCodeqlArgsResult {
  let root = defaultRoot;
  let configPath: string | undefined;
  let db: string | undefined;
  let codeqlBin = 'codeql';
  let suite = REQUIRED_CODEQL_SUITE;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue =
      flag === '--root' ||
      flag === '--config' ||
      flag === '--db' ||
      flag === '--codeql' ||
      flag === '--suite';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--root' ? 'directory' : 'path';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--config') configPath = value;
    if (flag === '--db') db = value;
    if (flag === '--codeql') codeqlBin = value;
    if (flag === '--suite') suite = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      configPath: configPath ?? defaultConfigPath(root),
      db: db ?? defaultDatabaseDir(root),
      codeqlBin,
      suite,
    },
  };
}

export function parseCodeqlConfigYaml(text: string): { readonly uses: string[] } {
  const uses: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const match = /^(?:-\s*)?uses:\s*(\S+)\s*$/.exec(line);
    if (match?.[1] !== undefined) {
      uses.push(match[1]);
    }
  }
  return { uses };
}

export function loadCodeqlConfig(configPath: string): { readonly uses: string[] } {
  return parseCodeqlConfigYaml(readFileSync(configPath, 'utf8'));
}

export function missingRequiredQueryUses(uses: readonly string[]): string[] {
  return uses.includes(REQUIRED_CODEQL_QUERY_USES) ? [] : [REQUIRED_CODEQL_QUERY_USES];
}

export function buildCreateArgv(options: {
  readonly db: string;
  readonly root: string;
  readonly configPath: string;
}): string[] {
  return [
    'database',
    'create',
    options.db,
    '--language',
    'javascript-typescript',
    '--source-root',
    options.root,
    '--overwrite',
    '--codescanning-config',
    options.configPath,
    '--threads',
    '0',
  ];
}

export function buildAnalyzeArgv(options: {
  readonly db: string;
  readonly suite: string;
  readonly output: string;
}): string[] {
  return [
    'database',
    'analyze',
    options.db,
    options.suite,
    '--format',
    'sarif-latest',
    '--output',
    options.output,
    '--threads',
    '0',
  ];
}

export function defaultCodeqlRunner(options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}): CodeqlRunResult {
  const result = spawnSync(options.bin, [...options.argv], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function parseCodeqlRule(value: unknown): CodeqlRule {
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error('codeql rule is not an object');
  }
  const properties = asRecord(record['properties']) ?? {};
  const defaultConfiguration = asRecord(record['defaultConfiguration']);
  const defaultLevel =
    asString(defaultConfiguration?.['level']) || asString(record['defaultLevel']);
  return {
    id: asString(record['id']),
    securitySeverity: asNumber(properties['security-severity']),
    problemSeverity: asString(properties['problem.severity']),
    defaultLevel,
  };
}

export function githubSeverity(options: {
  readonly securitySeverity: number | undefined;
  readonly level: string;
  readonly problemSeverity: string;
}): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NOTE' {
  if (options.securitySeverity !== undefined) {
    if (options.securitySeverity >= CRITICAL_SECURITY_SEVERITY_FLOOR) return 'CRITICAL';
    if (options.securitySeverity >= HIGH_SECURITY_SEVERITY_FLOOR) return 'HIGH';
    if (options.securitySeverity >= 4.0) return 'MEDIUM';
    return 'LOW';
  }
  const level = options.level.toLowerCase();
  const problem = options.problemSeverity.toLowerCase();
  if (level === 'error' || problem === 'error') return 'HIGH';
  if (level === 'warning' || problem === 'warning') return 'MEDIUM';
  return 'NOTE';
}

export function isBlockingCodeqlSeverity(severity: string): boolean {
  const upper = severity.toUpperCase();
  return upper === 'CRITICAL' || upper === 'HIGH';
}

function locationPathAndLine(result: Record<string, unknown>): { path: string; line: number } {
  const locations = result['locations'];
  if (!Array.isArray(locations) || locations.length === 0) {
    return { path: '', line: 0 };
  }
  const first = asRecord(locations[0]);
  const physical = asRecord(first?.['physicalLocation']);
  const artifact = asRecord(physical?.['artifactLocation']);
  const region = asRecord(physical?.['region']);
  const line = region?.['startLine'];
  return {
    path: asString(artifact?.['uri']),
    line: typeof line === 'number' ? line : 0,
  };
}

export function parseSarifFinding(
  value: unknown,
  rulesById: ReadonlyMap<string, CodeqlRule>,
  rulesByIndex: readonly CodeqlRule[],
): CodeqlFinding {
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error('codeql result is not an object');
  }
  const ruleId = asString(record['ruleId']);
  const ruleIndex = record['ruleIndex'];
  const fromIndex =
    typeof ruleIndex === 'number' && ruleIndex >= 0 && ruleIndex < rulesByIndex.length
      ? rulesByIndex[ruleIndex]
      : undefined;
  const rule = (ruleId !== '' ? rulesById.get(ruleId) : undefined) ?? fromIndex;
  const messageObj = asRecord(record['message']);
  const loc = locationPathAndLine(record);
  const level = asString(record['level']) || rule?.defaultLevel || '';
  const severity = githubSeverity({
    securitySeverity: rule?.securitySeverity,
    level,
    problemSeverity: rule?.problemSeverity ?? '',
  });
  return {
    ruleId: ruleId || rule?.id || '',
    path: loc.path,
    line: loc.line,
    severity,
    message: asString(messageObj?.['text']),
  };
}

export function evaluateSarif(raw: string): {
  readonly rules: CodeqlRule[];
  readonly findings: CodeqlFinding[];
  readonly blocking: CodeqlFinding[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('codeql output was not JSON');
  }
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new Error('codeql output is not an object');
  }
  const runs = record['runs'];
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error('codeql output is missing runs');
  }

  const rules: CodeqlRule[] = [];
  const findings: CodeqlFinding[] = [];

  for (const runValue of runs) {
    const run = asRecord(runValue);
    if (run === undefined) {
      throw new Error('codeql run is not an object');
    }
    const tool = asRecord(run['tool']);
    const driver = asRecord(tool?.['driver']);
    const listedRules = driver?.['rules'];
    const runRules: CodeqlRule[] = [];
    if (listedRules !== undefined && listedRules !== null) {
      if (!Array.isArray(listedRules)) {
        throw new Error('codeql rules is not an array');
      }
      for (const item of listedRules) {
        runRules.push(parseCodeqlRule(item));
      }
    }
    rules.push(...runRules);
    const rulesById = new Map(
      runRules.filter((rule) => rule.id !== '').map((rule) => [rule.id, rule]),
    );
    const results = run['results'];
    if (results === undefined || results === null) continue;
    if (!Array.isArray(results)) {
      throw new Error('codeql results is not an array');
    }
    for (const item of results) {
      findings.push(parseSarifFinding(item, rulesById, runRules));
    }
  }

  const blocking = findings.filter((finding) => isBlockingCodeqlSeverity(finding.severity));
  return { rules, findings, blocking };
}

export function formatCodeqlFinding(finding: CodeqlFinding): string {
  return `${finding.ruleId} ${finding.path}:${String(finding.line)} ${finding.severity}`;
}

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function fail(message: string): CodeqlCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

function isMissingBinary(run: CodeqlRunResult): boolean {
  return run.error !== undefined && (spawnErrorCode(run.error) === 'ENOENT' || run.status === null);
}

export function runCodeqlCheck(
  args: CodeqlCheckArgs,
  runner: CodeqlRunner = defaultCodeqlRunner,
): CodeqlCheckOutput {
  if (!existsSync(args.configPath) || !statSync(args.configPath).isFile()) {
    return fail('codeql config is required: codescanning config is absent or not a file');
  }

  const config = loadCodeqlConfig(args.configPath);
  const missing = missingRequiredQueryUses(config.uses);
  if (missing.length > 0) {
    return fail(`codeql config is missing required query uses: ${missing.join(', ')}`);
  }

  if (args.suite !== REQUIRED_CODEQL_SUITE) {
    return fail(
      `codeql suite is not the required security-extended pack: ${args.suite} (expected ${REQUIRED_CODEQL_SUITE})`,
    );
  }

  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  const sources = listSourceFiles(args.root);
  if (sources.length === 0) {
    return fail('scan root contained no source files: a SAST check that saw no files has not run');
  }

  mkdirSync(dirname(args.db), { recursive: true });

  const created = runner({
    bin: args.codeqlBin,
    argv: buildCreateArgv({ db: args.db, root: args.root, configPath: args.configPath }),
    cwd: args.root,
  });

  if (isMissingBinary(created)) {
    return fail('codeql is required: the binary is absent or not executable');
  }

  if (created.status !== 0) {
    const detail = (created.stderr || created.stdout).trim() || 'no output';
    return fail(`codeql database create failed (${String(created.status)}): ${detail}`);
  }

  const sarifPath = join(args.db, 'results.sarif');
  mkdirSync(args.db, { recursive: true });

  const analyzed = runner({
    bin: args.codeqlBin,
    argv: buildAnalyzeArgv({ db: args.db, suite: args.suite, output: sarifPath }),
    cwd: args.root,
  });

  if (isMissingBinary(analyzed)) {
    return fail('codeql is required: the binary is absent or not executable');
  }

  if (analyzed.status !== 0 && analyzed.status !== 1) {
    const detail = (analyzed.stderr || analyzed.stdout).trim() || 'no output';
    return fail(`codeql database analyze failed (${String(analyzed.status)}): ${detail}`);
  }

  if (!existsSync(sarifPath) || !statSync(sarifPath).isFile()) {
    return fail('codeql produced no SARIF: a SAST check that saw no engine output has not run');
  }

  const raw = readFileSync(sarifPath, 'utf8');
  if (raw.trim() === '') {
    return fail('codeql produced no SARIF: a SAST check that saw no engine output has not run');
  }

  try {
    const evaluated = evaluateSarif(raw);
    if (evaluated.rules.length === 0) {
      return fail('codeql reported no queries: a SAST check that saw no rules has not run');
    }
    if (evaluated.blocking.length > 0) {
      const listed = evaluated.blocking
        .map((finding) => `  ${formatCodeqlFinding(finding)}`)
        .join('\n');
      return fail(`codeql failed (${String(evaluated.blocking.length)}):\n${listed}`);
    }
    return {
      ok: true,
      exitCode: 0,
      stdout:
        `codeql passed (${String(sources.length)} files, ${String(evaluated.rules.length)} queries, ` +
        `${String(evaluated.findings.length)} non-blocking findings)\n`,
      stderr: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
