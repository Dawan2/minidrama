import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { isScannableBundleFile, scanBundleText } from './bundle-scan.js';
import { checkIndexHtml } from './html-integrity.js';
import { checkSourceTree } from './source-rules.js';

/**
 * Runs every guardrail that needs real files rather than an AST, over an explicitly named source
 * tree and artifact directory.
 *
 * The suite is fail-closed: a check that could not run is a failure, not a pass. The bundle scan is
 * the strongest rule in the set (it sees what a dependency contributed, which lint cannot), so a
 * missing or empty artifact means compliance is unproven and the check reports that as a violation
 * — `docs/plan/media-plane-decision.md` §5.1 and §5.3 item 1. The previous behaviour, printing a
 * note and exiting 0, made a CI ordering change or a cache miss silently disable the scan.
 */

export type GuardrailLayer = 'source' | 'html' | 'artifact' | 'bundle';

export interface GuardrailViolation {
  readonly layer: GuardrailLayer;
  readonly subject: string;
  readonly rule: string;
  readonly evidence: string;
}

export interface GuardrailSuiteOptions {
  /** Root of the client package: the tree holding `src/` and `index.html`. */
  readonly appRoot: string;
  /** Build artifact directory to scan. Named by the caller so no layout is hard-coded here. */
  readonly distDir: string;
}

export function runGuardrailSuite(options: GuardrailSuiteOptions): readonly GuardrailViolation[] {
  return [
    ...checkSourceLayer(options.appRoot),
    ...checkDocumentLayer(options.appRoot),
    ...checkArtifactLayer(options.appRoot, options.distDir),
  ];
}

export function formatViolation(violation: GuardrailViolation): string {
  const layer = violation.layer.padEnd(9);
  return `${layer}${violation.subject}  ${violation.rule}  — ${violation.evidence}`;
}

function checkSourceLayer(appRoot: string): readonly GuardrailViolation[] {
  const srcDir = join(appRoot, 'src');
  if (!existsSync(srcDir)) {
    return [
      {
        layer: 'source',
        subject: relativeTo(appRoot, srcDir),
        rule: 'the source tree is required',
        evidence: 'directory not found, so the source rules could not run',
      },
    ];
  }

  return checkSourceTree(appRoot).map((violation) => ({
    layer: 'source' as const,
    subject: `${violation.file}:${String(violation.line)}`,
    rule: violation.rule,
    evidence: violation.evidence,
  }));
}

function checkDocumentLayer(appRoot: string): readonly GuardrailViolation[] {
  const indexHtml = join(appRoot, 'index.html');
  if (!existsSync(indexHtml)) {
    return [
      {
        layer: 'html',
        subject: relativeTo(appRoot, indexHtml),
        rule: 'the source document is required',
        evidence: 'file not found, so the document-integrity check could not run',
      },
    ];
  }

  return checkIndexHtml(readFileSync(indexHtml, 'utf8')).map((violation) => ({
    layer: 'html' as const,
    subject: 'index.html',
    rule: violation.rule,
    evidence: violation.evidence,
  }));
}

function checkArtifactLayer(appRoot: string, distDir: string): readonly GuardrailViolation[] {
  const subject = relativeTo(appRoot, distDir);

  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    return [
      {
        layer: 'artifact',
        subject,
        rule: 'the build artifact is required',
        evidence: 'directory not found, so the bundle scan could not run — build before checking',
      },
    ];
  }

  const scannable = listFiles(distDir).filter((file) => isScannableBundleFile(file));
  if (scannable.length === 0) {
    return [
      {
        layer: 'artifact',
        subject,
        rule: 'the build artifact is required',
        evidence: 'no scannable .js/.css/.html file, so the bundle scan had nothing to prove',
      },
    ];
  }

  const violations: GuardrailViolation[] = [];

  for (const file of scannable) {
    const relativePath = relativeTo(appRoot, file);
    for (const violation of scanBundleText(relativePath, readFileSync(file, 'utf8'))) {
      violations.push({
        layer: 'bundle',
        subject: violation.file,
        rule: violation.rule,
        evidence: violation.evidence,
      });
    }
  }

  // The built document is what ships; the source document is only its template. Its absence is a
  // broken artifact, not an excuse to skip the check.
  const builtHtml = join(distDir, 'index.html');
  if (existsSync(builtHtml)) {
    for (const violation of checkIndexHtml(readFileSync(builtHtml, 'utf8'))) {
      violations.push({
        layer: 'bundle',
        subject: `${subject}/index.html`,
        rule: violation.rule,
        evidence: violation.evidence,
      });
    }
  } else {
    violations.push({
      layer: 'artifact',
      subject: `${subject}/index.html`,
      rule: 'the built document is required',
      evidence: 'file not found, so the shipped document was never checked',
    });
  }

  return violations;
}

function relativeTo(appRoot: string, target: string): string {
  const path = relative(appRoot, target);
  return path === '' || path.startsWith('..') ? target : path;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}
