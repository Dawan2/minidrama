import { describe, expect, it } from 'vitest';

import {
  DOCUMENTED_FLOORS,
  belowDocumentedFloors,
  diffLineCoverage,
  evaluateCoverage,
  parseIstanbulReport,
  parseThresholds,
  parseUnifiedDiff,
  percent,
  ratchetViolations,
  summarise,
  toRepoPath,
} from './coverage.js';
import type { CoverageFloors, FileHits } from './coverage.js';

const floors: CoverageFloors = {
  ...DOCUMENTED_FLOORS,
  core: ['server/src/modules/wallet/'],
  exclude: ['**/*.test.ts'],
};

function file(
  path: string,
  covered: readonly number[],
  uncovered: readonly number[] = [],
): FileHits {
  const statementLines = new Set([...covered, ...uncovered]);
  return {
    path,
    coveredLines: new Set(covered),
    statementLines,
    branchCovered: covered.length,
    branchTotal: covered.length + uncovered.length,
  };
}

describe('percent', () => {
  it('is 100 when there is nothing to cover', () => {
    expect(percent(0, 0)).toBe(100);
  });

  it('is the covered share otherwise', () => {
    expect(percent(8, 10)).toBe(80);
  });
});

describe('toRepoPath', () => {
  it('strips the repository root prefix', () => {
    expect(toRepoPath('/workspace/server/src/app.ts', '/workspace')).toBe('server/src/app.ts');
  });
});

describe('parseIstanbulReport', () => {
  it('reads statement and branch hits into repo-relative paths', () => {
    const files = parseIstanbulReport(
      {
        '/workspace/server/src/modules/wallet/view.ts': {
          path: '/workspace/server/src/modules/wallet/view.ts',
          statementMap: {
            '0': { start: { line: 4 } },
            '1': { start: { line: 8 } },
          },
          s: { '0': 3, '1': 0 },
          b: { '0': [1, 0] },
        },
      },
      '/workspace',
    );

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('server/src/modules/wallet/view.ts');
    expect(files[0]?.coveredLines.has(4)).toBe(true);
    expect(files[0]?.coveredLines.has(8)).toBe(false);
    expect(files[0]?.branchCovered).toBe(1);
    expect(files[0]?.branchTotal).toBe(2);
  });

  it('refuses a non-object report', () => {
    expect(() => parseIstanbulReport([], '/workspace')).toThrow(/not an object/);
  });
});

describe('summarise', () => {
  it('sums unique statement lines across files', () => {
    const summary = summarise([file('a.ts', [1, 2], [3]), file('b.ts', [1], [2, 3])]);
    expect(summary.lines).toEqual({ covered: 3, total: 6, pct: 50 });
  });
});

describe('parseUnifiedDiff', () => {
  it('collects added line numbers from a unified diff', () => {
    const diff = [
      'diff --git a/server/src/foo.ts b/server/src/foo.ts',
      '--- a/server/src/foo.ts',
      '+++ b/server/src/foo.ts',
      '@@ -10,0 +11,2 @@',
      '+covered()',
      '+uncovered()',
    ].join('\n');

    expect(parseUnifiedDiff(diff)).toEqual([{ path: 'server/src/foo.ts', addedLines: [11, 12] }]);
  });
});

describe('diffLineCoverage', () => {
  it('ignores added lines that are not statements (comments, blanks)', () => {
    const result = diffLineCoverage(
      [file('server/src/foo.ts', [11], [12])],
      [{ path: 'server/src/foo.ts', addedLines: [10, 11, 12] }],
      [],
    );
    expect(result.total).toBe(2);
    expect(result.covered).toBe(1);
    expect(result.misses).toEqual([{ path: 'server/src/foo.ts', line: 12 }]);
  });

  it('treats a new coverable file missing from the report as uncovered', () => {
    const result = diffLineCoverage([], [{ path: 'server/src/new.ts', addedLines: [1, 2] }], []);
    expect(result.total).toBe(2);
    expect(result.covered).toBe(0);
  });

  it('does not count markdown, workflows, or package vitest config', () => {
    const result = diffLineCoverage(
      [],
      [
        { path: 'docs/12-api-parity.md', addedLines: [1] },
        { path: '.github/workflows/ci.yml', addedLines: [3] },
        { path: 'app/vite.config.ts', addedLines: [24, 25] },
        { path: 'packages/quality/vitest.config.ts', addedLines: [1] },
      ],
      [],
    );
    expect(result.total).toBe(0);
  });
});

describe('thresholds and ratchet', () => {
  it('parses the committed floors file shape', () => {
    expect(
      parseThresholds({
        diffLinePct: 80,
        globalLinePct: 60,
        globalBranchPct: 50,
        coreLinePct: 90,
        core: ['server/src/modules/wallet/'],
        exclude: ['**/*.test.ts'],
      }),
    ).toMatchObject({ globalLinePct: 60, core: ['server/src/modules/wallet/'] });
  });

  it('rejects a lowered floor against the documented starting values', () => {
    expect(belowDocumentedFloors({ ...floors, globalLinePct: 59 })).toEqual([
      'ratchet: globalLinePct is 59, below the documented floor 60',
    ]);
  });

  it('rejects a drop against the previous committed floors', () => {
    expect(ratchetViolations({ ...floors, coreLinePct: 89 }, floors)).toEqual([
      'ratchet: coreLinePct fell from 90 to 89',
    ]);
  });

  it('rejects removing a core prefix or adding an exclusion', () => {
    expect(ratchetViolations({ ...floors, core: [] }, floors)[0]).toMatch(/core prefix removed/);
    expect(
      ratchetViolations({ ...floors, exclude: ['**/*.test.ts', '**/cli/**'] }, floors)[0],
    ).toMatch(/exclusion added/);
  });
});

describe('evaluateCoverage', () => {
  const healthy = [
    file('server/src/modules/wallet/view.ts', [1, 2, 3, 4, 5, 6, 7, 8, 9], [10]),
    file('server/src/other.ts', [1, 2, 3, 4, 5, 6], [7, 8, 9, 10]),
  ];

  it('passes when every floor is met', () => {
    const result = evaluateCoverage({
      files: healthy,
      floors,
      diff: [{ path: 'server/src/modules/wallet/view.ts', addedLines: [1, 2, 3, 4, 5] }],
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('fails when global line coverage is under the floor', () => {
    const result = evaluateCoverage({
      files: [file('server/src/modules/wallet/view.ts', [1], [2, 3, 4, 5])],
      floors,
      diff: [],
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((row) => row.includes('global line coverage'))).toBe(true);
  });

  it('fails when a lowered thresholds file is under the documented floor', () => {
    const result = evaluateCoverage({
      files: healthy,
      floors: { ...floors, globalLinePct: 40 },
      diff: [{ path: 'server/src/modules/wallet/view.ts', addedLines: [1] }],
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((row) => row.includes('below the documented floor'))).toBe(true);
  });

  it('fails when added executable lines are uncovered', () => {
    const result = evaluateCoverage({
      files: healthy,
      floors,
      diff: [{ path: 'server/src/other.ts', addedLines: [7, 8, 9, 10] }],
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((row) => row.includes('diff line coverage'))).toBe(true);
  });

  it('fails closed when the report is empty', () => {
    const result = evaluateCoverage({ files: [], floors, diff: [] });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain('coverage report contained no statements');
    expect(result.violations).toContain('core globs matched no instrumented files');
  });
});
