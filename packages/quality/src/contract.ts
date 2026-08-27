import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * G1.6 (`docs/14-quality-gates.md` §2, `docs/architecture/tech-stack.md` T23): oasdiff breaking
 * between the committed baseline and `contracts/openapi.yaml`. An ERR-level change fails.
 * A missing binary, a missing spec, empty engine output, or a thinning ignore/config file
 * fails — the same fail-open G2.8 closed for an absent pnpm store.
 *
 * This module invokes oasdiff. A TypeScript grep of path strings is not G1.6.
 *
 * Provider schema validation already lives in `server/src/contract.test.ts` (G1.4). This job is
 * the compatibility-diff half: delete a field, change a type, add a required request property,
 * or narrow an enum (`docs/14-test-plan.md` §4.1).
 *
 * `--err-ignore` / `--warn-ignore` / `--severity-levels` / `--open` are never passed. A
 * `.oasdiff.*` next to the spec is red: thinning the default checks is how this gate goes
 * green without scanning.
 *
 * Not folded into `pnpm verify`: the binary is an L1 CI install, the same way Gitleaks stays
 * off the local verify path.
 */

export const USAGE =
  'usage: check-contract [--root <repo-root>] [--base <path>] [--revision <path>] [--oasdiff <binary>]';

export const BASELINE_RELATIVE = 'contracts/oasdiff-baseline.yaml';
export const REVISION_RELATIVE = 'contracts/openapi.yaml';

/** oasdiff JSON `level` for ERR (`oasdiff schema`; ERR = 3, WARN = 2, INFO = 1). */
export const ERR_LEVEL = 3;

export const THINNING_FILE_NAMES = [
  '.oasdiff.yaml',
  '.oasdiff.yml',
  '.oasdiff.json',
  '.oasdiff.toml',
  '.oasdiff',
  'oasdiff-levels.txt',
  'err.ignore',
  'warn.ignore',
] as const;

export interface ContractCheckArgs {
  readonly root: string;
  readonly base: string;
  readonly revision: string;
  readonly oasdiffBin: string;
}

export type ParseContractArgsResult =
  | { readonly ok: true; readonly args: ContractCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface ContractCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface OasdiffRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export type OasdiffRunner = (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}) => OasdiffRunResult;

export interface BreakingChange {
  readonly id: string;
  readonly text: string;
  readonly level: number;
  readonly operation: string;
  readonly path: string;
}

export function defaultBase(root: string): string {
  return join(root, BASELINE_RELATIVE);
}

export function defaultRevision(root: string): string {
  return join(root, REVISION_RELATIVE);
}

export function parseContractArgs(
  argv: readonly string[],
  defaultRoot: string,
): ParseContractArgsResult {
  let root = defaultRoot;
  let base: string | undefined;
  let revision: string | undefined;
  let oasdiffBin = 'oasdiff';

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue =
      flag === '--root' || flag === '--base' || flag === '--revision' || flag === '--oasdiff';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--root' ? 'directory' : 'path';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--base') base = value;
    if (flag === '--revision') revision = value;
    if (flag === '--oasdiff') oasdiffBin = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      base: base ?? defaultBase(root),
      revision: revision ?? defaultRevision(root),
      oasdiffBin,
    },
  };
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

export function collectThinningFiles(args: ContractCheckArgs): string[] {
  const dirs = new Set([args.root, dirname(args.base), dirname(args.revision)]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    for (const path of listThinningFiles(dir)) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out.sort();
}

export function buildOasdiffArgv(options: {
  readonly base: string;
  readonly revision: string;
}): string[] {
  return ['breaking', '--format', 'json', '--fail-on', 'ERR', options.base, options.revision];
}

export function defaultOasdiffRunner(options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}): OasdiffRunResult {
  const env = { ...process.env };
  delete env.OASDIFF_CONFIG;
  const result = spawnSync(options.bin, [...options.argv], {
    cwd: options.cwd,
    encoding: 'utf8',
    env,
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

function asLevel(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function parseBreakingChange(value: unknown): BreakingChange {
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error('oasdiff change is not an object');
  }
  return {
    id: asString(record['id']),
    text: asString(record['text']),
    level: asLevel(record['level']),
    operation: asString(record['operation']),
    path: asString(record['path']),
  };
}

export function parseOasdiffReport(raw: string): BreakingChange[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('oasdiff output was not JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('oasdiff output is not a changes array');
  }
  return parsed.map((item) => parseBreakingChange(item));
}

export function isErrChange(change: BreakingChange): boolean {
  return change.level >= ERR_LEVEL;
}

export function formatChange(change: BreakingChange): string {
  const id = change.id === '' ? 'unknown-check' : change.id;
  const op = change.operation === '' ? '' : `${change.operation} `;
  const path = change.path === '' ? '' : change.path;
  const where = `${op}${path}`.trim();
  return where === '' ? id : `${id} ${where}`;
}

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function fail(message: string): ContractCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

function requireSpecFile(
  path: string,
  role: 'baseline' | 'revision',
): ContractCheckOutput | undefined {
  if (!existsSync(path) || !statSync(path).isFile()) {
    return fail(`${role} spec is required: ${basename(path)} is absent or not a file`);
  }
  return undefined;
}

export function runContractCheck(
  args: ContractCheckArgs,
  runner: OasdiffRunner = defaultOasdiffRunner,
): ContractCheckOutput {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  const missingBase = requireSpecFile(args.base, 'baseline');
  if (missingBase !== undefined) return missingBase;
  const missingRevision = requireSpecFile(args.revision, 'revision');
  if (missingRevision !== undefined) return missingRevision;

  const thinning = collectThinningFiles(args);
  if (thinning.length > 0) {
    const listed = thinning.map((path) => `  ${path}`).join('\n');
    return fail(
      `oasdiff config must not override the default checks; thinning ignore files is G1.6 red\n${listed}`,
    );
  }

  const run = runner({
    bin: args.oasdiffBin,
    argv: buildOasdiffArgv({ base: args.base, revision: args.revision }),
    cwd: args.root,
  });

  if (run.error !== undefined && (spawnErrorCode(run.error) === 'ENOENT' || run.status === null)) {
    return fail('oasdiff is required: the binary is absent or not executable');
  }

  if (run.status !== 0 && run.status !== 1) {
    const detail = (run.stderr || run.stdout).trim() || 'no output';
    return fail(`oasdiff failed (${String(run.status)}): ${detail}`);
  }

  if (run.stdout.trim() === '') {
    return fail('oasdiff produced no JSON: a contract check that saw no engine output has not run');
  }

  try {
    const changes = parseOasdiffReport(run.stdout);
    const blocking = changes.filter((change) => isErrChange(change));
    if (blocking.length > 0) {
      const listed = blocking.map((change) => `  ${formatChange(change)}`).join('\n');
      return fail(`contract failed (${String(blocking.length)}):\n${listed}`);
    }
    const warnings = changes.length - blocking.length;
    return {
      ok: true,
      exitCode: 0,
      stdout: `contract passed (0 ERR, ${String(warnings)} WARN)\n`,
      stderr: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
