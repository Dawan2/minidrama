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

/**
 * The elements TikTok replaces with a blocked UI.
 *
 * The same ban is stated once per layer, because each layer reads a different artifact: the JSX
 * and `createElement` selectors in `eslint.config.js` read our AST, `FORBIDDEN_ELEMENTS` in
 * `html-integrity.ts` reads the document, and this list reads the emitted chunks. Keep them in
 * step — an element banned in two of the three is banned in none of them.
 */
export const BANNED_ELEMENTS = ['video', 'audio', 'iframe', 'object', 'embed'] as const;

/**
 * The call shapes that put a banned element into an emitted chunk.
 *
 * Matching `createElement` alone was not enough, and had not been since the app was written.
 * React 19 compiles JSX through the automatic runtime, so a `<video>` in a component is emitted
 * as `jsx("video", …)` — a shape this scan never looked at. A native player could therefore reach
 * the artifact with `check:guardrails` green, which is the one outcome the scan exists to prevent.
 *
 * The third shape is the one that survives minification. esbuild renames the runtime import
 * (`import { jsx as o }`), so the emitted call has no recognisable callee left to match; what it
 * cannot rewrite is the argument list, and an element factory is recognisable there — a quoted
 * element name followed by a props argument. That also covers any other factory spelling,
 * including a bundled `h()` from a dependency.
 */
function elementCallPatterns(element: string): readonly RegExp[] {
  const name = `(['"\`])${element}\\1`;
  return [
    new RegExp(`createElement\\s*\\(\\s*${name}`),
    // `jsx`, `jsxs`, `jsxDEV`, Babel's `_`-prefixed aliases, and the `runtime.jsx(…)` form the
    // production build actually emits when the runtime arrives as a CommonJS namespace.
    new RegExp(`(?<![\\w$])_?jsxs?(?:DEV)?\\s*\\(\\s*${name}`),
    new RegExp(`\\(\\s*${name}\\s*,\\s*(?:\\{|null\\b|void 0)`),
  ];
}

const BUNDLE_RULES: readonly BundleRule[] = [
  { rule: 'no eval', pattern: /\beval\s*\(/ },
  { rule: 'no Function constructor', pattern: /\bnew\s+Function\s*\(/ },
  {
    rule: 'no string-form setTimeout/setInterval',
    pattern: /\bset(?:Timeout|Interval)\s*\(\s*(['"`])/,
  },
  ...BANNED_ELEMENTS.flatMap((element) =>
    elementCallPatterns(element).map((pattern) => ({ rule: `no <${element}> element`, pattern })),
  ),
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
    // One rule can be spelled as several patterns. Reporting it once is enough to fail the build,
    // and repeating it three times only makes the failure harder to read.
    if (violations.some((violation) => violation.rule === rule)) {
      continue;
    }
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
