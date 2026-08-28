import { repoRoot } from '../paths.js';
import { USAGE, parseA11yArgs, runA11yCheck } from '../a11y.js';

/**
 * `pnpm --filter @minidrama/quality check:a11y` — the QA-010 L1 job.
 *
 * Argument parsing, axe-core, and the contrast checker live in `a11y.ts` so Vitest
 * coverage can see them. This file is the process boundary L1 CI and `pnpm verify` exec.
 *
 * Host is jsdom, not TikTok WebView. Tests are not skipped.
 */

const parsed = parseA11yArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = await runA11yCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
