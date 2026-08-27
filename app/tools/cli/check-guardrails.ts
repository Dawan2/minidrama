import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatViolation, runGuardrailSuite } from '../guardrail-suite.js';

/**
 * Runs every platform guardrail that needs real files rather than an AST, and exits non-zero on any
 * violation. Wired into CI after `build`; the unit tests cover the same rules on fixtures.
 *
 * The artifact directory is a required argument rather than a path derived from this file's
 * location. Naming it makes the check survive a repository layout change instead of quietly
 * scanning nothing, and there is deliberately no flag that lets a missing artifact pass.
 */

const USAGE = 'usage: check-guardrails --dist <artifact-dir> [--app-root <dir>]';

interface ParsedArgs {
  readonly distDir: string;
  readonly appRoot: string;
}

type ParseResult =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly message: string };

function parseArgs(argv: readonly string[], cwd: string, defaultAppRoot: string): ParseResult {
  let distDir: string | undefined;
  let appRoot = defaultAppRoot;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--dist' && flag !== '--app-root') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, message: `${flag} requires a directory` };
    }
    if (flag === '--dist') {
      distDir = resolve(cwd, value);
    } else {
      appRoot = resolve(cwd, value);
    }
    index += 1;
  }

  if (distDir === undefined) {
    return {
      ok: false,
      message: '--dist is required: the artifact directory is named, not guessed',
    };
  }

  return { ok: true, args: { distDir, appRoot } };
}

const parsed = parseArgs(
  process.argv.slice(2),
  process.cwd(),
  fileURLToPath(new URL('../../', import.meta.url)),
);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const violations = runGuardrailSuite(parsed.args);

if (violations.length > 0) {
  process.stderr.write(`platform guardrails failed (${String(violations.length)}):\n`);
  for (const violation of violations) {
    process.stderr.write(`  ${formatViolation(violation)}\n`);
  }
  process.exit(1);
}

process.stdout.write(`platform guardrails passed (artifact: ${parsed.args.distDir})\n`);
