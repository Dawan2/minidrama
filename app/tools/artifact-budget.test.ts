/** @vitest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ARTIFACT_CLI_USAGE,
  ArtifactBudgetError,
  assertArtifactBudget,
  extractLocalJsRefs,
  extractModulepreloadHrefs,
  extractScriptSrcs,
  inspectArtifactBudget,
  isExternalAssetRef,
  listShippedFiles,
  parseArtifactArgs,
  resolveLocalAsset,
  runCheckArtifactCli,
  ZIP_BUDGET_BYTES,
} from './artifact-budget.js';

/**
 * Reverse verification for G2.6. The L2 job runs the CLI against `app/dist`; these fixtures are
 * the injection that proves an over-budget zip, a first-screen JS gzip over 300 KB, an empty
 * file, a shipped `.map`, or a debug/test backdoor turns the check red. A job that only prints
 * the live dist size is the D-01 shape for "artifact budget".
 */

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() ?? '', { recursive: true, force: true });
  }
});

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'artifact-budget-'));
  roots.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

const tinyHtml = '<!doctype html><script src="./assets/app.js"></script>';
const tinyJs = 'console.log(1)';

describe('extractScriptSrcs / extractLocalJsRefs', () => {
  it('collects script src from index.html', () => {
    expect(extractScriptSrcs(tinyHtml)).toEqual(['./assets/app.js']);
  });

  it('collects modulepreload hrefs as first-screen JS', () => {
    const html =
      '<!doctype html><script type="module" src="./assets/app.js"></script>' +
      '<link rel="modulepreload" href="./assets/vendor.js">';
    expect(extractModulepreloadHrefs(html)).toEqual(['./assets/vendor.js']);
    expect(extractLocalJsRefs(html)).toEqual(['./assets/app.js', './assets/vendor.js']);
  });

  it('skips the platform SDK rather than counting it against the gzip budget', () => {
    expect(isExternalAssetRef('https://connect.tiktok-minis.com/drama/sdk.js')).toBe(true);
    expect(isExternalAssetRef('data:text/javascript,void 0')).toBe(true);
    expect(
      extractLocalJsRefs(
        '<script src="https://connect.tiktok-minis.com/drama/sdk.js"></script><script src="./assets/app.js"></script>',
      ),
    ).toEqual(['./assets/app.js']);
  });
});

describe('resolveLocalAsset', () => {
  it('resolves a leading-slash src against dist rather than the host root', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
    });
    expect(resolveLocalAsset(distDir, '/assets/app.js')).toBe(join(distDir, 'assets/app.js'));
  });

  it('refuses a src that escapes dist rather than reading the rest of the disk', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
    });
    expect(resolveLocalAsset(distDir, '../secret.js')).toBeUndefined();
  });
});

describe('listShippedFiles', () => {
  it('fails when dist is missing rather than reporting an empty zip', () => {
    expect(() => listShippedFiles(join(tmpdir(), 'artifact-budget-missing-dist'))).toThrow(
      /dist directory not found/,
    );
  });

  it('fails when dist is a file rather than a directory', () => {
    const distDir = fixture({ 'index.html': tinyHtml });
    const asFile = join(distDir, 'index.html');
    expect(() => listShippedFiles(asFile)).toThrow(/dist directory not found/);
  });
});

describe('assertArtifactBudget', () => {
  it('accepts a tiny production dist', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
    });
    const report = assertArtifactBudget({ distDir });
    expect(report.zipBytes).toBeLessThan(ZIP_BUDGET_BYTES);
    expect(report.mapFiles).toEqual([]);
    expect(report.emptyFiles).toEqual([]);
    expect(report.debugHits).toEqual([]);
    expect(report.shippedFiles).toEqual(expect.arrayContaining(['index.html', 'assets/app.js']));
  });

  it('refuses when uncompressed zip payload exceeds budget', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
      'fat.bin': 'x'.repeat(50),
    });
    expect(() => assertArtifactBudget({ distDir, zipBudgetBytes: 20 })).toThrow(
      ArtifactBudgetError,
    );
    try {
      assertArtifactBudget({ distDir, zipBudgetBytes: 20 });
    } catch (err) {
      expect(err).toBeInstanceOf(ArtifactBudgetError);
      expect((err as ArtifactBudgetError).message).toMatch(/zip payload/);
      expect((err as ArtifactBudgetError).report.zipBytes).toBeGreaterThan(20);
    }
  });

  it('refuses first-screen JS gzip over budget', () => {
    const bulky = `const x = '${'a'.repeat(400)}';`;
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': bulky,
    });
    const gzipBytes = gzipSync(Buffer.from(bulky)).length;
    expect(() =>
      assertArtifactBudget({ distDir, firstScreenJsGzipBudgetBytes: gzipBytes - 1 }),
    ).toThrow(/first-screen JS gzip/);
  });

  it('sums modulepreload gzip into the first-screen budget', () => {
    const html =
      '<!doctype html><script type="module" src="./assets/app.js"></script>' +
      '<link rel="modulepreload" href="./assets/vendor.js">';
    const distDir = fixture({
      'index.html': html,
      'assets/app.js': tinyJs,
      'assets/vendor.js': 'const vendor = 1;',
    });
    const report = inspectArtifactBudget({ distDir });
    const expected =
      gzipSync(Buffer.from(tinyJs)).length + gzipSync(Buffer.from('const vendor = 1;')).length;
    expect(report.firstScreenJsGzipBytes).toBe(expected);
  });

  it('refuses empty files and debug symbols in one report', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
      'empty.txt': '',
      'assets/app.js.map': '{}',
    });
    expect(() => assertArtifactBudget({ distDir })).toThrow(/empty files: empty\.txt/);
    expect(() => assertArtifactBudget({ distDir })).toThrow(/debug symbols/);
  });

  it('refuses shipped .map debug symbols', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
      'assets/app.js.map': '{}',
    });
    expect(() => assertArtifactBudget({ distDir })).toThrow(/debug symbols/);
  });

  it('refuses debug switches and test backdoors', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': 'const DEBUG=true; void 0',
    });
    expect(() => assertArtifactBudget({ distDir })).toThrow(/DEBUG=true/);
  });

  it('refuses the test-login sentence and payment-bypass flags', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js':
        'MINIDRAMA_TEST_LOGIN=yes-i-am-a-non-production-test-deployment; PAYMENT_BYPASS; SKIP_PAYMENT',
    });
    expect(() => assertArtifactBudget({ distDir })).toThrow(/MINIDRAMA_TEST_LOGIN/);
    expect(() => assertArtifactBudget({ distDir })).toThrow(/PAYMENT_BYPASS/);
    expect(() => assertArtifactBudget({ distDir })).toThrow(/SKIP_PAYMENT/);
  });

  it('fails when index.html is missing rather than measuring zero JS', () => {
    const distDir = fixture({ 'assets/app.js': tinyJs });
    expect(() => inspectArtifactBudget({ distDir })).toThrow(/index\.html missing/);
  });

  it('fails when a first-screen script src is not on disk', () => {
    const distDir = fixture({
      'index.html': '<script src="./assets/missing.js"></script>',
    });
    expect(() => inspectArtifactBudget({ distDir })).toThrow(
      /first-screen script src not found on disk: \.\/assets\/missing\.js/,
    );
  });

  it('inspects without throwing so callers can quote numbers', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
    });
    const report = inspectArtifactBudget({ distDir });
    expect(report.shippedFiles).toContain('index.html');
    expect(report.firstScreenJsGzipBytes).toBeGreaterThan(0);
  });
});

describe('parseArtifactArgs', () => {
  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseArtifactArgs(['--allow-unknown'], '/tmp')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects --dist without a directory', () => {
    expect(parseArtifactArgs(['--dist'], '/tmp')).toEqual({
      ok: false,
      message: '--dist requires a directory',
    });
    expect(parseArtifactArgs(['--dist', '--other'], '/tmp')).toEqual({
      ok: false,
      message: '--dist requires a directory',
    });
  });

  it('resolves --dist against cwd', () => {
    expect(parseArtifactArgs(['--dist', 'dist'], '/tmp/app')).toEqual({
      ok: true,
      args: { distDir: resolve('/tmp/app', 'dist') },
    });
  });

  it('rejects a missing --dist rather than guessing cwd/dist', () => {
    expect(parseArtifactArgs([], '/tmp')).toEqual({
      ok: false,
      message: '--dist is required: the artifact directory is named, not guessed',
    });
  });
});

describe('runCheckArtifactCli', () => {
  it('exits 2 on a missing --dist and prints usage', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = runCheckArtifactCli([], '/tmp', {
      stdout: { write: (c) => stdout.push(c) },
      stderr: { write: (c) => stderr.push(c) },
    });
    expect(code).toBe(2);
    expect(stderr.join('')).toContain('--dist is required');
    expect(stderr.join('')).toContain(ARTIFACT_CLI_USAGE);
    expect(stdout.join('')).toBe('');
  });

  it('defaults cwd and io when they are omitted', () => {
    expect(runCheckArtifactCli([])).toBe(2);
  });

  it('exits 1 when dist is missing', () => {
    const stderr: string[] = [];
    const code = runCheckArtifactCli(['--dist', 'no-such-dist'], tmpdir(), {
      stdout: { write: () => undefined },
      stderr: { write: (c) => stderr.push(c) },
    });
    expect(code).toBe(1);
    expect(stderr.join('')).toMatch(/dist directory not found/);
  });

  it('exits 0 on a tiny production dist', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
    });
    const stdout: string[] = [];
    const code = runCheckArtifactCli(['--dist', distDir], tmpdir(), {
      stdout: { write: (c) => stdout.push(c) },
      stderr: { write: () => undefined },
    });
    expect(code).toBe(0);
    expect(stdout.join('')).toMatch(/^artifact budget passed:/);
  });

  it('exits 1 on a shipped .map when invoked as CI would', () => {
    const distDir = fixture({
      'index.html': tinyHtml,
      'assets/app.js': tinyJs,
      'assets/app.js.map': '{}',
    });
    const stderr: string[] = [];
    const code = runCheckArtifactCli(['--dist', distDir], tmpdir(), {
      stdout: { write: () => undefined },
      stderr: { write: (c) => stderr.push(c) },
    });
    expect(code).toBe(1);
    expect(stderr.join('')).toMatch(/debug symbols/);
  });
});
