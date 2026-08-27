import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * G2.4 (`docs/14-quality-gates.md` §4, `docs/03-stack-decision.md` D13): Semgrep with the
 * 14-security §2.1 custom rules. High (ERROR) findings fail. A missing binary, an empty rules
 * directory, or a tree with no source files fails — the same fail-open G2.8 closed for an absent
 * pnpm store.
 *
 * This module invokes Semgrep. A TypeScript grep of the same needles is not G2.4.
 */

export const USAGE =
  'usage: check-sast [--root <repo-root>] [--rules <rules-dir>] [--semgrep <binary>]';

export const REQUIRED_SAST_RULE_IDS = [
  'ban-dangerously-set-inner-html',
  'ban-v-html',
  'ban-innerhtml-assignment',
  'ban-document-write',
  'ban-eval',
  'ban-string-concat-sql',
  'ban-shell-concat',
] as const;

export const BLOCKING_SEVERITIES = new Set(['ERROR', 'HIGH', 'CRITICAL']);

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export interface SastRule {
  readonly id: string;
  readonly severity: string;
}

export interface SastFinding {
  readonly checkId: string;
  readonly path: string;
  readonly line: number;
  readonly severity: string;
  readonly message: string;
}

export interface SastCheckArgs {
  readonly root: string;
  readonly rulesDir: string;
  readonly semgrepBin: string;
}

export type ParseSastArgsResult =
  | { readonly ok: true; readonly args: SastCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface SastCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SemgrepRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export type SemgrepRunner = (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}) => SemgrepRunResult;

export function defaultRulesDir(root: string): string {
  return join(root, 'packages', 'quality', 'semgrep');
}

export function parseSastArgs(argv: readonly string[], defaultRoot: string): ParseSastArgsResult {
  let root = defaultRoot;
  let rulesDir: string | undefined;
  let semgrepBin = 'semgrep';

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue = flag === '--root' || flag === '--rules' || flag === '--semgrep';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--semgrep' ? 'path' : 'directory';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--rules') rulesDir = value;
    if (flag === '--semgrep') semgrepBin = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      rulesDir: rulesDir ?? defaultRulesDir(root),
      semgrepBin,
    },
  };
}

export function parseSemgrepRulesYaml(text: string): SastRule[] {
  const rules: SastRule[] = [];
  let currentId: string | undefined;
  let currentSeverity: string | undefined;

  const flush = (): void => {
    if (currentId !== undefined) {
      rules.push({ id: currentId, severity: currentSeverity ?? '' });
    }
    currentId = undefined;
    currentSeverity = undefined;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const idMatch = /^(?:-\s*)?id:\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/.exec(line);
    if (idMatch?.[1] !== undefined) {
      flush();
      currentId = idMatch[1];
      continue;
    }
    const severityMatch = /^severity:\s*([A-Za-z]+)\s*$/.exec(line);
    if (severityMatch?.[1] !== undefined && currentId !== undefined) {
      currentSeverity = severityMatch[1];
    }
  }
  flush();
  return rules;
}

export function listRuleFiles(rulesDir: string): string[] {
  if (!existsSync(rulesDir) || !statSync(rulesDir).isDirectory()) {
    return [];
  }
  return readdirSync(rulesDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => join(rulesDir, name))
    .sort();
}

export function loadSastRules(rulesDir: string): SastRule[] {
  return listRuleFiles(rulesDir).flatMap((path) =>
    parseSemgrepRulesYaml(readFileSync(path, 'utf8')),
  );
}

export function missingRequiredRuleIds(rules: readonly SastRule[]): string[] {
  const have = new Set(rules.map((rule) => rule.id));
  return REQUIRED_SAST_RULE_IDS.filter((id) => !have.has(id));
}

export function nonBlockingRequiredRules(rules: readonly SastRule[]): string[] {
  const required = new Set<string>(REQUIRED_SAST_RULE_IDS);
  return rules
    .filter((rule) => required.has(rule.id))
    .filter((rule) => !BLOCKING_SEVERITIES.has(rule.severity.toUpperCase()))
    .map((rule) => rule.id);
}

export function isTestFileName(name: string): boolean {
  return /\.test\.(ts|tsx|js|jsx)$/.test(name);
}

export function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop() ?? '';
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isTestFileName(entry.name) || entry.name.endsWith('.d.ts')) continue;
      if (SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(full);
    }
  }

  return out.sort();
}

export function buildSemgrepArgv(options: {
  readonly rulesDir: string;
  readonly root: string;
}): string[] {
  return [
    'scan',
    '--config',
    options.rulesDir,
    '--json',
    '--metrics=off',
    '--disable-version-check',
    '--error',
    '--exclude',
    'node_modules',
    '--exclude',
    'dist',
    '--exclude',
    'coverage',
    '--exclude',
    '*.test.ts',
    '--exclude',
    '*.test.tsx',
    options.root,
  ];
}

export function defaultSemgrepRunner(options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}): SemgrepRunResult {
  const result = spawnSync(options.bin, [...options.argv], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      SEMGREP_SEND_METRICS: 'off',
      SEMGREP_ENABLE_VERSION_CHECK: '0',
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

function readLine(start: unknown): number {
  const record = asRecord(start);
  const line = record?.['line'];
  return typeof line === 'number' ? line : 0;
}

export function parseSemgrepFinding(value: unknown): SastFinding {
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error('semgrep finding is not an object');
  }
  const extra = asRecord(record['extra']) ?? {};
  const checkId = record['check_id'];
  const path = record['path'];
  const message = extra['message'];
  const severity = extra['severity'];
  return {
    checkId: typeof checkId === 'string' ? checkId : '',
    path: typeof path === 'string' ? path : '',
    line: readLine(record['start']),
    severity: typeof severity === 'string' ? severity : '',
    message: typeof message === 'string' ? message : '',
  };
}

export function evaluateSemgrepJson(raw: string): {
  readonly findings: SastFinding[];
  readonly blocking: SastFinding[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('semgrep output was not JSON');
  }
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new Error('semgrep output is not an object');
  }
  const errors = record['errors'];
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(`semgrep reported ${String(errors.length)} engine error(s)`);
  }
  const results = record['results'];
  if (!Array.isArray(results)) {
    throw new Error('semgrep output is missing results');
  }
  const findings = results.map(parseSemgrepFinding);
  const blocking = findings.filter((finding) =>
    BLOCKING_SEVERITIES.has(finding.severity.toUpperCase()),
  );
  return { findings, blocking };
}

export function formatFinding(finding: SastFinding): string {
  return `${finding.checkId} ${finding.path}:${String(finding.line)} ${finding.severity}`;
}

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function fail(message: string): SastCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

export function runSastCheck(
  args: SastCheckArgs,
  runner: SemgrepRunner = defaultSemgrepRunner,
): SastCheckOutput {
  if (!existsSync(args.rulesDir) || !statSync(args.rulesDir).isDirectory()) {
    return fail('semgrep rules are required: rules directory is absent or not a directory');
  }

  const ruleFiles = listRuleFiles(args.rulesDir);
  if (ruleFiles.length === 0) {
    return fail('semgrep rules directory is empty: a SAST check that saw no rules has not run');
  }

  const rules = loadSastRules(args.rulesDir);
  const missing = missingRequiredRuleIds(rules);
  if (missing.length > 0) {
    return fail(`semgrep rules are missing required ids: ${missing.join(', ')}`);
  }
  const weak = nonBlockingRequiredRules(rules);
  if (weak.length > 0) {
    return fail(`semgrep required rules are not blocking severity: ${weak.join(', ')}`);
  }

  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  const sources = listSourceFiles(args.root);
  if (sources.length === 0) {
    return fail('scan root contained no source files: a SAST check that saw no files has not run');
  }

  const run = runner({
    bin: args.semgrepBin,
    argv: buildSemgrepArgv({ rulesDir: args.rulesDir, root: args.root }),
    cwd: args.root,
  });

  if (run.error !== undefined && (spawnErrorCode(run.error) === 'ENOENT' || run.status === null)) {
    return fail('semgrep is required: the binary is absent or not executable');
  }

  if (run.status !== 0 && run.status !== 1) {
    const detail = (run.stderr || run.stdout).trim() || 'no output';
    return fail(`semgrep failed (${String(run.status)}): ${detail}`);
  }

  if (run.stdout.trim() === '') {
    return fail('semgrep produced no JSON: a SAST check that saw no engine output has not run');
  }

  try {
    const evaluated = evaluateSemgrepJson(run.stdout);
    if (evaluated.blocking.length > 0) {
      const listed = evaluated.blocking.map((finding) => `  ${formatFinding(finding)}`).join('\n');
      return fail(`sast failed (${String(evaluated.blocking.length)}):\n${listed}`);
    }
    return {
      ok: true,
      exitCode: 0,
      stdout: `sast passed (${String(sources.length)} files, ${String(evaluated.findings.length)} non-blocking findings)\n`,
      stderr: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
