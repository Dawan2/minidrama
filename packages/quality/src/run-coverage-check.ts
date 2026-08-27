import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DEFAULT_REPORTS,
  evaluateCoverage,
  parseIstanbulReport,
  parseThresholds,
  parseUnifiedDiff,
} from './coverage.js';
import type { CoverageFloors, DiffFile, FileHits, GateResult } from './coverage.js';

export const USAGE =
  'usage: check-coverage [--root <repo-root>] [--report <coverage-final.json>]... ' +
  '[--thresholds <file>] [--previous-thresholds <file>] [--diff <unified-diff>] [--base <git-ref>]';

export interface CoverageCheckArgs {
  readonly root: string;
  readonly reports: readonly string[];
  readonly thresholdsPath: string;
  readonly previousPath: string | undefined;
  readonly diffPath: string | undefined;
  readonly base: string | undefined;
}

type ParseResult =
  | { readonly ok: true; readonly args: CoverageCheckArgs }
  | { readonly ok: false; readonly message: string };

export function parseCoverageArgs(argv: readonly string[], defaultRoot: string): ParseResult {
  let root = defaultRoot;
  const reports: string[] = [];
  let thresholdsPath: string | undefined;
  let previousPath: string | undefined;
  let diffPath: string | undefined;
  let base: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const value = argv[index + 1];
    const needsValue =
      flag === '--root' ||
      flag === '--report' ||
      flag === '--thresholds' ||
      flag === '--previous-thresholds' ||
      flag === '--diff' ||
      flag === '--base';

    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, message: `${flag} requires a value` };
    }

    if (flag === '--root') root = value;
    if (flag === '--report') reports.push(value);
    if (flag === '--thresholds') thresholdsPath = value;
    if (flag === '--previous-thresholds') previousPath = value;
    if (flag === '--diff') diffPath = value;
    if (flag === '--base') base = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      reports,
      thresholdsPath: thresholdsPath ?? join(root, 'packages/quality/coverage-thresholds.json'),
      previousPath,
      diffPath,
      base,
    },
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function gitDiff(root: string, base: string): string {
  const result = spawnSync('git', ['diff', '-U0', `${base}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `git diff ${base}...HEAD failed: ${(result.stderr || result.stdout || 'no output').trim()}`,
    );
  }
  return result.stdout;
}

export function resolveCoverageBase(root: string, explicit: string | undefined): string {
  if (explicit !== undefined) return explicit;

  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const main = spawnSync('git', ['rev-parse', 'origin/main'], { cwd: root, encoding: 'utf8' });
  if (head.status === 0 && main.status === 0 && head.stdout.trim() === main.stdout.trim()) {
    return 'HEAD~1';
  }
  return 'origin/main';
}

export function loadCoverageReports(root: string, reportArgs: readonly string[]): FileHits[] {
  const paths = reportArgs.length > 0 ? reportArgs : DEFAULT_REPORTS.map((rel) => join(root, rel));
  const files: FileHits[] = [];
  const missing: string[] = [];

  for (const path of paths) {
    if (!existsSync(path)) {
      missing.push(path);
      continue;
    }
    files.push(...parseIstanbulReport(readJson(path), root));
  }

  if (missing.length > 0) {
    throw new Error(
      `coverage reports are required and missing:\n${missing.map((path) => `  ${path}`).join('\n')}`,
    );
  }
  if (files.length === 0) {
    throw new Error('coverage reports contained no files');
  }
  return files;
}

function loadDiff(
  root: string,
  diffPath: string | undefined,
  base: string | undefined,
): DiffFile[] {
  if (diffPath !== undefined) {
    return parseUnifiedDiff(readFileSync(diffPath, 'utf8'));
  }
  return parseUnifiedDiff(gitDiff(root, resolveCoverageBase(root, base)));
}

function loadPrevious(path: string | undefined): CoverageFloors | undefined {
  if (path === undefined || !existsSync(path)) return undefined;
  return parseThresholds(readJson(path));
}

function loadPreviousFromGit(
  root: string,
  explicitBase: string | undefined,
): CoverageFloors | undefined {
  const base = resolveCoverageBase(root, explicitBase);
  const result = spawnSync('git', ['show', `${base}:packages/quality/coverage-thresholds.json`], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return undefined;
  return parseThresholds(JSON.parse(result.stdout) as unknown);
}

export interface CoverageCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly result?: GateResult;
}

export function runCoverageCheck(args: CoverageCheckArgs): CoverageCheckOutput {
  try {
    const floors = parseThresholds(readJson(args.thresholdsPath));
    const previous = loadPrevious(args.previousPath) ?? loadPreviousFromGit(args.root, args.base);
    const files = loadCoverageReports(args.root, args.reports);
    const diff = loadDiff(args.root, args.diffPath, args.base);
    const result = evaluateCoverage({ files, floors, diff, previous });

    const stdout =
      `coverage global lines ${result.global.lines.pct.toFixed(2)}% ` +
      `(${String(result.global.lines.covered)}/${String(result.global.lines.total)}), ` +
      `branches ${result.global.branches.pct.toFixed(2)}%, ` +
      `core lines ${result.core.lines.pct.toFixed(2)}%, ` +
      `diff lines ${result.diff.pct.toFixed(2)}% ` +
      `(${String(result.diff.covered)}/${String(result.diff.total)})\n` +
      (result.ok ? 'coverage gate passed\n' : '');

    if (!result.ok) {
      const stderr =
        `coverage gate failed (${String(result.violations.length)}):\n` +
        result.violations.map((violation) => `  ${violation}\n`).join('');
      return { ok: false, exitCode: 1, stdout, stderr, result };
    }

    return { ok: true, exitCode: 0, stdout, stderr: '', result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
  }
}
