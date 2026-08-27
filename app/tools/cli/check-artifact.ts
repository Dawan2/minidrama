#!/usr/bin/env node
import { runCheckArtifactCli } from '../artifact-budget.js';

/**
 * `pnpm --filter @minidrama/app check:artifact` — the G2.6 L2 job.
 *
 * Argument parsing and the budget rules live in `artifact-budget.ts` so Vitest coverage can see
 * them. This file is the process boundary the L2 job actually execs.
 */
process.exit(runCheckArtifactCli(process.argv.slice(2)));
