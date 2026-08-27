#!/usr/bin/env node
import { runIntegrateCli } from './check-integrate.js';

/**
 * `pnpm --filter @minidrama/server check:integrate` — the G2.2 L2 job.
 * Argument parsing and the cycle live in `check-integrate.ts` so the rules are covered by the
 * library tests. This file is the process the job starts.
 */

process.exit(await runIntegrateCli(process.argv.slice(2)));
