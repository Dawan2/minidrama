import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

/**
 * G1.10 (`docs/14-quality-gates.md` §2 / §4.6 / §4.7): skip / focused / empty-test detection.
 * A committed skip marker or an empty `it('…', () => {})` fails. A missing tree or a scan
 * that saw no test files fails — the same fail-open G2.8 closed for an absent pnpm store.
 *
 * This module is the gate. A comment that says "we do not skip" is not G1.10. R3 / §6: skip
 * exemptions do not apply, so a `SKIP(#n, expires=…)` annotation is still red.
 *
 * Folded into `pnpm verify` on purpose: there is no extra binary. L1 CI also runs it as a
 * named step so a missing check cannot hide behind the verify script.
 *
 * Needles are built in pieces so this file is not itself a hit.
 */

export const USAGE = 'usage: check-skips [--root <repo-root>] [--source <path>]';

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'playwright-report',
  'test-results',
]);

export function marker(parts: readonly string[]): string {
  return parts.join('');
}

export const SKIP_CALL = marker(['.', 'skip', '(']);
export const SKIP_IF_CALL = marker(['.', 'skipIf', '(']);
export const ONLY_CALL = marker(['.', 'only', '(']);
export const IT_TODO = marker(['it', '.', 'todo']);
export const TEST_TODO = marker(['test', '.', 'todo']);
export const XIT_CALL = marker(['xit', '(']);
export const XDESCRIBE_CALL = marker(['xdescribe', '(']);
export const XTEST_CALL = marker(['xtest', '(']);

export interface SkipCheckArgs {
  readonly root: string;
  readonly source: string;
}

export type ParseSkipArgsResult =
  | { readonly ok: true; readonly args: SkipCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface SkipCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type SkipHitKind = 'skip' | 'only' | 'todo' | 'empty';

export interface SkipHit {
  readonly file: string;
  readonly line: number;
  readonly kind: SkipHitKind;
  readonly excerpt: string;
}

export function defaultSource(root: string): string {
  return root;
}

export function emptyItFixture(name: string): string {
  return marker(['it(', JSON.stringify(name), ', ', '() => {', '}']);
}

export function parseSkipArgs(argv: readonly string[], defaultRoot: string): ParseSkipArgsResult {
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

export function isTestFileName(name: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name);
}

export function listTestFiles(source: string): string[] {
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
      if (isTestFileName(entry.name)) out.push(full);
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

function kindForToken(token: string): SkipHitKind {
  if (token === ONLY_CALL) return 'only';
  if (token === IT_TODO || token === TEST_TODO) return 'todo';
  return 'skip';
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/** Letter-starting needles (`xit(`, `it.todo`) must not match inside `exit(` / `wait.todo`. */
function tokenNeedsBoundary(token: string): boolean {
  const first = token[0];
  return first !== undefined && /[A-Za-z]/.test(first);
}

function indexOfToken(line: string, token: string, from: number): number {
  let at = line.indexOf(token, from);
  while (at !== -1) {
    if (!tokenNeedsBoundary(token) || !isWordChar(at === 0 ? undefined : line[at - 1])) {
      return at;
    }
    at = line.indexOf(token, at + 1);
  }
  return -1;
}

/**
 * Replace string / template literal contents with spaces so a fixture that *writes*
 * an empty `it()` is not itself an empty test. Newlines are kept so line numbers hold.
 */
export function maskStringLiterals(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out.push(ch);
      i += 1;
      while (i < text.length) {
        const next = text[i] ?? '';
        if (next === '\\') {
          const escaped = text[i + 1];
          out.push(' ');
          out.push(escaped === '\n' ? '\n' : ' ');
          i += escaped === undefined ? 1 : 2;
          continue;
        }
        if (next === quote) {
          out.push(next);
          i += 1;
          break;
        }
        out.push(next === '\n' ? '\n' : ' ');
        i += 1;
      }
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

export function scanSkipTokens(text: string, file: string): SkipHit[] {
  const hits: SkipHit[] = [];
  const tokens = [
    SKIP_CALL,
    SKIP_IF_CALL,
    ONLY_CALL,
    IT_TODO,
    TEST_TODO,
    XIT_CALL,
    XDESCRIBE_CALL,
    XTEST_CALL,
  ];

  const lines = text.split('\n');
  let offset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex] ?? '';
    for (const token of tokens) {
      let from = 0;
      while (from < raw.length) {
        const at = indexOfToken(raw, token, from);
        if (at === -1) break;
        hits.push({
          file,
          line: lineIndex + 1,
          kind: kindForToken(token),
          excerpt: excerptAt(text, offset + at),
        });
        from = at + token.length;
      }
    }
    offset += raw.length + 1;
  }
  return hits;
}

const EMPTY_IT_RE =
  /\b(?:it|test|describe|xit|xtest|xdescribe)(?:\.(?:skip|only|todo|skipIf|runIf))?\s*\(\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_][\w]*)\s*=>\s*\{\s*\}/g;

const EMPTY_FN_RE =
  /\b(?:it|test|describe|xit|xtest|xdescribe)(?:\.(?:skip|only|todo|skipIf|runIf))?\s*\(\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*(?:async\s+)?function\s*\([^)]*\)\s*\{\s*\}/g;

export function scanEmptyTests(text: string, file: string): SkipHit[] {
  const masked = maskStringLiterals(text);
  const hits: SkipHit[] = [];
  for (const pattern of [EMPTY_IT_RE, EMPTY_FN_RE]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(masked);
    while (match !== null) {
      hits.push({
        file,
        line: lineOf(text, match.index),
        kind: 'empty',
        excerpt: excerptAt(text, match.index),
      });
      match = pattern.exec(masked);
    }
  }
  return hits;
}

export function scanTestFile(text: string, file: string): SkipHit[] {
  return [...scanSkipTokens(text, file), ...scanEmptyTests(text, file)];
}

export function formatHit(hit: SkipHit): string {
  const where = hit.line > 0 ? `${hit.file}:${String(hit.line)}` : hit.file;
  return `${hit.kind} ${where} ${hit.excerpt}`;
}

function fail(message: string): SkipCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

export function toRepoFile(abs: string, root: string): string {
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..')) return abs;
  return rel.split('\\').join('/');
}

export function runSkipCheck(args: SkipCheckArgs): SkipCheckOutput {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  if (!existsSync(args.source) || !statSync(args.source).isDirectory()) {
    return fail(`scan source is required: ${basename(args.source)} is absent or not a directory`);
  }

  const files = listTestFiles(args.source);
  if (files.length === 0) {
    return fail('scan source has no test files: a skip check that saw no tests has not run');
  }

  const hits: SkipHit[] = [];
  for (const abs of files) {
    const file = toRepoFile(abs, args.root);
    const text = readFileSync(abs, 'utf8');
    hits.push(...scanTestFile(text, file));
  }

  const skipCount = hits.filter((hit) => hit.kind !== 'empty').length;
  const emptyCount = hits.filter((hit) => hit.kind === 'empty').length;

  if (hits.length > 0) {
    const listed = hits.map((hit) => `  ${formatHit(hit)}`).join('\n');
    return fail(
      `skip-check failed (${String(hits.length)}): committed skip/only/todo/empty tests are G1.10 red\n${listed}`,
    );
  }

  return {
    ok: true,
    exitCode: 0,
    stdout: `skip-check passed (${String(files.length)} test files, ${String(skipCount)} skips, ${String(emptyCount)} empty)\n`,
    stderr: '',
  };
}
