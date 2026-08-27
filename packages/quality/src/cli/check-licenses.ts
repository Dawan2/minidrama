import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { formatViolation, scanPnpmStore, violationsFor } from '../licenses.js';
import { repoRoot } from '../paths.js';

/**
 * Runs G2.8 against a named pnpm virtual store and exits non-zero on any violation.
 *
 * The store directory is named rather than guessed from `cwd`, for the same reason
 * `check-guardrails` requires `--dist`: a missing tree must fail, not report that zero packages
 * were a clean install.
 */

const USAGE = 'usage: check-licenses [--root <repo-root>]';

interface ParsedArgs {
  readonly root: string;
}

type ParseResult =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly message: string };

function parseArgs(argv: readonly string[], defaultRoot: string): ParseResult {
  let root = defaultRoot;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--root') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, message: `${flag} requires a directory` };
    }
    root = value;
    index += 1;
  }

  return { ok: true, args: { root } };
}

const parsed = parseArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const storeDir = join(parsed.args.root, 'node_modules', '.pnpm');

if (!existsSync(storeDir) || !statSync(storeDir).isDirectory()) {
  process.stderr.write(
    'the dependency store is required: node_modules/.pnpm is absent or not a directory\n',
  );
  process.exit(1);
}

const packages = scanPnpmStore(storeDir);
if (packages.length === 0) {
  process.stderr.write(
    'the dependency store is empty: a license check that saw no packages has not run\n',
  );
  process.exit(1);
}

const violations = violationsFor(packages);
if (violations.length > 0) {
  process.stderr.write(`license whitelist failed (${String(violations.length)}):\n`);
  for (const violation of violations) {
    process.stderr.write(`  ${formatViolation(violation)}\n`);
  }
  process.exit(1);
}

process.stdout.write(`license whitelist passed (${String(packages.length)} packages)\n`);
