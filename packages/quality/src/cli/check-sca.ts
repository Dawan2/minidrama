import { repoRoot } from '../paths.js';
import { USAGE, parseScaArgs, runScaCheck } from '../sca.js';

/**
 * `pnpm --filter @minidrama/quality check:sca` — the G2.5 L2 job.
 *
 * Argument parsing and the Trivy cycle live in `sca.ts` so Vitest coverage can see them.
 * This file is the process boundary the L2 job actually execs.
 */

const parsed = parseScaArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runScaCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
