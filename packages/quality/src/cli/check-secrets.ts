import { repoRoot } from '../paths.js';
import { USAGE, parseSecretsArgs, runSecretsCheck } from '../secrets.js';

/**
 * `pnpm --filter @minidrama/quality check:secrets` — the G1.8 L1 job.
 *
 * Argument parsing and the Gitleaks cycle live in `secrets.ts` so Vitest coverage can see them.
 * This file is the process boundary L1 CI actually execs.
 */

const parsed = parseSecretsArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runSecretsCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
