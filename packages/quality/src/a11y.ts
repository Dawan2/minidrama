import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, relative } from 'node:path';

/**
 * QA-010: a11y scan. axe-core critical + serious = 0 on committed
 * implemented-screen HTML, plus a WCAG contrast check on declared CSS colors.
 *
 * Smallest job scanned SCR-13 only. Later remainders added SCR-02 (home),
 * SCR-03 (browse / theatre), SCR-04 (drama detail), SCR-05 (player),
 * SCR-06 (profile / `#/me`), and SCR-08 (favourites / `#/favorites`). This
 * remainder adds SCR-07 (history / continue watching), the second unblocked
 * C7 screen. Deleting any required stem is red. Remaining SCR/PNL fixtures
 * are later remainders.
 *
 * This module invokes axe-core. A TypeScript comment that names WCAG is not
 * QA-010. jsdom is the host: color-contrast stays incomplete without canvas, so
 * the reverse verification (an injected contrast failure) is the equivalent
 * checker, not a skipped axe rule. The rule is not disabled.
 *
 * This is **not** a TikTok WebView measurement. X-04 / PLY-002 stay unmeasured.
 * Protocol-C4 exit 3 / S-A1 on every SCR/PNL is not this slice.
 *
 * Folded into `pnpm verify`: axe-core is an npm dep, the same way G1.10 has no
 * extra binary. L1 CI also runs it as a named step.
 */

export const USAGE = 'usage: check-a11y [--root <repo-root>] [--source <path>]';

export const BLOCKING_IMPACTS = ['critical', 'serious'] as const;

export const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'] as const;

export const REQUIRED_SCREEN_STEMS = [
  'scr-02-home',
  'scr-03-browse',
  'scr-04-drama',
  'scr-05-play',
  'scr-06-profile',
  'scr-07-history',
  'scr-08-favorites',
  'scr-13-fallback',
] as const;

export const CONTRAST_MIN = 4.5;

export const A11Y_HOST = 'jsdom';

export const A11Y_HOST_DISCLAIMER = 'not TikTok WebView';

export const A11Y_PAGE_URL = 'http://127.0.0.1/qa-010/';

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git']);

const GLOBAL_SLOTS = [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'NodeList',
  'getComputedStyle',
] as const;

export interface A11yCheckArgs {
  readonly root: string;
  readonly source: string;
}

export type ParseA11yArgsResult =
  | { readonly ok: true; readonly args: A11yCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface A11yCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface AxeViolation {
  readonly id: string;
  readonly impact: string | null;
  readonly help: string;
  readonly nodes: ReadonlyArray<{ readonly html: string }>;
}

export type AxeRun = (html: string) => Promise<readonly AxeViolation[]>;

export type A11yHitKind = 'axe' | 'contrast';

export interface A11yHit {
  readonly file: string;
  readonly kind: A11yHitKind;
  readonly id: string;
  readonly excerpt: string;
}

interface AxeModule {
  run(
    context: unknown,
    options: {
      readonly resultTypes: readonly string[];
      readonly runOnly: { readonly type: 'tag'; readonly values: readonly string[] };
    },
  ): Promise<{ readonly violations: readonly AxeViolation[] }>;
}

interface JsdomWindow {
  readonly document: { readonly documentElement: unknown };
  readonly Node: unknown;
  readonly Element: unknown;
  readonly HTMLElement: unknown;
  readonly NodeList: unknown;
  getComputedStyle: (...args: never[]) => unknown;
  close(): void;
}

const require = createRequire(import.meta.url);

export function defaultSource(root: string): string {
  return join(root, 'packages', 'quality', 'a11y', 'screens');
}

export function parseA11yArgs(argv: readonly string[], defaultRoot: string): ParseA11yArgsResult {
  let root = defaultRoot;
  let source: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue = flag === '--root' || flag === '--source';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--root' ? 'directory' : 'path';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--source') source = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      source: source ?? defaultSource(root),
    },
  };
}

export function isScreenFileName(name: string): boolean {
  return name.endsWith('.html');
}

export function listScreenFiles(source: string): string[] {
  const out: string[] = [];
  const stack = [source];

  while (stack.length > 0) {
    const dir = stack.pop() ?? '';
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isScreenFileName(entry.name)) out.push(full);
    }
  }

  return out.sort();
}

export function missingRequiredScreenStems(files: readonly string[]): string[] {
  const stems = new Set(files.map((name) => basename(name, '.html')));
  return REQUIRED_SCREEN_STEMS.filter((stem) => !stems.has(stem));
}

export function toRepoFile(abs: string, root: string): string {
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..')) return abs;
  return rel.split('\\').join('/');
}

export function isBlockingImpact(impact: string | null): boolean {
  return impact === 'critical' || impact === 'serious';
}

export function blockingViolations(violations: readonly AxeViolation[]): readonly AxeViolation[] {
  return violations.filter((violation) => isBlockingImpact(violation.impact));
}

export function parseCssHex(value: string): readonly [number, number, number] | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  const hex = match?.[1];
  if (hex === undefined) return null;
  if (hex.length === 3) {
    const r = hex[0];
    const g = hex[1];
    const b = hex[2];
    if (r === undefined || g === undefined || b === undefined) return null;
    return [parseInt(`${r}${r}`, 16), parseInt(`${g}${g}`, 16), parseInt(`${b}${b}`, 16)];
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function firstHex(value: string): readonly [number, number, number] | null {
  const match = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(value);
  if (match === null || match[0] === undefined) return null;
  return parseCssHex(match[0]);
}

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * srgbChannel(rgb[0]) + 0.7152 * srgbChannel(rgb[1]) + 0.0722 * srgbChannel(rgb[2]);
}

export function contrastRatio(
  fg: readonly [number, number, number],
  bg: readonly [number, number, number],
): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastFromDeclarations(body: string): number | null {
  let color: readonly [number, number, number] | null = null;
  let background: readonly [number, number, number] | null = null;
  for (const raw of body.split(';')) {
    const line = raw.trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const property = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1);
    if (property === 'color') color = firstHex(value);
    if (property === 'background' || property === 'background-color') background = firstHex(value);
  }
  if (color === null || background === null) return null;
  return contrastRatio(color, background);
}

export function scanContrastViolations(html: string, file: string): readonly A11yHit[] {
  const hits: A11yHit[] = [];
  const styleBlocks = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? [];
  const css = [
    ...styleBlocks.map((block) => block.replace(/<\/?style\b[^>]*>/gi, '')),
    ...(html.match(/\bstyle\s*=\s*(['"])[\s\S]*?\1/gi) ?? []).map((attr) => {
      const inner = attr.replace(/^\s*style\s*=\s*['"]/i, '').replace(/['"]$/, '');
      return `inline{${inner}}`;
    }),
  ].join('\n');

  const rule = /([^{}]+)\{([^{}]+)\}/g;
  let match = rule.exec(css);
  while (match !== null) {
    const selector = (match[1] ?? '').trim();
    const body = match[2] ?? '';
    const ratio = contrastFromDeclarations(body);
    if (ratio !== null && ratio < CONTRAST_MIN) {
      hits.push({
        file,
        kind: 'contrast',
        id: 'color-contrast',
        excerpt: `${selector} ${ratio.toFixed(2)}:1 < ${String(CONTRAST_MIN)}:1`,
      });
    }
    match = rule.exec(css);
  }
  return hits;
}

export function formatHit(hit: A11yHit): string {
  return `${hit.kind} ${hit.file} ${hit.id} ${hit.excerpt}`;
}

function fail(message: string): A11yCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}

function loadAxe(): AxeModule {
  try {
    return require('axe-core') as AxeModule;
  } catch {
    throw new Error('axe-core is required: a scan that did not run axe-core is not QA-010');
  }
}

function installGlobals(window: JsdomWindow): Array<PropertyDescriptor | undefined> {
  const globalRecord = globalThis as unknown as Record<string, unknown>;
  const previous = GLOBAL_SLOTS.map((slot) => Object.getOwnPropertyDescriptor(globalThis, slot));
  Object.defineProperty(globalRecord, 'window', {
    configurable: true,
    writable: true,
    value: window,
  });
  Object.defineProperty(globalRecord, 'document', {
    configurable: true,
    writable: true,
    value: window.document,
  });
  Object.defineProperty(globalRecord, 'Node', {
    configurable: true,
    writable: true,
    value: window.Node,
  });
  Object.defineProperty(globalRecord, 'Element', {
    configurable: true,
    writable: true,
    value: window.Element,
  });
  Object.defineProperty(globalRecord, 'HTMLElement', {
    configurable: true,
    writable: true,
    value: window.HTMLElement,
  });
  Object.defineProperty(globalRecord, 'NodeList', {
    configurable: true,
    writable: true,
    value: window.NodeList,
  });
  Object.defineProperty(globalRecord, 'getComputedStyle', {
    configurable: true,
    writable: true,
    value: window.getComputedStyle.bind(window),
  });
  return previous;
}

function restoreGlobals(previous: ReadonlyArray<PropertyDescriptor | undefined>): void {
  const globalRecord = globalThis as unknown as Record<string, unknown>;
  for (let index = 0; index < GLOBAL_SLOTS.length; index += 1) {
    const slot = GLOBAL_SLOTS[index];
    if (slot === undefined) continue;
    const desc = previous[index];
    if (desc === undefined) {
      delete globalRecord[slot];
    } else {
      Object.defineProperty(globalThis, slot, desc);
    }
  }
}

export async function defaultAxeRun(html: string): Promise<readonly AxeViolation[]> {
  const axe = loadAxe();
  let JSDOM: new (
    source: string,
    options: { readonly url: string; readonly pretendToBeVisual: boolean },
  ) => { readonly window: JsdomWindow };
  try {
    ({ JSDOM } = require('jsdom') as { JSDOM: typeof JSDOM });
  } catch {
    throw new Error('jsdom is required: a scan that did not run axe-core is not QA-010');
  }

  const dom = new JSDOM(html, { url: A11Y_PAGE_URL, pretendToBeVisual: true });
  const previous = installGlobals(dom.window);
  try {
    const results = await axe.run(dom.window.document.documentElement, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: A11Y_TAGS },
    });
    return results.violations;
  } finally {
    restoreGlobals(previous);
    dom.window.close();
  }
}

export async function runA11yCheck(
  args: A11yCheckArgs,
  runAxe: AxeRun = defaultAxeRun,
): Promise<A11yCheckOutput> {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return fail('scan root is required: path is absent or not a directory');
  }

  if (!existsSync(args.source) || !statSync(args.source).isDirectory()) {
    return fail(`scan source is required: ${basename(args.source)} is absent or not a directory`);
  }

  const files = listScreenFiles(args.source);
  if (files.length === 0) {
    return fail('scan source has no HTML screens: an a11y scan that saw no screens has not run');
  }

  const missing = missingRequiredScreenStems(files);
  if (missing.length > 0) {
    return fail(
      `required implemented-screen fixture missing: ${missing.join(', ')} (host=${A11Y_HOST}, ${A11Y_HOST_DISCLAIMER})`,
    );
  }

  const hits: A11yHit[] = [];
  for (const abs of files) {
    const file = toRepoFile(abs, args.root);
    const html = readFileSync(abs, 'utf8');
    hits.push(...scanContrastViolations(html, file));
    let violations: readonly AxeViolation[];
    try {
      violations = await runAxe(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'axe-core failed';
      return fail(`${message} (host=${A11Y_HOST}, ${A11Y_HOST_DISCLAIMER})`);
    }
    for (const violation of blockingViolations(violations)) {
      const node = violation.nodes[0]?.html ?? violation.help;
      hits.push({
        file,
        kind: 'axe',
        id: violation.id,
        excerpt: node.replace(/\s+/g, ' ').slice(0, 80),
      });
    }
  }

  const critical = hits.filter((hit) => hit.kind === 'axe' && hit.id !== 'color-contrast').length;
  const listed = hits.map((hit) => `  ${formatHit(hit)}`).join('\n');

  if (hits.length > 0) {
    return fail(
      `a11y failed (${String(hits.length)}): axe-core critical/serious or contrast < ${String(CONTRAST_MIN)}:1 are QA-010 red (host=${A11Y_HOST}, ${A11Y_HOST_DISCLAIMER})\n${listed}`,
    );
  }

  return {
    ok: true,
    exitCode: 0,
    stdout: `a11y passed (${String(files.length)} screens, ${String(critical)} critical, 0 serious, host=${A11Y_HOST}, ${A11Y_HOST_DISCLAIMER})\n`,
    stderr: '',
  };
}
