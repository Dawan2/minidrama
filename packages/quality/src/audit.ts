import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

/**
 * INF-004 (`docs/plan/definition-of-done.md` §7.1 S-C1 / S-C2): CI self-audit of
 * committed GitHub workflow files. A `continue-on-error: true` key, an `if: false`
 * job/step, `allow_failure: true`, or a `|| true` swallowed exit in a `run` line
 * fails. A comment that forbids those is not this gate. A tree with no workflow
 * files fails — the same fail-open G1.10 uses when it saw no tests.
 *
 * Smallest slice: S-C1 plus the named `if: false` reverse path from INF-004.
 * S-C3 echo-only steps, S-C4 required-checks vs branch protection, and a job-count
 * ratchet against a previous release are further slices. `workflow_dispatch:` as an
 * event is not a bypass (C4-01); do not fail on it.
 *
 * Folded into `pnpm verify`: there is no extra binary. L1 CI also runs it as a
 * named step so a missing check cannot hide behind the verify script.
 *
 * Needles are built in pieces so this file is not itself a workflow hit.
 */

export const USAGE = 'usage: check-audit [--root <repo-root>] [--source <path>]';

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git']);

export function marker(parts: readonly string[]): string {
  return parts.join('');
}

export const CONTINUE_ON_ERROR_KEY = marker(['continue', '-', 'on', '-', 'error']);
export const ALLOW_FAILURE_KEY = marker(['allow', '_', 'failure']);
export const SOFT_FAIL_KEY = marker(['soft', '_', 'fail']);
export const IF_KEY = 'if';
export const OR_TRUE = marker(['|', '|', ' true']);

export interface AuditCheckArgs {
  readonly root: string;
  readonly source: string;
}

export type ParseAuditArgsResult =
  | { readonly ok: true; readonly args: AuditCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface AuditCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type AuditHitKind =
  'continue-on-error' | 'allow-failure' | 'soft-fail' | 'if-false' | 'or-true';

export interface AuditHit {
  readonly file: string;
  readonly line: number;
  readonly kind: AuditHitKind;
  readonly excerpt: string;
}

export function defaultSource(root: string): string {
  return join(root, '.github', 'workflows');
}

export function parseAuditArgs(argv: readonly string[], defaultRoot: string): ParseAuditArgsResult {
  let root = defaultRoot;
  let source: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue = flag === '--root' || flag === '--source';
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
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      source: source ?? defaultSource(root),
    },
  };
}

export function isWorkflowFileName(name: string): boolean {
  return /\.ya?ml$/i.test(name);
}

export function listWorkflowFiles(source: string): string[] {
  const out: string[] = [];
  const stack = [source];

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
      if (isWorkflowFileName(entry.name)) out.push(full);
    }
  }

  return out.sort();
}

export function lineOf(text: string, index: number): number {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function excerptAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  const line = text.slice(start, end === -1 ? text.length : end).trim();
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

/**
 * Drop a full-line YAML comment. Inline ` # …` after a value is stripped so a
 * trailing note cannot hide a key, and a comment that *names* a forbidden key
 * is not itself a hit.
 */
export function codePortion(raw: string): string {
  const trimmedStart = raw.trimStart();
  if (trimmedStart.startsWith('#')) return '';

  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? '';
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '#') {
      const prev = i === 0 ? ' ' : (raw[i - 1] ?? '');
      if (prev === ' ' || prev === '\t') return raw.slice(0, i);
    }
  }
  return raw;
}

function isTruthyYaml(value: string): boolean {
  return /^(true|yes|on|1)$/i.test(value);
}

function isFalseYaml(value: string): boolean {
  return /^false$/i.test(value);
}

const KEY_LINE = /^(\s*)([A-Za-z0-9_-]+)\s*:\s*(?:['"]([^'"]*)['"]|(\S+))?\s*$/;

export function scanWorkflowText(text: string, file: string): AuditHit[] {
  const hits: AuditHit[] = [];
  const lines = text.split('\n');
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex] ?? '';
    const code = codePortion(raw);
    const match = KEY_LINE.exec(code.trimEnd());
    if (match) {
      const key = match[2] ?? '';
      const value = (match[3] ?? match[4] ?? '').trim();
      const kind =
        key === CONTINUE_ON_ERROR_KEY && isTruthyYaml(value)
          ? 'continue-on-error'
          : key === ALLOW_FAILURE_KEY && isTruthyYaml(value)
            ? 'allow-failure'
            : key === SOFT_FAIL_KEY && isTruthyYaml(value)
              ? 'soft-fail'
              : key === IF_KEY && isFalseYaml(value)
                ? 'if-false'
                : null;
      if (kind !== null) {
        hits.push({
          file,
          line: lineIndex + 1,
          kind,
          excerpt: excerptAt(text, offset + (raw.length - raw.trimStart().length)),
        });
      }
    }

    const orMatch = /\|\|\s*true\b/.exec(code);
    if (orMatch && orMatch.index !== undefined) {
      hits.push({
        file,
        line: lineIndex + 1,
        kind: 'or-true',
        excerpt: excerptAt(text, offset + orMatch.index),
      });
    }

    offset += raw.length + 1;
  }

  return hits;
}

export function formatHit(hit: AuditHit): string {
  const where = hit.line > 0 ? `${hit.file}:${String(hit.line)}` : hit.file;
  return `${hit.kind} ${where} ${hit.excerpt}`;
}

function fail(message: string): AuditCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

export function toRepoFile(abs: string, root: string): string {
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..')) return abs;
  return rel.split('\\').join('/');
}

export function runAuditCheck(args: AuditCheckArgs): AuditCheckOutput {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  if (!existsSync(args.source) || !statSync(args.source).isDirectory()) {
    return fail(`scan source is required: ${basename(args.source)} is absent or not a directory`);
  }

  const files = listWorkflowFiles(args.source);
  if (files.length === 0) {
    return fail(
      'scan source has no workflow files: a CI self-audit that saw no workflows has not run',
    );
  }

  const hits: AuditHit[] = [];
  for (const abs of files) {
    const file = toRepoFile(abs, args.root);
    const text = readFileSync(abs, 'utf8');
    hits.push(...scanWorkflowText(text, file));
  }

  if (hits.length > 0) {
    const listed = hits.map((hit) => `  ${formatHit(hit)}`).join('\n');
    return fail(
      `audit failed (${String(hits.length)}): continue-on-error / if: false / swallowed exits are INF-004 red\n${listed}`,
    );
  }

  return {
    ok: true,
    exitCode: 0,
    stdout: `audit passed (${String(files.length)} workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits)\n`,
    stderr: '',
  };
}
