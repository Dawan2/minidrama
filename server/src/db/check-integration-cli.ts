#!/usr/bin/env node
import { runCheckIntegrationCli } from './check-integration.js';

/**
 * `pnpm --filter @minidrama/server check:integration` — the G2.2 L2 job.
 *
 * Argument parsing, the temp sqlite file, and the HTTP cycle live in `check-integration.ts` so
 * Vitest coverage can see them. This file is the process boundary the L2 job actually execs.
 */
process.exit(await runCheckIntegrationCli(process.argv.slice(2)));
