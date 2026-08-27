import { repoRoot } from '../paths.js';
import { USAGE, parseSkipArgs, runSkipCheck } from '../skips.js';

/**
 * `pnpm --filter @minidrama/quality check:skips` — the G1.10 L1 job.
 *
 * Argument parsing and the scan live in `skips.ts` so Vitest coverage can see them.
 * This file is the process boundary L1 CI and `pnpm verify` actually exec.
 */

const parsed = parseSkipArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runSkipCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
