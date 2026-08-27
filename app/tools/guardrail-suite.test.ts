// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SDK_SCRIPT_SRC } from './html-integrity.js';
import { formatViolation, runGuardrailSuite } from './guardrail-suite.js';

/**
 * The suite is the fail-closed half of the guardrail set: these tests assert that a check which
 * could not run reports a violation, because the failure mode being guarded against is a green job
 * that never scanned anything (`docs/plan/media-plane-decision.md` §5.3 item 1).
 */

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() ?? '', { recursive: true, force: true });
  }
});

interface FixtureOptions {
  /** Emitted files, relative to the artifact directory. Omit to leave the artifact absent. */
  readonly dist?: Readonly<Record<string, string>>;
  readonly sources?: Readonly<Record<string, string>>;
}

const CLEAN_DOCUMENT = `<!doctype html><html><head><script src="${SDK_SCRIPT_SRC}"></script></head><body><div id="root"></div><script type="module" src="./assets/main.js"></script></body></html>`;

function fixture(options: FixtureOptions = {}): { appRoot: string; distDir: string } {
  const appRoot = mkdtempSync(join(tmpdir(), 'guardrail-suite-'));
  roots.push(appRoot);

  const sources = options.sources ?? { 'src/main.ts': 'export const ready = true;\n' };
  writeFileSync(join(appRoot, 'index.html'), CLEAN_DOCUMENT);
  for (const [path, contents] of Object.entries(sources)) {
    write(appRoot, path, contents);
  }

  const distDir = join(appRoot, 'dist');
  if (options.dist !== undefined) {
    mkdirSync(distDir, { recursive: true });
    for (const [path, contents] of Object.entries(options.dist)) {
      write(distDir, path, contents);
    }
  }

  return { appRoot, distDir };
}

function write(root: string, path: string, contents: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, contents);
}

const CLEAN_DIST = {
  'index.html': CLEAN_DOCUMENT,
  'assets/main-abc.js': 'const a=1;export{a};\n',
};

describe('guardrail suite', () => {
  it('passes a compliant source tree and artifact', () => {
    expect(runGuardrailSuite(fixture({ dist: CLEAN_DIST }))).toEqual([]);
  });

  it('fails when the artifact directory is absent, rather than skipping the bundle scan', () => {
    const violations = runGuardrailSuite(fixture());
    expect(violations).toHaveLength(1);
    expect(violations[0]?.layer).toBe('artifact');
    expect(violations[0]?.rule).toBe('the build artifact is required');
    expect(violations[0]?.evidence).toContain('directory not found');
  });

  it('fails when the artifact directory holds nothing scannable', () => {
    const violations = runGuardrailSuite(fixture({ dist: { 'assets/poster.png': 'not code' } }));
    expect(violations.map((violation) => violation.rule)).toEqual([
      'the build artifact is required',
    ]);
    expect(violations[0]?.evidence).toContain('no scannable');
  });

  it('fails when a source map is the only emitted file', () => {
    // A map is not the artifact the platform reads, so a dist holding only maps proves nothing.
    const violations = runGuardrailSuite(fixture({ dist: { 'assets/main-abc.js.map': '{}' } }));
    expect(violations.map((violation) => violation.rule)).toEqual([
      'the build artifact is required',
    ]);
  });

  it('fails when the built document is missing from a non-empty artifact', () => {
    const violations = runGuardrailSuite(
      fixture({ dist: { 'assets/main-abc.js': 'const a=1;export{a};\n' } }),
    );
    expect(violations.map((violation) => violation.rule)).toEqual([
      'the built document is required',
    ]);
  });

  it('keeps the VePlayer bans: a media element in the artifact fails', () => {
    const violations = runGuardrailSuite(
      fixture({
        dist: {
          ...CLEAN_DIST,
          'assets/main-abc.js': "const v=document.createElement('video');export{v};\n",
        },
      }),
    );
    expect(violations.map((violation) => violation.rule)).toContain('no native video element');
  });

  it('keeps the VePlayer bans: a third-party player in the artifact fails', () => {
    const violations = runGuardrailSuite(
      fixture({
        dist: { ...CLEAN_DIST, 'assets/vendor-abc.js': 'import "hls.js";\n' },
      }),
    );
    expect(violations.map((violation) => violation.rule)).toContain('no third-party media player');
  });

  it('keeps the VePlayer bans: a media element in the built document fails', () => {
    const violations = runGuardrailSuite(
      fixture({
        dist: {
          ...CLEAN_DIST,
          'index.html': `${CLEAN_DOCUMENT}<video src="x"></video>`,
        },
      }),
    );
    expect(violations.map((violation) => violation.rule)).toContain('no <video> element');
  });

  it('keeps the source containment rule', () => {
    const violations = runGuardrailSuite(
      fixture({
        dist: CLEAN_DIST,
        sources: { 'src/routes/PlayPage.ts': 'export const p = window.TTMinis;\n' },
      }),
    );
    expect(violations[0]?.layer).toBe('source');
    expect(violations[0]?.subject).toContain('PlayPage.ts:1');
  });

  it('fails when the source tree or the source document is absent', () => {
    const { appRoot, distDir } = fixture({ dist: CLEAN_DIST });
    rmSync(join(appRoot, 'src'), { recursive: true, force: true });
    rmSync(join(appRoot, 'index.html'), { force: true });

    const violations = runGuardrailSuite({ appRoot, distDir });
    expect(violations.map((violation) => violation.rule)).toEqual([
      'the source tree is required',
      'the source document is required',
    ]);
  });

  it('formats a violation with its layer, subject, rule and evidence', () => {
    const [violation] = runGuardrailSuite(fixture());
    expect(violation && formatViolation(violation)).toMatch(
      /^artifact\s+dist\s+the build artifact is required\s+— /,
    );
  });
});
