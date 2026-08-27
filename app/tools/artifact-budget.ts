import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * G2.6 (`docs/14-quality-gates.md` §4): the client ZIP is measured against numbers that already
 * exist in `docs/03-nonfunctional.md` §2. The L2 job is this module plus a process boundary;
 * folding it into `pnpm verify` would mix merge-level size/backdoor checks with L1 the way
 * folding G2.8 or G2.2 would have.
 *
 * Zip bytes here are the uncompressed sum of files that would enter the ZIP. That is fail-closed
 * against the 20 MB internal cap (the official hard limit is 200 MB): a real ZIP is smaller, and
 * this slot does not add a zip library to pretend otherwise.
 *
 * Debug symbols: a production `vite` build with `sourcemap: false` must not emit `*.map`. Shipping
 * the maps is how a later slot thinks stripping happened because minify was on.
 *
 * Debug switches / test backdoors: the needles are the shapes already used to enable test-login
 * and the payment-bypass flags G2.6 names. They must not appear in the hosted artifact. Scanning
 * the word `DEBUG` alone would false-green nothing and false-red a comment; the assignment form
 * is the backdoor.
 */

/** Internal Mini Program ZIP cap from `docs/03-nonfunctional.md` §2. */
export const ZIP_BUDGET_BYTES = 20 * 1024 * 1024;
/** First-screen JS gzip cap from `docs/03-nonfunctional.md` §2. */
export const FIRST_SCREEN_JS_GZIP_BUDGET_BYTES = 300 * 1024;

const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
const MODULEPRELOAD_RE = /<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi;
const HREF_RE = /\bhref=["']([^"']+)["']/i;

export const DEBUG_NEEDLES = [
  'DEBUG=true',
  'MINIDRAMA_TEST_LOGIN',
  'yes-i-am-a-non-production-test-deployment',
  'PAYMENT_BYPASS',
  'SKIP_PAYMENT',
] as const;

export type ArtifactBudgetInput = {
  readonly distDir: string;
  readonly zipBudgetBytes?: number;
  readonly firstScreenJsGzipBudgetBytes?: number;
};

export type ArtifactBudgetReport = {
  readonly shippedFiles: readonly string[];
  readonly zipBytes: number;
  readonly zipBudgetBytes: number;
  readonly firstScreenJsGzipBytes: number;
  readonly firstScreenJsGzipBudgetBytes: number;
  readonly emptyFiles: readonly string[];
  readonly mapFiles: readonly string[];
  readonly debugHits: readonly { readonly file: string; readonly needle: string }[];
};

export class ArtifactBudgetError extends Error {
  readonly report: ArtifactBudgetReport;
  constructor(message: string, report: ArtifactBudgetReport) {
    super(message);
    this.name = 'ArtifactBudgetError';
    this.report = report;
  }
}

export function isExternalAssetRef(src: string): boolean {
  return /^(?:https?:)?\/\//.test(src) || src.startsWith('data:');
}

export function extractScriptSrcs(html: string): string[] {
  const srcs: string[] = [];
  for (const match of html.matchAll(SCRIPT_SRC_RE)) {
    const src = match[1]?.trim();
    if (src !== undefined && src.length > 0) srcs.push(src);
  }
  return srcs;
}

export function extractModulepreloadHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const tag of html.matchAll(MODULEPRELOAD_RE)) {
    const href = tag[0]?.match(HREF_RE)?.[1]?.trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

export function extractLocalJsRefs(html: string): string[] {
  return [...extractScriptSrcs(html), ...extractModulepreloadHrefs(html)].filter(
    (src) => !isExternalAssetRef(src),
  );
}

export function listShippedFiles(distDir: string): string[] {
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    throw new Error(`dist directory not found: ${distDir}`);
  }
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = resolve(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(full);
    }
  };
  walk(distDir);
  return out;
}

function posixRel(distDir: string, file: string): string {
  return posix.normalize(relative(distDir, file).split('\\').join('/'));
}

export function resolveLocalAsset(distDir: string, src: string): string | undefined {
  const pathPart = (src.split('?')[0] ?? src).split('#')[0] ?? src;
  if (pathPart.length === 0 || isExternalAssetRef(pathPart)) return undefined;
  const absDist = resolve(distDir);
  const candidate = resolve(absDist, pathPart.replace(/^\//, ''));
  const prefix = absDist.endsWith('/') ? absDist : `${absDist}/`;
  if (candidate !== absDist && !candidate.startsWith(prefix)) return undefined;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return undefined;
}

export function measureFirstScreenJsGzip(distDir: string, html: string): number {
  let total = 0;
  for (const src of extractLocalJsRefs(html)) {
    const file = resolveLocalAsset(distDir, src);
    if (file === undefined) {
      throw new Error(`first-screen script src not found on disk: ${src}`);
    }
    total += gzipSync(readFileSync(file)).length;
  }
  return total;
}

export function inspectArtifactBudget(input: ArtifactBudgetInput): ArtifactBudgetReport {
  const zipBudgetBytes = input.zipBudgetBytes ?? ZIP_BUDGET_BYTES;
  const firstScreenJsGzipBudgetBytes =
    input.firstScreenJsGzipBudgetBytes ?? FIRST_SCREEN_JS_GZIP_BUDGET_BYTES;
  const files = listShippedFiles(input.distDir);
  const emptyFiles: string[] = [];
  const mapFiles: string[] = [];
  const debugHits: { file: string; needle: string }[] = [];
  let zipBytes = 0;

  for (const file of files) {
    const rel = posixRel(input.distDir, file);
    const st = statSync(file);
    if (st.size === 0) emptyFiles.push(rel);
    if (rel.endsWith('.map')) mapFiles.push(rel);
    zipBytes += st.size;
    const text = readFileSync(file, 'utf8');
    for (const needle of DEBUG_NEEDLES) {
      if (text.includes(needle)) debugHits.push({ file: rel, needle });
    }
  }

  const indexHtml = resolve(input.distDir, 'index.html');
  if (!existsSync(indexHtml) || !statSync(indexHtml).isFile()) {
    throw new Error(`index.html missing under ${input.distDir}`);
  }
  const firstScreenJsGzipBytes = measureFirstScreenJsGzip(
    input.distDir,
    readFileSync(indexHtml, 'utf8'),
  );

  return {
    shippedFiles: files.map((file) => posixRel(input.distDir, file)),
    zipBytes,
    zipBudgetBytes,
    firstScreenJsGzipBytes,
    firstScreenJsGzipBudgetBytes,
    emptyFiles,
    mapFiles,
    debugHits,
  };
}

export function formatArtifactBudgetFailure(report: ArtifactBudgetReport): string {
  const parts: string[] = [];
  if (report.zipBytes > report.zipBudgetBytes) {
    parts.push(
      `zip payload ${String(report.zipBytes)} bytes exceeds ${String(report.zipBudgetBytes)} (docs/03-nonfunctional.md §2)`,
    );
  }
  if (report.firstScreenJsGzipBytes > report.firstScreenJsGzipBudgetBytes) {
    parts.push(
      `first-screen JS gzip ${String(report.firstScreenJsGzipBytes)} bytes exceeds ${String(report.firstScreenJsGzipBudgetBytes)}`,
    );
  }
  if (report.emptyFiles.length > 0) {
    parts.push(`empty files: ${report.emptyFiles.join(', ')}`);
  }
  if (report.mapFiles.length > 0) {
    parts.push(`debug symbols (.map) shipped: ${report.mapFiles.join(', ')}`);
  }
  if (report.debugHits.length > 0) {
    parts.push(
      `debug/test backdoors: ${report.debugHits.map((hit) => `${hit.file}:${hit.needle}`).join('; ')}`,
    );
  }
  return parts.join('; ');
}

export function assertArtifactBudget(input: ArtifactBudgetInput): ArtifactBudgetReport {
  const report = inspectArtifactBudget(input);
  const message = formatArtifactBudgetFailure(report);
  if (message.length > 0) {
    throw new ArtifactBudgetError(message, report);
  }
  return report;
}

export function formatArtifactBudgetPassed(report: ArtifactBudgetReport): string {
  return (
    `artifact budget passed: zip ${String(report.zipBytes)}/${String(report.zipBudgetBytes)} bytes, ` +
    `first-screen JS gzip ${String(report.firstScreenJsGzipBytes)}/${String(report.firstScreenJsGzipBudgetBytes)} bytes, ` +
    `${String(report.shippedFiles.length)} files`
  );
}

export const ARTIFACT_CLI_USAGE = 'usage: check-artifact --dist <artifact-dir>';

interface ParsedArgs {
  readonly distDir: string;
}

export type ParseArtifactArgsResult =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly message: string };

export function parseArtifactArgs(argv: readonly string[], cwd: string): ParseArtifactArgsResult {
  let distDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--dist') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, message: '--dist requires a directory' };
    }
    distDir = resolve(cwd, value);
    index += 1;
  }

  if (distDir === undefined) {
    return {
      ok: false,
      message: '--dist is required: the artifact directory is named, not guessed',
    };
  }

  return { ok: true, args: { distDir } };
}

export interface CliIo {
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
}

/**
 * The G2.6 L2 entry, minus `process.exit`. `--dist` is required the same way guardrails name the
 * artifact: a missing directory must fail rather than scan `cwd` and report success on nothing.
 */
export function runCheckArtifactCli(
  argv: readonly string[],
  cwd: string = process.cwd(),
  io: CliIo = process,
): number {
  const parsed = parseArtifactArgs(argv, cwd);
  if (!parsed.ok) {
    io.stderr.write(`${parsed.message}\n${ARTIFACT_CLI_USAGE}\n`);
    return 2;
  }

  try {
    const report = assertArtifactBudget({ distDir: parsed.args.distDir });
    io.stdout.write(`${formatArtifactBudgetPassed(report)}\n`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}
