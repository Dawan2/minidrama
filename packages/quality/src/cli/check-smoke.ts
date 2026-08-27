import { repoRoot } from '../paths.js';
import { USAGE, parseSmokeArgs, runSmokeCheck } from '../smoke.js';

/**
 * `pnpm --filter @minidrama/quality check:smoke` — the G2.3 L2 job.
 *
 * Argument parsing, preflight, and the Playwright invocation live in `smoke.ts` so Vitest
 * coverage can see them. This file is the process boundary the L2 job actually execs.
 */

const parsed = parseSmokeArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = await runSmokeCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
