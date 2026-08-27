import { repoRoot } from '../paths.js';
import { USAGE, parseCodeqlArgs, runCodeqlCheck } from '../codeql.js';

/**
 * `pnpm --filter @minidrama/quality check:codeql` — the G2.4 CodeQL L2 job.
 *
 * Argument parsing and the create/analyze cycle live in `codeql.ts` so Vitest coverage can see
 * them. This file is the process boundary the L2 job actually execs.
 */

const parsed = parseCodeqlArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runCodeqlCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
