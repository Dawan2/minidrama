import { repoRoot } from '../paths.js';
import { USAGE, parseContractArgs, runContractCheck } from '../contract.js';

/**
 * `pnpm --filter @minidrama/quality check:contract` — the G1.6 L1 job.
 *
 * Argument parsing and the oasdiff cycle live in `contract.ts` so Vitest coverage can see them.
 * This file is the process boundary L1 CI actually execs.
 */

const parsed = parseContractArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runContractCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
