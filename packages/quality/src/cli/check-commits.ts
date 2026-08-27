import { repoRoot } from '../paths.js';
import { USAGE, parseCommitArgs, runCommitCheck } from '../commits.js';

/**
 * `pnpm --filter @minidrama/quality check:commits` — the G1.9 L1 job.
 *
 * Argument parsing and the git log policy live in `commits.ts` so Vitest coverage can see them.
 * This file is the process boundary L1 CI and `pnpm verify` actually exec.
 */

const parsed = parseCommitArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runCommitCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
