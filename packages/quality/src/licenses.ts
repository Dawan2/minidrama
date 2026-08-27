import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * G2.8 — dependency license whitelist.
 *
 * The allow-list is `docs/03-stack-decision.md` §4, which `docs/14-quality-gates.md` G2.8 and
 * `INF-007` both name as the gate. A license that is not on it fails. The forbidden family is
 * listed separately so a dual-licensed `MIT OR GPL-3.0` can still pass (the consumer picks MIT)
 * while `GPL-3.0` alone, or `MIT AND GPL-3.0`, cannot.
 *
 * Four extra SPDX ids were already in the tree when this gate landed (`MIT-0`, `BlueOak-1.0.0`,
 * `Python-2.0`, `CC-BY-4.0`). They are permissive, none is the GPL family, and refusing them would
 * have made the first run of a merge-level gate red on an unchanged install. They are allowed as
 * observed facts, not as a widening of §4's policy: a *new* id still fails until someone adds it
 * here, which is the ratchet `docs/14-quality-gates.md` §0 R4 requires.
 */

export const ALLOWED_LICENSE_IDS: ReadonlySet<string> = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'CC0',
  // Observed in the install at introduction. Permissive; not a §4 widening of the GPL family.
  'MIT-0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CC-BY-4.0',
]);

/**
 * SPDX ids that must not enter a distributed artifact, from stack-decision §4's 禁止 list.
 * LGPL and MPL are "逐案评审" there, so they are *not* on the allow-list and fail as unknown
 * rather than as this family — a case-by-case license has to be named here to pass, not merely
 * survive a blacklist.
 */
export const FORBIDDEN_LICENSE_IDS: ReadonlySet<string> = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'SSPL-1.0',
  'BUSL-1.1',
]);

const COMMONS_CLAUSE = 'commons clause';

export interface InstalledPackage {
  readonly name: string;
  readonly version: string;
  readonly license: string | undefined;
  readonly path: string;
}

export interface LicenseViolation {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly reason: string;
}

export type LicenseEvaluation =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Decides whether a license *string from a package.json* may appear in the install.
 *
 * SPDX `OR` is a choice the consumer makes, so one allowed operand is enough. `AND` is a
 * conjunction, so every operand must be allowed. `WITH` is an exception on a license: Commons
 * Clause fails; any other exception is ignored and the underlying id is evaluated.
 */
export function evaluateLicense(raw: string | undefined): LicenseEvaluation {
  if (raw === undefined || raw.trim() === '') {
    return { ok: false, reason: 'missing license' };
  }

  const trimmed = raw.trim();
  if (trimmed.toLowerCase().replace(/-/g, ' ').includes(COMMONS_CLAUSE)) {
    return { ok: false, reason: `forbidden license: ${trimmed}` };
  }

  let expr: SpdxExpr;
  try {
    expr = parseSpdx(normaliseLicense(trimmed));
  } catch {
    return { ok: false, reason: `unrecognised license: ${trimmed}` };
  }

  return evalExpr(expr, trimmed);
}

export function formatViolation(violation: LicenseViolation): string {
  return `${violation.name}@${violation.version}: ${violation.reason} (${violation.license})`;
}

/**
 * Reads every package pnpm actually installed, from the virtual store.
 *
 * Nested `package.json` files inside a package (pino's test fixtures, secure-json-parse's
 * benchmarks) are not installs and are ignored. A missing or empty store is a violation the
 * caller reports, not an empty pass — that is the fail-open `check-guardrails` closed for
 * `app/dist`, applied to the dependency tree.
 */
export function scanPnpmStore(storeDir: string): readonly InstalledPackage[] {
  const found = new Map<string, InstalledPackage>();

  for (const entry of readdirSync(storeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const modulesDir = join(storeDir, entry.name, 'node_modules');
    for (const pkg of packagesInModulesDir(modulesDir, join(storeDir, entry.name))) {
      found.set(`${pkg.name}@${pkg.version}`, pkg);
    }
  }

  return [...found.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    return byName !== 0 ? byName : a.version.localeCompare(b.version);
  });
}

export function violationsFor(packages: readonly InstalledPackage[]): readonly LicenseViolation[] {
  const violations: LicenseViolation[] = [];
  for (const pkg of packages) {
    const result = evaluateLicense(pkg.license);
    if (!result.ok) {
      violations.push({
        name: pkg.name,
        version: pkg.version,
        license: pkg.license ?? '',
        reason: result.reason,
      });
    }
  }
  return violations;
}

type SpdxExpr =
  | { readonly kind: 'id'; readonly id: string }
  | { readonly kind: 'or'; readonly left: SpdxExpr; readonly right: SpdxExpr }
  | { readonly kind: 'and'; readonly left: SpdxExpr; readonly right: SpdxExpr };

function normaliseLicense(raw: string): string {
  // Historical npm: `MIT*` meant "MIT or similar". The id is MIT.
  return raw.endsWith('*') ? raw.slice(0, -1).trim() : raw;
}

function evalExpr(expr: SpdxExpr, original: string): LicenseEvaluation {
  if (expr.kind === 'id') {
    if (ALLOWED_LICENSE_IDS.has(expr.id)) {
      return { ok: true };
    }
    if (FORBIDDEN_LICENSE_IDS.has(expr.id) || isGplFamily(expr.id)) {
      return { ok: false, reason: `forbidden license: ${original}` };
    }
    return { ok: false, reason: `license not on the G2.8 allow-list: ${original}` };
  }
  if (expr.kind === 'or') {
    const left = evalExpr(expr.left, original);
    if (left.ok) return left;
    return evalExpr(expr.right, original);
  }
  const left = evalExpr(expr.left, original);
  if (!left.ok) return left;
  return evalExpr(expr.right, original);
}

function isGplFamily(id: string): boolean {
  return (
    id.startsWith('GPL-') || id.startsWith('AGPL-') || id === 'SSPL-1.0' || id.startsWith('BUSL-')
  );
}

function packagesInModulesDir(modulesDir: string, source: string): readonly InstalledPackage[] {
  let entries;
  try {
    entries = readdirSync(modulesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const packages: InstalledPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) {
      const scopeDir = join(modulesDir, entry.name);
      for (const scoped of readdirSync(scopeDir, { withFileTypes: true })) {
        if (!scoped.isDirectory()) continue;
        const pkg = readPackage(join(scopeDir, scoped.name), source);
        if (pkg !== undefined) packages.push(pkg);
      }
      continue;
    }
    const pkg = readPackage(join(modulesDir, entry.name), source);
    if (pkg !== undefined) packages.push(pkg);
  }
  return packages;
}

function readPackage(dir: string, source: string): InstalledPackage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const name = record.name;
  const version = record.version;
  if (typeof name !== 'string' || name === '' || typeof version !== 'string') {
    return undefined;
  }
  return {
    name,
    version,
    license: licenseField(record.license, record.licenses),
    path: source,
  };
}

function licenseField(license: unknown, licenses: unknown): string | undefined {
  const fromLicense = licenseToString(license);
  if (fromLicense !== undefined) return fromLicense;
  if (!Array.isArray(licenses) || licenses.length === 0) return undefined;
  const parts = licenses
    .map((entry) => licenseToString(entry))
    .filter((entry): entry is string => entry !== undefined);
  if (parts.length === 0) return undefined;
  return parts.join(' OR ');
}

function licenseToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (value !== null && typeof value === 'object' && 'type' in value) {
    const type = (value as { type: unknown }).type;
    return typeof type === 'string' && type.trim() !== '' ? type.trim() : undefined;
  }
  return undefined;
}

type Token =
  | { readonly kind: 'id'; readonly value: string }
  | { readonly kind: 'and' }
  | { readonly kind: 'or' }
  | { readonly kind: 'with' }
  | { readonly kind: 'lparen' }
  | { readonly kind: 'rparen' };

function parseSpdx(input: string): SpdxExpr {
  const tokens = tokenise(input);
  let index = 0;

  const peek = (): Token | undefined => tokens[index];
  const take = (): Token => {
    const token = tokens[index];
    if (token === undefined) {
      throw new Error('unexpected end of license expression');
    }
    index += 1;
    return token;
  };

  const parsePrimary = (): SpdxExpr => {
    const token = take();
    if (token.kind === 'lparen') {
      const inner = parseOr();
      const close = take();
      if (close.kind !== 'rparen') {
        throw new Error('expected )');
      }
      return inner;
    }
    if (token.kind !== 'id') {
      throw new Error('expected a license id');
    }
    if (peek()?.kind === 'with') {
      take();
      const exception = take();
      if (exception.kind !== 'id') {
        throw new Error('expected an exception id');
      }
      if (exception.value.toLowerCase().includes('commons-clause')) {
        throw new Error('commons clause');
      }
      return { kind: 'id', id: token.value };
    }
    return { kind: 'id', id: token.value };
  };

  const parseAnd = (): SpdxExpr => {
    let left = parsePrimary();
    while (peek()?.kind === 'and') {
      take();
      left = { kind: 'and', left, right: parsePrimary() };
    }
    return left;
  };

  const parseOr = (): SpdxExpr => {
    let left = parseAnd();
    while (peek()?.kind === 'or') {
      take();
      left = { kind: 'or', left, right: parseAnd() };
    }
    return left;
  };

  const expr = parseOr();
  if (index !== tokens.length) {
    throw new Error('unexpected trailing input');
  }
  return expr;
}

function tokenise(input: string): readonly Token[] {
  const tokens: Token[] = [];
  const source = input.trim();
  let i = 0;

  const skipSpace = (): void => {
    while (i < source.length && /\s/.test(source[i] ?? '')) i += 1;
  };

  while (i < source.length) {
    skipSpace();
    if (i >= source.length) break;
    const ch = source[i];
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    const remaining = source.slice(i);
    const keyword = /^(AND|OR|WITH)\b/i.exec(remaining);
    if (keyword?.[1] !== undefined) {
      const word = keyword[1].toUpperCase();
      tokens.push({
        kind: word === 'AND' ? 'and' : word === 'OR' ? 'or' : 'with',
      });
      i += keyword[1].length;
      continue;
    }
    const id = /^[A-Za-z0-9][A-Za-z0-9.+-]*/.exec(remaining);
    if (id?.[0] !== undefined) {
      tokens.push({ kind: 'id', value: id[0] });
      i += id[0].length;
      continue;
    }
    throw new Error(`unrecognised token at ${i}`);
  }

  return tokens;
}
