import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Source-tree rules that are easier to state over paths than over an AST.
 *
 * The one that matters most: `window.TTMinis` may be referenced only inside `src/platform/`.
 * That containment is what makes every platform-dependent feature testable off-device, and it is
 * what keeps an SDK namespace change (open item O-1) a one-line fix.
 */

export interface SourceViolation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly evidence: string;
}

export const PLATFORM_DIR = join('src', 'platform');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

export function listSourceFiles(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

export function checkSourceTree(appRoot: string): readonly SourceViolation[] {
  const violations: SourceViolation[] = [];

  for (const file of listSourceFiles(join(appRoot, 'src'))) {
    const relativePath = relative(appRoot, file);
    const isPlatformModule = relativePath.startsWith(`${PLATFORM_DIR}${sep}`);
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
      if (!isPlatformModule && /\bTTMinis\b/.test(line) && !isComment(line)) {
        violations.push({
          file: relativePath,
          line: index + 1,
          rule: `TTMinis may only be referenced inside ${PLATFORM_DIR}/`,
          evidence: line.trim(),
        });
      }
    });
  }

  return violations;
}

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}
