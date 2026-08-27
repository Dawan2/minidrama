import { repoRoot } from '../paths.js';
import { USAGE, parseSastArgs, runSastCheck } from '../sast.js';

/**
 * `pnpm --filter @minidrama/quality check:sast` — the G2.4 L2 job.
 *
 * Argument parsing and the Semgrep cycle live in `sast.ts` so Vitest coverage can see them.
 * This file is the process boundary the L2 job actually execs.
 */

const parsed = parseSastArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runSastCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
