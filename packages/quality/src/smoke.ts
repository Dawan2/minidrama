import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';

import {
  SMOKE_ORIGIN_ENV,
  startSmokeStack,
  type SmokeStack,
  type SmokeStackStarter,
} from './smoke-stack.js';

/**
 * G2.3 (`docs/14-quality-gates.md` §4, `docs/14-test-plan.md` §5 P0, stack-decision D16):
 * Playwright smoke E2E of the built client against a listening HTTP service. A missing binary,
 * a missing `app/dist`, a missing P0 spec, or any failed spec fails — the same fail-open G2.8
 * closed for an absent pnpm store.
 *
 * This module invokes Playwright. A TypeScript grep of data-testid strings is not G2.3.
 *
 * Payment sandbox (E-21 / E-22 / E-24) and BytePlus bytes (E-10 first-frame) stay out: GATE-2,
 * GATE-4, and GATE-8 are unanswered. The P0 subset that exists without those is login → feed,
 * feed → drama → play attempt, and feed → drama → locked-episode unlock panel (E-20 analog).
 * A 503 on playback is the honest GATE-8 surface, not a synthesised `vid`. Opening PNL-02
 * without paying is the honest GATE-2 / GATE-4 surface, not a mock IAP or a Beans rate.
 */

export const USAGE =
  'usage: check-smoke [--root <repo-root>] [--dist <app-dist>] [--specs <specs-dir>] ' +
  '[--config <playwright.config.ts>] [--playwright <binary>]';

export const REQUIRED_SMOKE_SPEC_STEMS = ['login-home', 'browse-play', 'unlock-panel'] as const;

export const SMOKE_ORIGIN_ENV_NAME = SMOKE_ORIGIN_ENV;

export interface SmokeCheckArgs {
  readonly root: string;
  readonly distDir: string;
  readonly specsDir: string;
  readonly configPath: string;
  readonly playwrightBin: string;
}

export type ParseSmokeArgsResult =
  | { readonly ok: true; readonly args: SmokeCheckArgs }
  | { readonly ok: false; readonly message: string };

export interface SmokeCheckOutput {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PlaywrightRunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export type PlaywrightRunner = (options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}) => PlaywrightRunResult | Promise<PlaywrightRunResult>;

export function defaultDistDir(root: string): string {
  return join(root, 'app', 'dist');
}

export function defaultSpecsDir(root: string): string {
  return join(root, 'packages', 'quality', 'e2e', 'specs');
}

export function defaultConfigPath(root: string): string {
  return join(root, 'packages', 'quality', 'e2e', 'playwright.config.ts');
}

export function parseSmokeArgs(argv: readonly string[], defaultRoot: string): ParseSmokeArgsResult {
  let root = defaultRoot;
  let distDir: string | undefined;
  let specsDir: string | undefined;
  let configPath: string | undefined;
  let playwrightBin = 'playwright';

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const needsValue =
      flag === '--root' ||
      flag === '--dist' ||
      flag === '--specs' ||
      flag === '--config' ||
      flag === '--playwright';
    if (!needsValue) {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const kind = flag === '--playwright' || flag === '--config' ? 'path' : 'directory';
      return { ok: false, message: `${flag} requires a ${kind}` };
    }
    if (flag === '--root') root = value;
    if (flag === '--dist') distDir = value;
    if (flag === '--specs') specsDir = value;
    if (flag === '--config') configPath = value;
    if (flag === '--playwright') playwrightBin = value;
    index += 1;
  }

  return {
    ok: true,
    args: {
      root,
      distDir: distDir ?? defaultDistDir(root),
      specsDir: specsDir ?? defaultSpecsDir(root),
      configPath: configPath ?? defaultConfigPath(root),
      playwrightBin,
    },
  };
}

export function listSmokeSpecs(specsDir: string): string[] {
  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) {
    return [];
  }
  return readdirSync(specsDir)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();
}

export function missingRequiredSpecStems(files: readonly string[]): string[] {
  const stems = new Set(files.map((name) => basename(name, '.spec.ts')));
  return REQUIRED_SMOKE_SPEC_STEMS.filter((stem) => !stems.has(stem));
}

export function buildPlaywrightArgv(options: { readonly configPath: string }): readonly string[] {
  return ['test', '--config', options.configPath, '--reporter', 'list'];
}

export function defaultPlaywrightRunner(options: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}): Promise<PlaywrightRunResult> {
  return new Promise((resolve) => {
    // spawn, not spawnSync: the smoke gateway is this same process. A blocked event loop
    // cannot accept Playwright's HTTP, which is how goto hung until ERR_ABORTED.
    let settled = false;
    const finish = (result: PlaywrightRunResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn(options.bin, [...options.argv], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      finish({ status: null, stdout, stderr, error });
    });
    child.once('close', (status) => {
      finish({ status, stdout, stderr, error: undefined });
    });
  });
}

export async function runSmokeCheck(
  args: SmokeCheckArgs,
  runner: PlaywrightRunner = defaultPlaywrightRunner,
  startStack: SmokeStackStarter = startSmokeStack,
): Promise<SmokeCheckOutput> {
  const preflight = preflightSmoke(args);
  if (preflight !== undefined) {
    return fail(preflight);
  }

  let stack: SmokeStack | undefined;
  try {
    stack = await startStack({ root: args.root, distDir: args.distDir });
    const run = await Promise.resolve(
      runner({
        bin: args.playwrightBin,
        argv: buildPlaywrightArgv({ configPath: args.configPath }),
        cwd: args.root,
        env: {
          ...process.env,
          [SMOKE_ORIGIN_ENV]: stack.origin,
        },
      }),
    );

    if (
      run.error !== undefined &&
      (spawnErrorCode(run.error) === 'ENOENT' || run.status === null)
    ) {
      return fail('playwright is required: the binary is absent or not executable');
    }

    if (run.status !== 0) {
      const detail =
        [run.stderr, run.stdout].filter((chunk) => chunk.trim() !== '').join('\n') || 'no output';
      return fail(`smoke failed (${String(run.status)}):\n${detail}`);
    }

    if (run.stdout.trim() === '' && run.stderr.trim() === '') {
      return fail(
        'playwright produced no output: a smoke check that saw no engine output has not run',
      );
    }

    const specCount = listSmokeSpecs(args.specsDir).length;
    return {
      ok: true,
      exitCode: 0,
      stdout: `smoke passed (${String(specCount)} specs against ${stack.origin})\n`,
      stderr: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  } finally {
    if (stack !== undefined) {
      await stack.stop();
    }
  }
}

export function preflightSmoke(args: SmokeCheckArgs): string | undefined {
  if (!existsSync(args.root) || !statSync(args.root).isDirectory()) {
    return 'scan root is required: path is absent or not a directory';
  }

  const indexHtml = join(args.distDir, 'index.html');
  if (!existsSync(indexHtml) || !statSync(indexHtml).isFile()) {
    return (
      'built client is required: app/dist/index.html is absent — a smoke check that never ' +
      'loaded the artifact has not run'
    );
  }

  if (!existsSync(args.configPath) || !statSync(args.configPath).isFile()) {
    return 'playwright config is required: config file is absent';
  }

  if (!existsSync(args.specsDir) || !statSync(args.specsDir).isDirectory()) {
    return 'smoke specs are required: specs directory is absent or not a directory';
  }

  const specs = listSmokeSpecs(args.specsDir);
  if (specs.length === 0) {
    return 'smoke specs directory is empty: a smoke check that saw no tests has not run';
  }

  const missing = missingRequiredSpecStems(specs);
  if (missing.length > 0) {
    return `smoke specs are missing required P0 files: ${missing.map((stem) => `${stem}.spec.ts`).join(', ')}`;
  }

  for (const name of specs) {
    const path = join(args.specsDir, name);
    if (statSync(path).size === 0) {
      return `smoke spec is empty: ${name} — a zero-byte P0 is not a test`;
    }
  }

  if (playwrightLooksLikePath(args.playwrightBin)) {
    if (!existsSync(args.playwrightBin) || !statSync(args.playwrightBin).isFile()) {
      return 'playwright is required: the binary is absent or not executable';
    }
  }

  return undefined;
}

function playwrightLooksLikePath(bin: string): boolean {
  return isAbsolute(bin) || bin.includes('/') || bin.includes('\\');
}

function spawnErrorCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function fail(message: string): SmokeCheckOutput {
  return { ok: false, exitCode: 1, stdout: '', stderr: `${message}\n` };
}
