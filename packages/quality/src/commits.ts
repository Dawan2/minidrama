import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

/**
 * G1.9 (`docs/14-quality-gates.md` §2): Conventional Commits, and a requirement/defect id.
 * A prose subject on `origin/main..HEAD` fails. A Conventional header with no tracker id
 * fails. A missing git binary or a missing base ref fails — the same fail-open G2.8 closed
 * for an absent pnpm store.
 *
 * This module is the gate. A comment that says "we use Conventional Commits" is not G1.9.
 * History already on `main` is not rewritten: the range is new commits only. An empty
 * range is 0 new commits, not a skip. Merge commits (two parents) are how `main` is
 * absorbed onto a work branch; their subjects stay prose and are not a hit.
 *
 * Folded into `pnpm verify` on purpose: git is already required to have a checkout. L1 CI
 * also runs it as a named step so a missing check cannot hide behind the verify script.
 */

export const USAGE =
  'usage: check-commits [--root <repo-root>] [--from <ref>] [--to <ref>] [--git <binary>]';

export const DEFAULT_FROM = 'origin/main';
export const DEFAULT_TO = 'HEAD';

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

export type ConventionalType = (typeof CONVENTIONAL_TYPES)[number];

/** `%H %P %s %b` with NUL field separators and RS record separators. */
export const LOG_FORMAT = '%H%x00%P%x00%s%x00%b%x1e';

/**
 * Requirement / defect ids this repository actually uses, plus a GitHub `#n`.
 * `G1.9` in a scope and `D-20` in a footer both count. `v1.0` does not.
 */
export const TRACKER_RE =
  /\b(?:D-\d+|C\d+-\d+|G\d+\.\d+|INF-\d+|QA-\d+|PLY-\d+|PRG-\d+|SCR-\d+|APP-\d+|SRV-\d+|DAT-\d+|OBS-\d+|I18N-\d+|CTR-\d+|CNT-\d+|GOV-\d+|VER-\d+|PNL-\d+|T\d+(?:-\d+)?|X-\d+|GATE-\d+|Q-G-\d+)\b|#\d+\b/gi;

const HEADER_RE = new RegExp(
  `^(${CONVENTIONAL_TYPES.join('|')})(?:\\(([A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]|[A-Za-z0-9])\\))?(!)?: (.+)$`,
);

export interface CommitCheckArgs {
  readonly root: string;
  readonly from: string;
  readonly to: string;
  readonly gitBin: string;
}

export type ParseCommitArgsResult =
  | { readonly ok: true; readonly args: CommitCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface CommitCheckOutput {
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

export interface GitCommit {
  readonly hash: string;
  readonly parents: readonly string[];
  readonly subject: string;
  readonly body: string;
}

export type CommitHitKind = 'prose' | 'missing-id' | 'empty';

export interface CommitHit {
  readonly hash: string;
  readonly kind: CommitHitKind;
  readonly subject: string;
}

export interface ConventionalHeader {
  readonly type: ConventionalType;
  readonly scope?: string;
  readonly breaking: boolean;
  readonly description: string;
}

export type CommitVerdict =
  | { readonly ok: true; readonly kind: 'conventional' | 'merge' }
  | { readonly ok: false; readonly kind: CommitHitKind };

export function parseCommitArgs(
  argv: readonly string[],
  defaultRoot: string,
): ParseCommitArgsResult {
  let root = defaultRoot;
  let from = DEFAULT_FROM;
  let to = DEFAULT_TO;
  let gitBin = 'git';

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue =
      flag === '--root' || flag === '--from' || flag === '--to' || flag === '--git';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--root' ? 'directory' : flag === '--git' ? 'path' : 'ref';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--from') from = value;
    if (flag === '--to') to = value;
    if (flag === '--git') gitBin = value;
    index += 1;
  }

  return { ok: true, args: { root, from, to, gitBin } };
}

export function buildLogArgv(from: string, to: string): string[] {
  return ['log', '--reverse', `--format=${LOG_FORMAT}`, `${from}..${to}`];
}

export function buildRevParseArgv(ref: string): string[] {
  return ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`];
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

export function isConventionalType(value: string): value is ConventionalType {
  return (CONVENTIONAL_TYPES as readonly string[]).includes(value);
}

export function parseConventionalHeader(subject: string): ConventionalHeader | undefined {
  const match = HEADER_RE.exec(subject);
  if (match === null) return undefined;
  const type = match[1] ?? '';
  if (!isConventionalType(type)) return undefined;
  const scope = match[2];
  const breaking = match[3] === '!';
  const description = match[4] ?? '';
  if (description.trim() === '') return undefined;
  return {
    type,
    ...(scope === undefined ? {} : { scope }),
    breaking,
    description,
  };
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

export function evaluateCommit(commit: {
  readonly parents: readonly string[];
  readonly subject: string;
  readonly body: string;
}): CommitVerdict {
  if (commit.parents.length > 1) {
    return { ok: true, kind: 'merge' };
  }
  if (commit.subject.trim() === '') {
    return { ok: false, kind: 'empty' };
  }
  const header = parseConventionalHeader(commit.subject);
  if (header === undefined) {
    return { ok: false, kind: 'prose' };
  }
  const tracked = findTrackerIds(`${commit.subject}\n${commit.body}`);
  if (tracked.length === 0) {
    return { ok: false, kind: 'missing-id' };
  }
  return { ok: true, kind: 'conventional' };
}

export function shortHash(hash: string): string {
  return hash.length <= 7 ? hash : hash.slice(0, 7);
}

export function formatHit(hit: CommitHit): string {
  const subject = hit.subject.trim() === '' ? '(empty subject)' : hit.subject;
  return `${hit.kind} ${shortHash(hit.hash)} ${subject}`;
}

export type ParseLogResult =
  | { readonly ok: true; readonly commits: readonly GitCommit[] }
  | { readonly ok: false; readonly message: string };

export function parseLog(stdout: string): ParseLogResult {
  if (stdout === '') {
    return { ok: true, commits: [] };
  }
  const records = stdout.split('\x1e');
  const commits: GitCommit[] = [];
  for (const record of records) {
    if (record === '' || record === '\n') continue;
    const trimmed = record.startsWith('\n') ? record.slice(1) : record;
    const fields = trimmed.split('\x00');
    if (fields.length < 3) {
      return {
        ok: false,
        message: 'git log produced a malformed commit record: G1.9 will not invent a subject',
      };
    }
    const hash = fields[0] ?? '';
    const parentsRaw = fields[1] ?? '';
    const subject = fields[2] ?? '';
    const body = fields.slice(3).join('\x00');
    if (hash === '') {
      return {
        ok: false,
        message: 'git log produced a malformed commit record: G1.9 will not invent a subject',
      };
    }
    const parents = parentsRaw === '' ? [] : parentsRaw.split(' ').filter((item) => item !== '');
    commits.push({ hash, parents, subject, body });
  }
  return { ok: true, commits };
}

function fail(message: string): CommitCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function isAbsentBinary(run: GitRunResult): boolean {
  if (run.error !== undefined && spawnErrorCode(run.error) === 'ENOENT') return true;
  return run.error !== undefined && run.status === null;
}

function git(args: CommitCheckArgs, runner: GitRunner, argv: readonly string[]): GitRunResult {
  return runner({ bin: args.gitBin, argv, cwd: args.root });
}

function refExists(args: CommitCheckArgs, runner: GitRunner, ref: string): boolean {
  const run = git(args, runner, buildRevParseArgv(ref));
  return run.status === 0;
}

export function runCommitCheck(
  args: CommitCheckArgs,
  runner: GitRunner = defaultGitRunner,
): CommitCheckOutput {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  const version = git(args, runner, ['--version']);
  if (isAbsentBinary(version) || version.status !== 0) {
    return fail('git is required: the binary is absent or not executable');
  }

  const gitDir = git(args, runner, ['rev-parse', '--git-dir']);
  if (gitDir.status !== 0) {
    const detail = (gitDir.stderr || gitDir.stdout).trim() || 'not a git repository';
    return fail(`scan root is not a git repository: ${detail}`);
  }

  if (!refExists(args, runner, args.to)) {
    return fail(`commit-check range to is required: ${args.to} is absent`);
  }

  if (!refExists(args, runner, args.from)) {
    return fail(
      `commit-check base is required: ${args.from} is absent — G1.9 does not rewrite history and will not invent a range`,
    );
  }

  const log = git(args, runner, buildLogArgv(args.from, args.to));
  if (isAbsentBinary(log)) {
    return fail('git is required: the binary is absent or not executable');
  }
  if (log.status !== 0) {
    const detail = (log.stderr || log.stdout).trim() || 'no output';
    return fail(`git log failed (${String(log.status)}): ${detail}`);
  }

  const parsed = parseLog(log.stdout);
  if (!parsed.ok) {
    return fail(parsed.message);
  }

  const commits = parsed.commits;
  if (commits.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      stdout: `commit-check passed (0 new commits vs ${args.from}): G1.9 does not rewrite history\n`,
      stderr: '',
    };
  }

  const hits: CommitHit[] = [];
  let mergeCount = 0;
  for (const commit of commits) {
    const verdict = evaluateCommit(commit);
    if (verdict.ok && verdict.kind === 'merge') {
      mergeCount += 1;
      continue;
    }
    if (!verdict.ok) {
      hits.push({ hash: commit.hash, kind: verdict.kind, subject: commit.subject });
    }
  }

  if (hits.length > 0) {
    const listed = hits.map((hit) => `  ${formatHit(hit)}`).join('\n');
    return fail(
      `commit-check failed (${String(hits.length)}): new commits that are not Conventional Commits with a requirement/defect id are G1.9 red\n${listed}`,
    );
  }

  return {
    ok: true,
    exitCode: 0,
    stdout: `commit-check passed (${String(commits.length)} new commits, 0 prose, ${String(mergeCount)} merge)\n`,
    stderr: '',
  };
}
