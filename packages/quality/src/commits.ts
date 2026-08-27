import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

/**
 * G1.9 (`docs/14-quality-gates.md` §2): Conventional Commits, and a requirement/defect id,
 * on the commits that would land. A prose subject fails. A Conventional header with no
 * tracker id (`D-20`, `G1.9`, `C5-01`, `#12`, …) fails. Merge commits are skipped so
 * absorbing `origin/main` is not a rewrite. History already on `main` is not rewritten —
 * the range is merge-base with `origin/main` (or `--base`) through `HEAD`.
 *
 * This module invokes git. A TypeScript comment that names Conventional Commits is not G1.9.
 * `feat: add a widget` is not G1.9 either: the gate text requires 需求/缺陷编号.
 *
 * Folded into `pnpm verify`: git is already on the path, the same way G1.10 has no extra
 * binary. G1.8 / G1.6 stay out because they install one.
 */

export const USAGE = 'usage: check-commits [--root <repo-root>] [--base <ref>] [--git <binary>]';

export const DEFAULT_BASE = 'origin/main';

export const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
] as const;

const TYPE_ALTERNATION = CONVENTIONAL_TYPES.join('|');

/** `type(scope)!: description` — type is lowercase; a space after the colon is required. */
export const CONVENTIONAL_SUBJECT = new RegExp(
  `^(${TYPE_ALTERNATION})(\\([a-zA-Z0-9._/-]+\\))?(!)?: .+`,
);

/**
 * Requirement / defect ids this repository actually uses, plus a GitHub `#n`.
 * `G1.9` in a scope and `D-20` in a footer both count. `v1.0` does not.
 */
export const TRACKER_RE =
  /\b(?:D-\d+|C\d+-\d+|G\d+\.\d+|INF-\d+|QA-\d+|PLY-\d+|PRG-\d+|SCR-\d+|APP-\d+|SRV-\d+|DAT-\d+|OBS-\d+|I18N-\d+|CTR-\d+|CNT-\d+|GOV-\d+|VER-\d+|PNL-\d+|T\d+(?:-\d+)?|X-\d+|GATE-\d+|Q-G-\d+)\b|#\d+\b/gi;

/** Subject NUL body RS — so a footer `Refs: D-20` is visible without rewriting `%s`. */
export const LOG_FORMAT = '%s%x00%b%x1e';

export interface CommitsCheckArgs {
  readonly root: string;
  readonly base: string;
  readonly gitBin: string;
}

export type ParseCommitsArgsResult =
  | { readonly ok: true; readonly args: CommitsCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface CommitsCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export type GitRunner = (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}) => GitRunResult;

export interface CommitSubject {
  readonly subject: string;
}

export interface CommitRecord {
  readonly subject: string;
  readonly body: string;
}

export type CommitHitKind = 'prose' | 'missing-id';

export function parseCommitsArgs(
  argv: readonly string[],
  defaultRoot: string,
): ParseCommitsArgsResult {
  let root = defaultRoot;
  let base = DEFAULT_BASE;
  let gitBin = 'git';

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue = flag === '--root' || flag === '--base' || flag === '--git';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--root' ? 'directory' : flag === '--git' ? 'path' : 'ref';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--base') base = value;
    if (flag === '--git') gitBin = value;
    index += 1;
  }

  return {
    ok: true,
    args: { root, base, gitBin },
  };
}

export function isConventionalSubject(subject: string): boolean {
  return CONVENTIONAL_SUBJECT.test(subject);
}

export function findTrackerIds(text: string): string[] {
  const pattern = new RegExp(TRACKER_RE.source, TRACKER_RE.flags);
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const token = match[0] ?? '';
    const key = token.toUpperCase();
    if (token !== '' && !seen.has(key)) {
      seen.add(key);
      found.push(token);
    }
  }
  return found;
}

export function hasTrackerId(subject: string, body: string): boolean {
  return findTrackerIds(`${subject}\n${body}`).length > 0;
}

export function parseGitSubjects(raw: string): string[] {
  return parseGitRecords(raw).map((record) => record.subject);
}

export function parseGitRecords(raw: string): CommitRecord[] {
  if (raw === '') return [];
  if (!raw.includes('\x1e') && !raw.includes('\x00')) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line !== '')
      .map((subject) => ({ subject, body: '' }));
  }
  const records: CommitRecord[] = [];
  for (const chunk of raw.split('\x1e')) {
    if (chunk === '' || chunk === '\n') continue;
    const trimmed = chunk.startsWith('\n') ? chunk.slice(1) : chunk;
    const nul = trimmed.indexOf('\x00');
    const subject = (nul === -1 ? trimmed : trimmed.slice(0, nul)).trimEnd();
    const body = nul === -1 ? '' : trimmed.slice(nul + 1);
    if (subject === '') continue;
    records.push({ subject, body });
  }
  return records;
}

export function formatViolation(subject: string): string {
  return subject;
}

export function formatHit(kind: CommitHitKind, subject: string): string {
  return `${kind} ${subject}`;
}

export function buildMergeBaseArgv(base: string): string[] {
  return ['merge-base', base, 'HEAD'];
}

export function buildRevParseArgv(base: string): string[] {
  return ['rev-parse', '--verify', '--quiet', base];
}

export function buildLogArgv(mergeBase: string): string[] {
  return ['log', '--no-merges', `--format=${LOG_FORMAT}`, `${mergeBase}..HEAD`];
}

export function defaultGitRunner(options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
}): GitRunResult {
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

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function fail(message: string): CommitsCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

function runGit(
  args: CommitsCheckArgs,
  argv: readonly string[],
  runner: GitRunner,
): GitRunResult | CommitsCheckOutput {
  const run = runner({ bin: args.gitBin, argv, cwd: args.root });
  if (run.error !== undefined && (spawnErrorCode(run.error) === 'ENOENT' || run.status === null)) {
    return fail('git is required: the binary is absent or not executable');
  }
  return run;
}

function isFail(result: GitRunResult | CommitsCheckOutput): result is CommitsCheckOutput {
  return 'exitCode' in result;
}

export function runCommitsCheck(
  args: CommitsCheckArgs,
  runner: GitRunner = defaultGitRunner,
): CommitsCheckOutput {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  const parsed = runGit(args, buildRevParseArgv(args.base), runner);
  if (isFail(parsed)) return parsed;
  if (parsed.status !== 0) {
    return fail(
      `base ref is required: ${args.base} is absent — a commit check that saw no history has not run`,
    );
  }

  const merged = runGit(args, buildMergeBaseArgv(args.base), runner);
  if (isFail(merged)) return merged;
  if (merged.status !== 0) {
    const detail = (merged.stderr || merged.stdout).trim() || 'no output';
    return fail(`git merge-base failed (${String(merged.status)}): ${detail}`);
  }

  const mergeBase = merged.stdout.trim();
  if (mergeBase === '') {
    return fail('git merge-base produced no SHA: a commit check that saw no history has not run');
  }

  const logged = runGit(args, buildLogArgv(mergeBase), runner);
  if (isFail(logged)) return logged;
  if (logged.status !== 0) {
    const detail = (logged.stderr || logged.stdout).trim() || 'no output';
    return fail(`git log failed (${String(logged.status)}): ${detail}`);
  }

  const records = parseGitRecords(logged.stdout);
  const hits: { readonly kind: CommitHitKind; readonly subject: string }[] = [];
  for (const record of records) {
    if (!isConventionalSubject(record.subject)) {
      hits.push({ kind: 'prose', subject: record.subject });
      continue;
    }
    if (!hasTrackerId(record.subject, record.body)) {
      hits.push({ kind: 'missing-id', subject: record.subject });
    }
  }
  if (hits.length > 0) {
    const listed = hits.map((hit) => `  ${formatHit(hit.kind, hit.subject)}`).join('\n');
    return fail(
      `commits failed (${String(hits.length)}): new commits that are not Conventional Commits with a requirement/defect id are G1.9 red\n${listed}`,
    );
  }

  return {
    ok: true,
    exitCode: 0,
    stdout: `commits passed (${String(records.length)} new commits vs ${args.base}, 0 prose, 0 missing-id)\n`,
    stderr: '',
  };
}
