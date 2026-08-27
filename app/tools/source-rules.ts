import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Source-tree rules that are easier to state over paths than over an AST.
 *
 * The one that matters most: `window.TTMinis` may be referenced only inside `src/platform/`.
 * That containment is what makes every platform-dependent feature testable off-device, and it is
 * what keeps an SDK namespace change (open item O-1) a one-line fix.
 *
 * The second one closes a hole under the first-line defences. The ESLint rule matches
 * `createElement('video')` in the AST and the bundle scan greps the same literal in the artifact;
 * `createElement(tagFromSomewhereElse)` is invisible to both, and it creates exactly the element
 * TikTok replaces with a blocked UI. Demanding a literal element name costs nothing — no surface
 * in this app has a reason to compute one — and it makes the other two rules mean what they claim.
 *
 * The third one is the replacement-customisation API. Product code that calls
 * `setValidateVideoReplaceElement` is how a native `<video>` stays on screen, or how a custom
 * blocked UI is painted in its place. The fail-closed installer in `src/platform/video-replace.ts`
 * is the only production caller; a second call site is a second policy.
 */

export interface SourceViolation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly evidence: string;
}

export const PLATFORM_DIR = join('src', 'platform');

/** The only production file allowed to name the native-video replacement API. */
export const VIDEO_REPLACE_INSTALLER = join(PLATFORM_DIR, 'video-replace.ts');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/** A `createElement` whose first argument is not a quoted name — a variable, a call, a template. */
const COMPUTED_ELEMENT_NAME = /\bcreateElement\s*\(\s*[^'"`)]/;

const VIDEO_REPLACE_API = 'setValidateVideoReplaceElement';

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
      if (isComment(line)) {
        return;
      }
      if (!isPlatformModule && /\bTTMinis\b/.test(line)) {
        violations.push({
          file: relativePath,
          line: index + 1,
          rule: `TTMinis may only be referenced inside ${PLATFORM_DIR}/`,
          evidence: line.trim(),
        });
      }
      if (COMPUTED_ELEMENT_NAME.test(line)) {
        violations.push({
          file: relativePath,
          line: index + 1,
          rule: 'createElement must be given a literal element name',
          evidence: line.trim(),
        });
      }
      if (line.includes(VIDEO_REPLACE_API) && !isVideoReplaceInstaller(relativePath)) {
        violations.push({
          file: relativePath,
          line: index + 1,
          rule: `${VIDEO_REPLACE_API} may only be installed from ${VIDEO_REPLACE_INSTALLER}`,
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

function isVideoReplaceInstaller(relativePath: string): boolean {
  if (relativePath === VIDEO_REPLACE_INSTALLER) {
    return true;
  }
  // Tests may name the API to assert the installer was called with it. A product file that
  // names it is a second policy, which is the thing the rule exists to stop.
  return relativePath.endsWith('.test.ts') || relativePath.endsWith('.test.tsx');
}
