import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * G1.8 (`docs/14-quality-gates.md` §2, `docs/03-stack-decision.md` D13): gitleaks over the
 * checkout. A finding fails. A missing binary, an empty tree, or a thinned allowlist config
 * fails — the same fail-open G2.8 closed for an absent pnpm store.
 *
 * This module invokes Gitleaks. A TypeScript grep of `AKIA` / `ghp_` is not G1.8.
 *
 * L1 scans the files that would merge (`gitleaks dir`), not the full git history. The
 * periodic history scan is a later operations slice. `--ignore-gitleaks-allow` so a
 * `gitleaks:allow` comment cannot green a secret. A `.gitleaks.toml` or `.gitleaksignore`
 * in the scan root is red: thinning the default ruleset is how this gate goes green without
 * running the engine.
 *
 * Not folded into `pnpm verify`: the binary is an L1 CI install, the same way Semgrep /
 * CodeQL / Trivy stay off the local verify path.
 */

export const USAGE =
  'usage: check-secrets [--root <repo-root>] [--source <path>] [--gitleaks <binary>]';

export const THINNING_FILE_NAMES = ['.gitleaks.toml', '.gitleaksignore'] as const;

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git']);

export interface SecretsCheckArgs {
  readonly root: string;
  readonly source: string;
  readonly gitleaksBin: string;
}

export type ParseSecretsArgsResult =
  | { readonly ok: true; readonly args: SecretsCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface SecretsCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitleaksRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export type GitleaksRunner = (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}) => GitleaksRunResult;

export interface SecretFinding {
  readonly ruleId: string;
  readonly file: string;
  readonly line: number;
  readonly description: string;
}

export function defaultSource(root: string): string {
  return root;
}

export function parseSecretsArgs(
  argv: readonly string[],
  defaultRoot: string,
): ParseSecretsArgsResult {
  let root = defaultRoot;
  let source: string | undefined;
  let gitleaksBin = 'gitleaks';

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue = flag === '--root' || flag === '--source' || flag === '--gitleaks';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--root' ? 'directory' : 'path';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--source') source = value;
    if (flag === '--gitleaks') gitleaksBin = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      source: source ?? defaultSource(root),
      gitleaksBin,
    },
  };
}

export function listScanFiles(root: string): string[] {
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
      out.push(full);
    }
  }

  return out.sort();
}

export function listThinningFiles(root: string): string[] {
  return THINNING_FILE_NAMES.map((name) => join(root, name)).filter((path) => {
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  });
}

export function buildGitleaksArgv(options: { readonly source: string }): string[] {
  return [
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
    options.source,
  ];
}

export function defaultGitleaksRunner(options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}): GitleaksRunResult {
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

function asLine(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function parseSecretFinding(value: unknown): SecretFinding {
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error('gitleaks finding is not an object');
  }
  const file = asString(record['File']) || asString(record['FilePath']);
  const ruleId = asString(record['RuleID']) || asString(record['Rule']);
  return {
    ruleId,
    file,
    line: asLine(record['StartLine']),
    description: asString(record['Description']),
  };
}

export function parseGitleaksReport(raw: string): SecretFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('gitleaks output was not JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('gitleaks output is not a findings array');
  }
  return parsed.map((item) => parseSecretFinding(item));
}

export function formatFinding(finding: SecretFinding): string {
  const where = finding.line > 0 ? `${finding.file}:${String(finding.line)}` : finding.file;
  const rule = finding.ruleId === '' ? 'unknown-rule' : finding.ruleId;
  return `${rule} ${where}`;
}

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function fail(message: string): SecretsCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

export function runSecretsCheck(
  args: SecretsCheckArgs,
  runner: GitleaksRunner = defaultGitleaksRunner,
): SecretsCheckOutput {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  if (!existsSync(args.source) || !statSync(args.source).isDirectory()) {
    return fail(`scan source is required: ${basename(args.source)} is absent or not a directory`);
  }

  const thinning = listThinningFiles(args.source);
  if (thinning.length > 0) {
    const listed = thinning.map((path) => `  ${path}`).join('\n');
    return fail(
      `gitleaks config must not override the default ruleset; thinning allowlists is G1.8 red\n${listed}`,
    );
  }

  const files = listScanFiles(args.source);
  if (files.length === 0) {
    return fail('scan source has no files: a secrets check that saw no files has not run');
  }

  const run = runner({
    bin: args.gitleaksBin,
    argv: buildGitleaksArgv({ source: args.source }),
    cwd: args.root,
  });

  if (run.error !== undefined && (spawnErrorCode(run.error) === 'ENOENT' || run.status === null)) {
    return fail('gitleaks is required: the binary is absent or not executable');
  }

  if (run.status !== 0 && run.status !== 1) {
    const detail = (run.stderr || run.stdout).trim() || 'no output';
    return fail(`gitleaks failed (${String(run.status)}): ${detail}`);
  }

  if (run.stdout.trim() === '') {
    return fail('gitleaks produced no JSON: a secrets check that saw no engine output has not run');
  }

  try {
    const findings = parseGitleaksReport(run.stdout);
    if (findings.length > 0) {
      const listed = findings.map((finding) => `  ${formatFinding(finding)}`).join('\n');
      return fail(`secrets failed (${String(findings.length)}):\n${listed}`);
    }
    return {
      ok: true,
      exitCode: 0,
      stdout: `secrets passed (${String(files.length)} files, 0 findings)\n`,
      stderr: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
