import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isScannableBundleFile, scanBundleText } from '../bundle-scan.js';
import { checkIndexHtml } from '../html-integrity.js';
import { checkSourceTree } from '../source-rules.js';

/**
 * Runs every platform guardrail that needs real files rather than an AST, and exits non-zero on
 * any violation. Wired into CI after `build`; the unit tests cover the same rules on fixtures.
 */

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const distDir = join(appRoot, 'dist');

const failures: string[] = [];

for (const violation of checkSourceTree(appRoot)) {
  failures.push(
    `source  ${violation.file}:${String(violation.line)}  ${violation.rule}  — ${violation.evidence}`,
  );
}

for (const violation of checkIndexHtml(readFileSync(join(appRoot, 'index.html'), 'utf8'))) {
  failures.push(`html    index.html  ${violation.rule}  — ${violation.evidence}`);
}

if (existsSync(distDir)) {
  for (const file of listFiles(distDir)) {
    if (!isScannableBundleFile(file)) {
      continue;
    }
    const relativePath = relative(appRoot, file);
    for (const violation of scanBundleText(relativePath, readFileSync(file, 'utf8'))) {
      failures.push(`bundle  ${violation.file}  ${violation.rule}  — ${violation.evidence}`);
    }
  }
  // The built document is what ships; the source document is only its template.
  const builtHtml = join(distDir, 'index.html');
  if (existsSync(builtHtml)) {
    for (const violation of checkIndexHtml(readFileSync(builtHtml, 'utf8'))) {
      failures.push(`bundle  dist/index.html  ${violation.rule}  — ${violation.evidence}`);
    }
  }
} else {
  process.stdout.write('note: app/dist is absent, skipping the bundle scan — run build first\n');
}

if (failures.length > 0) {
  process.stderr.write(`platform guardrails failed (${String(failures.length)}):\n`);
  for (const failure of failures) {
    process.stderr.write(`  ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write('platform guardrails passed\n');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}
