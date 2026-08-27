import { repoRoot } from '../paths.js';
import { USAGE, parseCommitsArgs, runCommitsCheck } from '../commits.js';

/**
 * `pnpm --filter @minidrama/quality check:commits` — the G1.9 L1 job.
 *
 * Argument parsing and the git cycle live in `commits.ts` so Vitest coverage can see them.
 * This file is the process boundary L1 CI actually execs.
 */

const parsed = parseCommitsArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runCommitsCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
