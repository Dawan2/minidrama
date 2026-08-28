import { repoRoot } from '../paths.js';
import { USAGE, parseAuditArgs, runAuditCheck } from '../audit.js';

/**
 * `pnpm --filter @minidrama/quality check:audit` — the INF-004 L1 job
 * (S-C1 / S-C2 `if: false` / S-C3 echo-only).
 *
 * Argument parsing and the scan live in `audit.ts` so Vitest coverage can see them.
 * This file is the process boundary L1 CI and `pnpm verify` actually exec.
 */

const parsed = parseAuditArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runAuditCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
