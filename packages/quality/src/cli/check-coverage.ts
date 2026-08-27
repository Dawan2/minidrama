import { repoRoot } from '../paths.js';
import { USAGE, parseCoverageArgs, runCoverageCheck } from '../run-coverage-check.js';

/**
 * G1.5 entry point. Missing reports, an empty report, or a number under the floor fail.
 * A missing tree must not look like 100% coverage of nothing.
 */

const parsed = parseCoverageArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) {
  process.stderr.write(`${parsed.message}\n${USAGE}\n`);
  process.exit(2);
}

const output = runCoverageCheck(parsed.args);
if (output.stdout !== '') process.stdout.write(output.stdout);
if (output.stderr !== '') process.stderr.write(output.stderr);
process.exit(output.exitCode);
