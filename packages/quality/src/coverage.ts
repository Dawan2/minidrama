import { posix } from 'node:path';

/**
 * G1.5 — coverage floors from `docs/14-quality-gates.md` §3.1, plus the ratchet in §3.4 / R4.
 *
 * The numbers in `coverage-thresholds.json` are the live floors. They may rise. They may not fall
 * below the documented starting values, and they may not fall below the copy on the comparison
 * base. A coverage number with no failing fixture is the D-01 shape; the tests in this package
 * are that fixture.
 */

export const DOCUMENTED_FLOORS = {
  diffLinePct: 80,
  globalLinePct: 60,
  globalBranchPct: 50,
  coreLinePct: 90,
} as const;

export const DEFAULT_REPORTS = [
  'app/coverage/coverage-final.json',
  'server/coverage/coverage-final.json',
  'packages/shared/coverage/coverage-final.json',
  'packages/config/coverage/coverage-final.json',
  'packages/quality/coverage/coverage-final.json',
] as const;

export interface CoverageFloors {
  readonly diffLinePct: number;
  readonly globalLinePct: number;
  readonly globalBranchPct: number;
  readonly coreLinePct: number;
  readonly core: readonly string[];
  readonly exclude: readonly string[];
}

export interface HitCounts {
  readonly covered: number;
  readonly total: number;
  readonly pct: number;
}

export interface CoverageSummary {
  readonly lines: HitCounts;
  readonly branches: HitCounts;
}

export interface FileHits {
  readonly path: string;
  readonly coveredLines: ReadonlySet<number>;
  readonly statementLines: ReadonlySet<number>;
  readonly branchCovered: number;
  readonly branchTotal: number;
}

export interface DiffFile {
  readonly path: string;
  readonly addedLines: readonly number[];
}

export interface DiffMiss {
  readonly path: string;
  readonly line: number;
}

export interface GateResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
  readonly global: CoverageSummary;
  readonly core: CoverageSummary;
  readonly diff: HitCounts & { readonly misses: readonly DiffMiss[] };
}

interface StatementSpan {
  readonly start: { readonly line: number };
}

interface IstanbulFile {
  readonly path?: string;
  readonly statementMap?: Readonly<Record<string, StatementSpan>>;
  readonly s?: Readonly<Record<string, number>>;
  readonly b?: Readonly<Record<string, readonly number[]>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatementSpan(value: unknown): value is StatementSpan {
  if (!isRecord(value) || !isRecord(value.start)) return false;
  return typeof value.start.line === 'number';
}

export function percent(covered: number, total: number): number {
  if (total === 0) return 100;
  return (covered / total) * 100;
}

export function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function hits(covered: number, total: number): HitCounts {
  return { covered, total, pct: percent(covered, total) };
}

function emptySummary(): CoverageSummary {
  return { lines: hits(0, 0), branches: hits(0, 0) };
}

export function toRepoPath(filePath: string, root: string): string {
  const normalised = filePath.replaceAll('\\', '/');
  const rootNorm = root.replaceAll('\\', '/').replace(/\/+$/, '');
  if (normalised === rootNorm) return '';
  if (normalised.startsWith(`${rootNorm}/`)) {
    return normalised.slice(rootNorm.length + 1);
  }
  return normalised.replace(/^\.\//, '');
}

function isExcluded(path: string, exclude: readonly string[]): boolean {
  return exclude.some((pattern) => {
    if (pattern.startsWith('**/')) {
      const suffix = pattern.slice(3);
      return path.endsWith(suffix) || path.includes(`/${suffix}`);
    }
    return path === pattern || path.endsWith(`/${pattern}`);
  });
}

function isCorePath(path: string, core: readonly string[]): boolean {
  return core.some((prefix) => path === prefix.replace(/\/+$/, '') || path.startsWith(prefix));
}

export function parseIstanbulReport(json: unknown, root: string): FileHits[] {
  if (!isRecord(json)) {
    throw new Error('coverage report is not an object');
  }

  const files: FileHits[] = [];
  for (const [key, value] of Object.entries(json)) {
    if (!isRecord(value)) continue;
    const file = value as unknown as IstanbulFile;
    const rawPath = typeof file.path === 'string' ? file.path : key;
    const path = toRepoPath(rawPath, root);
    if (path === '') continue;

    const coveredLines = new Set<number>();
    const statementLines = new Set<number>();
    const statementMap = file.statementMap ?? {};
    const statements = file.s ?? {};

    for (const [id, span] of Object.entries(statementMap)) {
      if (!isStatementSpan(span)) continue;
      const line = span.start.line;
      statementLines.add(line);
      if ((statements[id] ?? 0) > 0) coveredLines.add(line);
    }

    let branchCovered = 0;
    let branchTotal = 0;
    for (const counts of Object.values(file.b ?? {})) {
      for (const count of counts) {
        branchTotal += 1;
        if (count > 0) branchCovered += 1;
      }
    }

    files.push({ path, coveredLines, statementLines, branchCovered, branchTotal });
  }

  return files;
}

export function summarise(
  files: readonly FileHits[],
  include: (path: string) => boolean = () => true,
): CoverageSummary {
  let lineCovered = 0;
  let lineTotal = 0;
  let branchCovered = 0;
  let branchTotal = 0;

  for (const file of files) {
    if (!include(file.path)) continue;
    lineTotal += file.statementLines.size;
    for (const line of file.statementLines) {
      if (file.coveredLines.has(line)) lineCovered += 1;
    }
    branchCovered += file.branchCovered;
    branchTotal += file.branchTotal;
  }

  return { lines: hits(lineCovered, lineTotal), branches: hits(branchCovered, branchTotal) };
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: { path: string; addedLines: number[] } | undefined;
  let newLine = 0;

  const finish = (): void => {
    if (current !== undefined && current.addedLines.length > 0) {
      files.push({ path: current.path, addedLines: current.addedLines });
    }
    current = undefined;
  };

  for (const raw of diff.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('+++ ')) {
      finish();
      const marker = line.slice(4);
      if (marker === '/dev/null') {
        current = undefined;
        continue;
      }
      const path = marker.replace(/^b\//, '');
      current = { path, addedLines: [] };
      continue;
    }
    if (current === undefined) continue;

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk?.[1] !== undefined) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.addedLines.push(newLine);
      newLine += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }
    if (line.startsWith('\\')) continue;
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ')) {
      continue;
    }
    newLine += 1;
  }

  finish();
  return files;
}

const COVERABLE = /\.(?:[cm]?[jt]sx?)$/;

export function isCoverablePath(path: string): boolean {
  if (path.includes('.test.')) return false;
  if (path.includes('/cli/')) return false;
  if (!COVERABLE.test(path)) return false;
  return (
    path.startsWith('app/src/') ||
    path.startsWith('app/tools/') ||
    path.startsWith('server/src/') ||
    /^packages\/[^/]+\/src\//.test(path)
  );
}

export function diffLineCoverage(
  files: readonly FileHits[],
  diff: readonly DiffFile[],
  exclude: readonly string[],
): HitCounts & { misses: DiffMiss[] } {
  const byPath = new Map(files.map((file) => [posix.normalize(file.path), file]));
  let covered = 0;
  let total = 0;
  const misses: DiffMiss[] = [];

  for (const changed of diff) {
    const path = posix.normalize(changed.path.replace(/^\.\//, ''));
    if (!isCoverablePath(path) || isExcluded(path, exclude)) continue;

    const hitsForFile = byPath.get(path);
    for (const line of changed.addedLines) {
      if (hitsForFile !== undefined && !hitsForFile.statementLines.has(line)) {
        continue;
      }
      total += 1;
      const hit = hitsForFile !== undefined && hitsForFile.coveredLines.has(line);
      if (hit) {
        covered += 1;
      } else {
        misses.push({ path, line });
      }
    }
  }

  return { ...hits(covered, total), misses };
}

function asNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`thresholds.${key} must be a number`);
  }
  return value;
}

function asStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`thresholds.${key} must be an array of strings`);
  }
  return value;
}

export function parseThresholds(json: unknown): CoverageFloors {
  if (!isRecord(json)) {
    throw new Error('thresholds file is not an object');
  }
  return {
    diffLinePct: asNumber(json.diffLinePct, 'diffLinePct'),
    globalLinePct: asNumber(json.globalLinePct, 'globalLinePct'),
    globalBranchPct: asNumber(json.globalBranchPct, 'globalBranchPct'),
    coreLinePct: asNumber(json.coreLinePct, 'coreLinePct'),
    core: asStringArray(json.core, 'core'),
    exclude: asStringArray(json.exclude, 'exclude'),
  };
}

export function belowDocumentedFloors(floors: CoverageFloors): string[] {
  const violations: string[] = [];
  const pairs: Array<readonly [keyof typeof DOCUMENTED_FLOORS, number]> = [
    ['diffLinePct', floors.diffLinePct],
    ['globalLinePct', floors.globalLinePct],
    ['globalBranchPct', floors.globalBranchPct],
    ['coreLinePct', floors.coreLinePct],
  ];
  for (const [key, value] of pairs) {
    const floor = DOCUMENTED_FLOORS[key];
    if (value < floor) {
      violations.push(
        `ratchet: ${key} is ${String(value)}, below the documented floor ${String(floor)}`,
      );
    }
  }
  return violations;
}

export function ratchetViolations(current: CoverageFloors, previous: CoverageFloors): string[] {
  const violations: string[] = [];
  const keys: Array<keyof typeof DOCUMENTED_FLOORS> = [
    'diffLinePct',
    'globalLinePct',
    'globalBranchPct',
    'coreLinePct',
  ];
  for (const key of keys) {
    if (current[key] < previous[key]) {
      violations.push(
        `ratchet: ${key} fell from ${String(previous[key])} to ${String(current[key])}`,
      );
    }
  }

  for (const prefix of previous.core) {
    if (!current.core.includes(prefix)) {
      violations.push(`ratchet: core prefix removed: ${prefix}`);
    }
  }

  for (const pattern of current.exclude) {
    if (!previous.exclude.includes(pattern)) {
      violations.push(`ratchet: exclusion added: ${pattern}`);
    }
  }

  return violations;
}

export function evaluateCoverage(args: {
  readonly files: readonly FileHits[];
  readonly floors: CoverageFloors;
  readonly diff: readonly DiffFile[];
  readonly previous?: CoverageFloors;
}): GateResult {
  const { files, floors, diff, previous } = args;
  const violations: string[] = [];

  violations.push(...belowDocumentedFloors(floors));
  if (previous !== undefined) {
    violations.push(...ratchetViolations(floors, previous));
  }

  const included = files.filter((file) => !isExcluded(file.path, floors.exclude));
  const global = summarise(included);
  const coreFiles = included.filter((file) => isCorePath(file.path, floors.core));
  const core = coreFiles.length === 0 ? emptySummary() : summarise(coreFiles);
  const diffHits = diffLineCoverage(included, diff, floors.exclude);

  if (global.lines.total === 0) {
    violations.push('coverage report contained no statements');
  }
  if (coreFiles.length === 0) {
    violations.push('core globs matched no instrumented files');
  }
  if (global.lines.pct < floors.globalLinePct) {
    violations.push(
      `global line coverage ${formatPct(global.lines.pct)} < ${String(floors.globalLinePct)}%`,
    );
  }
  if (global.branches.pct < floors.globalBranchPct) {
    violations.push(
      `global branch coverage ${formatPct(global.branches.pct)} < ${String(floors.globalBranchPct)}%`,
    );
  }
  if (coreFiles.length > 0 && core.lines.pct < floors.coreLinePct) {
    violations.push(
      `core line coverage ${formatPct(core.lines.pct)} < ${String(floors.coreLinePct)}%`,
    );
  }
  if (diffHits.pct < floors.diffLinePct) {
    const sample = diffHits.misses
      .slice(0, 8)
      .map((miss) => `${miss.path}:${String(miss.line)}`)
      .join(', ');
    const extra =
      diffHits.misses.length > 8 ? ` (+${String(diffHits.misses.length - 8)} more)` : '';
    violations.push(
      `diff line coverage ${formatPct(diffHits.pct)} < ${String(floors.diffLinePct)}%` +
        (sample === '' ? '' : ` (uncovered: ${sample}${extra})`),
    );
  }

  return {
    ok: violations.length === 0,
    violations,
    global,
    core,
    diff: diffHits,
  };
}
