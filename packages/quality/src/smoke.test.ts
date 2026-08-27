import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { REQUIRED_SMOKE_SPEC_STEMS as INDEX_STEMS } from './index.js';
import { repoRoot } from './paths.js';
import {
  REQUIRED_SMOKE_SPEC_STEMS,
  USAGE,
  buildPlaywrightArgv,
  defaultConfigPath,
  defaultDistDir,
  defaultPlaywrightRunner,
  defaultSpecsDir,
  listSmokeSpecs,
  missingRequiredSpecStems,
  parseSmokeArgs,
  preflightSmoke,
  runSmokeCheck,
  type PlaywrightRunResult,
} from './smoke.js';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop() ?? '', { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  fixtures.push(root);
  return root;
}

function writeTree(root: string): {
  readonly distDir: string;
  readonly specsDir: string;
  readonly configPath: string;
} {
  const distDir = join(root, 'app', 'dist');
  const specsDir = join(root, 'packages', 'quality', 'e2e', 'specs');
  const configPath = join(root, 'packages', 'quality', 'e2e', 'playwright.config.ts');
  mkdirSync(distDir, { recursive: true });
  mkdirSync(specsDir, { recursive: true });
  writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>fixture</title>');
  writeFileSync(configPath, 'export default {};\n');
  for (const stem of REQUIRED_SMOKE_SPEC_STEMS) {
    writeFileSync(join(specsDir, `${stem}.spec.ts`), `test('${stem}', async () => {});\n`);
  }
  return { distDir, specsDir, configPath };
}

function passingRun(): PlaywrightRunResult {
  return { status: 0, stdout: '2 passed\n', stderr: '', error: undefined };
}

describe('parseSmokeArgs', () => {
  it('defaults dist, specs, config, and playwright under the repo root', () => {
    const parsed = parseSmokeArgs([], '/repo');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.root).toBe('/repo');
    expect(parsed.args.distDir).toBe(defaultDistDir('/repo'));
    expect(parsed.args.specsDir).toBe(defaultSpecsDir('/repo'));
    expect(parsed.args.configPath).toBe(defaultConfigPath('/repo'));
    expect(parsed.args.playwrightBin).toBe('playwright');
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    const parsed = parseSmokeArgs(['--allow-unknown'], '/repo');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('unknown argument');
    expect(USAGE).toContain('check-smoke');
  });

  it('rejects a flag with no value', () => {
    const parsed = parseSmokeArgs(['--playwright'], '/repo');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('--playwright requires a path');
  });
});

describe('listSmokeSpecs / missingRequiredSpecStems', () => {
  it('requires the named P0 files, so deleting login-home is red', () => {
    const root = tempDir('smoke-specs-');
    mkdirSync(join(root, 'specs'));
    writeFileSync(join(root, 'specs', 'browse-play.spec.ts'), 'test("x", () => {});\n');
    const files = listSmokeSpecs(join(root, 'specs'));
    expect(missingRequiredSpecStems(files)).toEqual(['login-home']);
  });
});

describe('preflightSmoke', () => {
  it('fails when the built client is absent', () => {
    const root = tempDir('smoke-nodist-');
    const { specsDir, configPath } = writeTree(root);
    rmSync(join(root, 'app', 'dist', 'index.html'));
    expect(
      preflightSmoke({
        root,
        distDir: join(root, 'app', 'dist'),
        specsDir,
        configPath,
        playwrightBin: 'playwright',
      }),
    ).toContain('app/dist/index.html is absent');
  });

  it('fails when a required P0 spec is missing', () => {
    const root = tempDir('smoke-nospec-');
    const tree = writeTree(root);
    rmSync(join(tree.specsDir, 'login-home.spec.ts'));
    expect(preflightSmoke({ ...tree, root, playwrightBin: 'playwright' })).toContain(
      'login-home.spec.ts',
    );
  });

  it('fails when a spec file is empty', () => {
    const root = tempDir('smoke-empty-');
    const tree = writeTree(root);
    writeFileSync(join(tree.specsDir, 'login-home.spec.ts'), '');
    expect(preflightSmoke({ ...tree, root, playwrightBin: 'playwright' })).toContain(
      'smoke spec is empty',
    );
  });
});

describe('buildPlaywrightArgv', () => {
  it('invokes Playwright test with the config, not a grep of test ids', () => {
    expect(buildPlaywrightArgv({ configPath: '/tmp/playwright.config.ts' })).toEqual([
      'test',
      '--config',
      '/tmp/playwright.config.ts',
      '--reporter',
      'list',
    ]);
  });
});

describe('runSmokeCheck', () => {
  it('does not start Playwright when preflight fails', async () => {
    const root = tempDir('smoke-preflight-');
    let ran = 0;
    const output = await runSmokeCheck(
      {
        root,
        distDir: join(root, 'missing-dist'),
        specsDir: join(root, 'missing-specs'),
        configPath: join(root, 'missing.config.ts'),
        playwrightBin: 'playwright',
      },
      () => {
        ran += 1;
        return passingRun();
      },
      async () => {
        throw new Error('stack must not start after a failed preflight');
      },
    );
    expect(ran).toBe(0);
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('app/dist/index.html is absent');
  });

  it('fails when Playwright is missing, before the stack starts', async () => {
    const root = tempDir('smoke-nobin-');
    const tree = writeTree(root);
    let ran = 0;
    let stacked = 0;
    const output = await runSmokeCheck(
      { ...tree, root, playwrightBin: join(root, 'no-such-playwright') },
      () => {
        ran += 1;
        return passingRun();
      },
      async () => {
        stacked += 1;
        return {
          origin: 'http://127.0.0.1:9',
          apiOrigin: 'http://127.0.0.1:8',
          stop: async () => undefined,
        };
      },
    );
    expect(ran).toBe(0);
    expect(stacked).toBe(0);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('playwright is required');
    expect(output.stdout).not.toContain('smoke passed');
  });

  it('fails when the PATH binary is missing at spawn', async () => {
    const root = tempDir('smoke-path-');
    const tree = writeTree(root);
    const output = await runSmokeCheck(
      { ...tree, root, playwrightBin: 'playwright' },
      () => ({
        status: null,
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('spawn playwright ENOENT'), { code: 'ENOENT' }),
      }),
      async () => ({
        origin: 'http://127.0.0.1:9',
        apiOrigin: 'http://127.0.0.1:8',
        stop: async () => undefined,
      }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('playwright is required');
  });

  it('fails when a spec fails, quoting Playwright output', async () => {
    const root = tempDir('smoke-fail-');
    const tree = writeTree(root);
    const output = await runSmokeCheck(
      { ...tree, root, playwrightBin: 'playwright' },
      () => ({
        status: 1,
        stdout: '',
        stderr:
          "Error: expect(locator).toBeVisible() failed\n  Locator: getByTestId('this-testid-does-not-exist')\n",
        error: undefined,
      }),
      async () => ({
        origin: 'http://127.0.0.1:9',
        apiOrigin: 'http://127.0.0.1:8',
        stop: async () => undefined,
      }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('smoke failed');
    expect(output.stderr).toContain('this-testid-does-not-exist');
  });

  it('fails when Playwright exits 0 with no output', async () => {
    const root = tempDir('smoke-silent-');
    const tree = writeTree(root);
    const output = await runSmokeCheck(
      { ...tree, root, playwrightBin: 'playwright' },
      () => ({ status: 0, stdout: '', stderr: '', error: undefined }),
      async () => ({
        origin: 'http://127.0.0.1:9',
        apiOrigin: 'http://127.0.0.1:8',
        stop: async () => undefined,
      }),
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('playwright produced no output');
  });

  it('passes when Playwright runs the P0 specs against the stack origin', async () => {
    const root = tempDir('smoke-ok-');
    const tree = writeTree(root);
    let seenOrigin = '';
    const output = await runSmokeCheck(
      { ...tree, root, playwrightBin: 'playwright' },
      (options) => {
        seenOrigin = options.env['MINIDRAMA_SMOKE_ORIGIN'] ?? '';
        expect(options.argv).toContain(tree.configPath);
        return passingRun();
      },
      async () => ({
        origin: 'http://127.0.0.1:4180',
        apiOrigin: 'http://127.0.0.1:8081',
        stop: async () => undefined,
      }),
    );
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(seenOrigin).toBe('http://127.0.0.1:4180');
    expect(output.stdout).toContain('smoke passed (2 specs against http://127.0.0.1:4180)');
  });

  it('stops the stack even when Playwright fails', async () => {
    const root = tempDir('smoke-stop-');
    const tree = writeTree(root);
    let stopped = 0;
    await runSmokeCheck(
      { ...tree, root, playwrightBin: 'playwright' },
      () => ({ status: 1, stdout: '', stderr: 'boom', error: undefined }),
      async () => ({
        origin: 'http://127.0.0.1:9',
        apiOrigin: 'http://127.0.0.1:8',
        stop: async () => {
          stopped += 1;
        },
      }),
    );
    expect(stopped).toBe(1);
  });
});

describe('defaultPlaywrightRunner', () => {
  it('the default runner reports ENOENT for a missing binary', async () => {
    const run = await defaultPlaywrightRunner({
      bin: join(tempDir('smoke-default-'), 'no-such-playwright'),
      argv: ['test'],
      cwd: repoRoot,
      env: process.env,
    });
    expect(run.status).toBeNull();
    expect((run.error as NodeJS.ErrnoException).code).toBe('ENOENT');
  });
});

describe('live P0 specs on this tree', () => {
  it('the committed specs directory still has the required stems', () => {
    const files = listSmokeSpecs(defaultSpecsDir(repoRoot));
    expect(missingRequiredSpecStems(files)).toEqual([]);
    expect(INDEX_STEMS).toEqual(REQUIRED_SMOKE_SPEC_STEMS);
  });
});
