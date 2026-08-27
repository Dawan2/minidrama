/**
 * Post-build scan of the emitted bundle.
 *
 * Lint rules catch the prohibited constructs in *our* source. This catches them in the artifact
 * that actually gets uploaded — including anything a dependency contributed. The platform runs
 * its own code scan at upload time; finding a violation here costs a minute, finding it there
 * costs a review cycle (`docs/architecture/tech-stack.md` §6).
 */

export interface BundleViolation {
  readonly file: string;
  readonly rule: string;
  readonly evidence: string;
}

interface BundleRule {
  readonly rule: string;
  readonly pattern: RegExp;
}

const BUNDLE_RULES: readonly BundleRule[] = [
  { rule: 'no eval', pattern: /\beval\s*\(/ },
  { rule: 'no Function constructor', pattern: /\bnew\s+Function\s*\(/ },
  {
    rule: 'no string-form setTimeout/setInterval',
    pattern: /\bset(?:Timeout|Interval)\s*\(\s*(['"`])/,
  },
  { rule: 'no iframe element', pattern: /createElement\s*\(\s*(['"`])iframe\1/ },
  { rule: 'no native video element', pattern: /createElement\s*\(\s*(['"`])video\1/ },
  { rule: 'no third-party media player', pattern: /\b(?:hls\.js|videojs|shaka-player|dashjs)\b/ },
  { rule: 'no remote script injection', pattern: /\.src\s*=\s*['"`]https?:\/\// },
];

/**
 * Source maps legitimately contain the original text of anything, including these patterns, so
 * scanning them produces only false positives. The artifact chunks are what the platform reads.
 */
export function isScannableBundleFile(file: string): boolean {
  return /\.(?:js|mjs|cjs|css|html)$/.test(file) && !file.endsWith('.map');
}

export function scanBundleText(file: string, text: string): readonly BundleViolation[] {
  const violations: BundleViolation[] = [];
  for (const { rule, pattern } of BUNDLE_RULES) {
    const match = pattern.exec(text);
    if (match) {
      violations.push({ file, rule, evidence: excerpt(text, match.index) });
    }
  }
  return violations;
}

function excerpt(text: string, index: number): string {
  return text.slice(Math.max(0, index - 30), index + 50).replace(/\s+/g, ' ');
}
