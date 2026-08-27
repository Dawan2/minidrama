// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { DOCUMENTED_FLOORS } from '../coverage.js';
import { repoRoot } from '../paths.js';
import { parseCoverageArgs, runCoverageCheck } from '../run-coverage-check.js';

/**
 * Exit-code tests for the G1.5 entry point. A report under the floor, a lowered thresholds
 * file, or a missing report must fail — a coverage number with no failing fixture is D-01.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-coverage.ts', import.meta.url));

function tsxBin(): string {
  const candidates = [
    join(packageRoot, 'node_modules', '.bin', 'tsx'),
    join(repoRoot, 'node_modules', '.bin', 'tsx'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`tsx not found in ${candidates.join(', ')}`);
  }
  return found;
}

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop() ?? '', { recursive: true, force: true });
  }
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'check-coverage-'));
  fixtures.push(root);
  return root;
}

function writeJson(path: string, body: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body)}\n`);
}

function floors(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...DOCUMENTED_FLOORS,
    core: ['server/src/modules/wallet/'],
    exclude: ['**/*.test.ts'],
    ...overrides,
  };
}

function coverageReport(root: string): Record<string, unknown> {
  const path = `${root}/server/src/modules/wallet/view.ts`;
  return {
    [path]: {
      path,
      statementMap: Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [String(index), { start: { line: index + 1 } }]),
      ),
      s: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index), 1])),
      b: { '0': [1, 1] },
    },
  };
}

function runCli(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('parseCoverageArgs', () => {
  it('rejects an unknown argument rather than ignoring it', () => {
    const parsed = parseCoverageArgs(['--allow-unknown'], '/repo');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error('expected failure');
    expect(parsed.message).toContain('unknown argument');
  });
});

describe('runCoverageCheck', () => {
  it('fails when a required report is missing', () => {
    const root = workspace();
    writeJson(join(root, 'packages/quality/coverage-thresholds.json'), floors());
    writeFileSync(join(root, 'empty.diff'), '');

    const parsed = parseCoverageArgs(['--root', root, '--diff', join(root, 'empty.diff')], root);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('expected args');

    const output = runCoverageCheck(parsed.args);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('coverage reports are required and missing');
    expect(output.stdout).not.toContain('coverage gate passed');
  });

  it('fails when the report is under the global floor', () => {
    const root = workspace();
    const reportPath = join(root, 'coverage-final.json');
    const thresholdsPath = join(root, 'thresholds.json');
    const diffPath = join(root, 'change.diff');
    const filePath = `${root}/server/src/modules/wallet/view.ts`;
    writeJson(reportPath, {
      [filePath]: {
        path: filePath,
        statementMap: {
          '0': { start: { line: 1 } },
          '1': { start: { line: 2 } },
        },
        s: { '0': 1, '1': 0 },
        b: { '0': [0, 0] },
      },
    });
    writeJson(thresholdsPath, floors());
    writeFileSync(diffPath, '');

    const output = runCoverageCheck({
      root,
      reports: [reportPath],
      thresholdsPath,
      previousPath: undefined,
      diffPath,
      base: undefined,
    });

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('coverage gate failed');
    expect(output.stderr).toContain('global line coverage');
  });

  it('fails when the thresholds file is lowered under the documented floor', () => {
    const root = workspace();
    const reportPath = join(root, 'coverage-final.json');
    const thresholdsPath = join(root, 'thresholds.json');
    const diffPath = join(root, 'change.diff');
    writeJson(reportPath, coverageReport(root));
    writeJson(thresholdsPath, floors({ globalLinePct: 40 }));
    writeFileSync(
      diffPath,
      [
        '--- a/server/src/modules/wallet/view.ts',
        '+++ b/server/src/modules/wallet/view.ts',
        '@@ -1,0 +1,1 @@',
        '+const ok = true',
      ].join('\n'),
    );

    const output = runCoverageCheck({
      root,
      reports: [reportPath],
      thresholdsPath,
      previousPath: undefined,
      diffPath,
      base: undefined,
    });

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('below the documented floor');
  });

  it('fails when the live floors file is lower than the previous copy', () => {
    const root = workspace();
    const reportPath = join(root, 'coverage-final.json');
    const thresholdsPath = join(root, 'thresholds.json');
    const previousPath = join(root, 'previous.json');
    const diffPath = join(root, 'change.diff');
    writeJson(reportPath, coverageReport(root));
    writeJson(thresholdsPath, floors({ globalLinePct: 60 }));
    writeJson(previousPath, floors({ globalLinePct: 70 }));
    writeFileSync(
      diffPath,
      [
        '--- a/server/src/modules/wallet/view.ts',
        '+++ b/server/src/modules/wallet/view.ts',
        '@@ -1,0 +1,1 @@',
        '+const ok = true',
      ].join('\n'),
    );

    const output = runCoverageCheck({
      root,
      reports: [reportPath],
      thresholdsPath,
      previousPath,
      diffPath,
      base: undefined,
    });

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('ratchet: globalLinePct fell from 70 to 60');
  });

  it('passes on a report that meets every floor', () => {
    const root = workspace();
    const reportPath = join(root, 'coverage-final.json');
    const thresholdsPath = join(root, 'thresholds.json');
    const diffPath = join(root, 'change.diff');
    writeJson(reportPath, coverageReport(root));
    writeJson(thresholdsPath, floors());
    writeFileSync(
      diffPath,
      [
        '--- a/server/src/modules/wallet/view.ts',
        '+++ b/server/src/modules/wallet/view.ts',
        '@@ -1,0 +1,1 @@',
        '+const ok = true',
      ].join('\n'),
    );

    const output = runCoverageCheck({
      root,
      reports: [reportPath],
      thresholdsPath,
      previousPath: undefined,
      diffPath,
      base: undefined,
    });

    expect(output.stderr).toBe('');
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('coverage gate passed');
  });
});

describe('check-coverage CLI', () => {
  it('exits 2 on an unknown argument', () => {
    const result = runCli(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
  });

  it('exits 1 when a fixture report is under the floor', () => {
    const root = workspace();
    const reportPath = join(root, 'coverage-final.json');
    const thresholdsPath = join(root, 'thresholds.json');
    const diffPath = join(root, 'change.diff');
    const filePath = `${root}/server/src/modules/wallet/view.ts`;
    writeJson(reportPath, {
      [filePath]: {
        path: filePath,
        statementMap: { '0': { start: { line: 1 } }, '1': { start: { line: 2 } } },
        s: { '0': 1, '1': 0 },
        b: { '0': [0, 0] },
      },
    });
    writeJson(thresholdsPath, floors());
    writeFileSync(diffPath, '');

    const result = runCli([
      '--root',
      root,
      '--report',
      reportPath,
      '--thresholds',
      thresholdsPath,
      '--diff',
      diffPath,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('coverage gate failed');
  });
});
