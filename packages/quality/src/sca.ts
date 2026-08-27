import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * G2.5 (`docs/14-quality-gates.md` §4, `docs/03-stack-decision.md` D13): Trivy filesystem SCA
 * of the committed lockfile. Critical findings fail. High findings with a published fix older
 * than seven days fail. A missing binary, a missing lockfile, or a tree with no scan targets
 * fails — the same fail-open G2.8 closed for an absent pnpm store.
 *
 * This module invokes Trivy. A TypeScript grep of CVE ids is not G2.5.
 *
 * There is no container image in this repository. A Dockerfile (or sibling image tarball) is
 * therefore a subject the image half has not scanned: the check fails rather than reporting
 * "0 images" over a file it ignored.
 */

export const USAGE = 'usage: check-sca [--root <repo-root>] [--lockfile <path>] [--trivy <binary>]';

export const LOCKFILE_NAME = 'pnpm-lock.yaml';

/** G2.5: high with a fix is blocking once the finding is older than this. */
export const HIGH_FIX_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git']);

const LANGUAGE_PKG_TYPES = new Set(['pnpm', 'npm', 'yarn', 'node-pkg', 'bundler', 'cargo']);

export interface ScaCheckArgs {
  readonly root: string;
  readonly lockfile: string;
  readonly trivyBin: string;
}

export type ParseScaArgsResult =
  | { readonly ok: true; readonly args: ScaCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface ScaCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface TrivyRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export type TrivyRunner = (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}) => TrivyRunResult;

export interface ScaVulnerability {
  readonly id: string;
  readonly pkgName: string;
  readonly installedVersion: string;
  readonly fixedVersion: string;
  readonly severity: string;
  readonly publishedAtMs: number | undefined;
  readonly target: string;
}

export function defaultLockfile(root: string): string {
  return join(root, LOCKFILE_NAME);
}

export function parseScaArgs(argv: readonly string[], defaultRoot: string): ParseScaArgsResult {
  let root = defaultRoot;
  let lockfile: string | undefined;
  let trivyBin = 'trivy';

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue = flag === '--root' || flag === '--lockfile' || flag === '--trivy';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--trivy' || flag === '--lockfile' ? 'path' : 'directory';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--lockfile') lockfile = value;
    if (flag === '--trivy') trivyBin = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      lockfile: lockfile ?? defaultLockfile(root),
      trivyBin,
    },
  };
}

export function isDockerfileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower.endsWith('.dockerfile');
}

export function isImageTarballName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.oci.tar');
}

export function listImageSubjects(root: string): string[] {
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
      if (isDockerfileName(entry.name) || isImageTarballName(entry.name)) out.push(full);
    }
  }

  return out.sort();
}

export function buildTrivyArgv(options: { readonly lockfile: string }): string[] {
  return [
    'fs',
    '--format',
    'json',
    '--scanners',
    'vuln',
    '--quiet',
    '--skip-dirs',
    'node_modules',
    '--skip-dirs',
    'dist',
    '--skip-dirs',
    'coverage',
    options.lockfile,
  ];
}

export function defaultTrivyRunner(options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}): TrivyRunResult {
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

function parsePublishedAtMs(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

export function parseTrivyVulnerability(value: unknown, target: string): ScaVulnerability {
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error('trivy vulnerability is not an object');
  }
  return {
    id: asString(record['VulnerabilityID']),
    pkgName: asString(record['PkgName']),
    installedVersion: asString(record['InstalledVersion']),
    fixedVersion: asString(record['FixedVersion']),
    severity: asString(record['Severity']),
    publishedAtMs:
      parsePublishedAtMs(asString(record['PublishedDate'])) ??
      parsePublishedAtMs(asString(record['LastModifiedDate'])),
    target,
  };
}

export function parseTrivyResults(raw: string): {
  readonly targets: string[];
  readonly vulns: ScaVulnerability[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('trivy output was not JSON');
  }
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new Error('trivy output is not an object');
  }
  const results = record['Results'];
  if (!Array.isArray(results)) {
    throw new Error('trivy output is missing Results');
  }

  const targets: string[] = [];
  const vulns: ScaVulnerability[] = [];

  for (const entry of results) {
    const result = asRecord(entry);
    if (result === undefined) {
      throw new Error('trivy result is not an object');
    }
    const target = asString(result['Target']);
    const type = asString(result['Type']).toLowerCase();
    const className = asString(result['Class']);
    const isLanguagePkg = className === 'lang-pkgs' || LANGUAGE_PKG_TYPES.has(type);
    if (isLanguagePkg && target !== '') {
      targets.push(target);
    }
    const listed = result['Vulnerabilities'];
    if (listed === undefined || listed === null) continue;
    if (!Array.isArray(listed)) {
      throw new Error('trivy Vulnerabilities is not an array');
    }
    for (const item of listed) {
      vulns.push(parseTrivyVulnerability(item, target));
    }
  }

  return { targets, vulns };
}

export function isBlockingVulnerability(
  vuln: ScaVulnerability,
  nowMs: number,
  graceMs: number = HIGH_FIX_GRACE_MS,
): boolean {
  const severity = vuln.severity.toUpperCase();
  if (severity === 'CRITICAL') return true;
  if (severity !== 'HIGH') return false;
  if (vuln.fixedVersion.trim() === '') return false;
  if (vuln.publishedAtMs === undefined) return true;
  return nowMs - vuln.publishedAtMs > graceMs;
}

export function formatVulnerability(vuln: ScaVulnerability): string {
  const pkg =
    vuln.installedVersion === '' ? vuln.pkgName : `${vuln.pkgName}@${vuln.installedVersion}`;
  const fix = vuln.fixedVersion === '' ? 'unfixed' : `fixed ${vuln.fixedVersion}`;
  return `${vuln.id} ${pkg} ${vuln.severity} (${fix}) ${vuln.target}`;
}

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function fail(message: string): ScaCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

export function runScaCheck(
  args: ScaCheckArgs,
  runner: TrivyRunner = defaultTrivyRunner,
  nowMs: number = Date.now(),
): ScaCheckOutput {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  if (!existsSync(args.lockfile) || !statSync(args.lockfile).isFile()) {
    return fail(
      `lockfile is required: ${basename(args.lockfile)} is absent — a SCA check that saw no packages has not run`,
    );
  }

  const imageSubjects = listImageSubjects(args.root);
  if (imageSubjects.length > 0) {
    const listed = imageSubjects.map((path) => `  ${path}`).join('\n');
    return fail(`container image scan has not run: Dockerfile or image tarball present\n${listed}`);
  }

  const run = runner({
    bin: args.trivyBin,
    argv: buildTrivyArgv({ lockfile: args.lockfile }),
    cwd: args.root,
  });

  if (run.error !== undefined && (spawnErrorCode(run.error) === 'ENOENT' || run.status === null)) {
    return fail('trivy is required: the binary is absent or not executable');
  }

  if (run.status !== 0 && run.status !== 1) {
    const detail = (run.stderr || run.stdout).trim() || 'no output';
    return fail(`trivy failed (${String(run.status)}): ${detail}`);
  }

  if (run.stdout.trim() === '') {
    return fail('trivy produced no JSON: a SCA check that saw no engine output has not run');
  }

  try {
    const evaluated = parseTrivyResults(run.stdout);
    if (evaluated.targets.length === 0) {
      return fail(
        'trivy reported no language-package targets: a SCA check that saw no packages has not run',
      );
    }
    const blocking = evaluated.vulns.filter((vuln) => isBlockingVulnerability(vuln, nowMs));
    if (blocking.length > 0) {
      const listed = blocking.map((vuln) => `  ${formatVulnerability(vuln)}`).join('\n');
      return fail(`sca failed (${String(blocking.length)}):\n${listed}`);
    }
    const nonBlocking = evaluated.vulns.length;
    return {
      ok: true,
      exitCode: 0,
      stdout:
        `sca passed (${String(evaluated.targets.length)} targets, 0 images, ` +
        `${String(nonBlocking)} non-blocking findings)\n`,
      stderr: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
