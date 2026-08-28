// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from '../paths.js';

/**
 * Exit-code tests for the CI entry point. The unit tests cover axe-core and contrast;
 * this covers the only thing L1 actually reads — the process exit status — because a
 * check that reports success without having seen screens is the same fail-open G2.8
 * closed for an empty store.
 */

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./check-a11y.ts', import.meta.url));

function tsxBin(): string {
  const candidates = [
    join(packageRoot, 'node_modules', '.bin', 'tsx'),
    join(repoRoot, 'node_modules', '.bin', 'tsx'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`tsx not found in ${candidates.join(', ')}`);
  }
  return found;
}

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

function run(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(tsxBin(), [cli, ...args], { cwd: packageRoot, encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const PASSING_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Something went wrong</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="fallback-page">
    <h1>Something went wrong</h1>
    <p>This page does not exist.</p>
    <a href="#/">Back to home</a>
  </main>
</body>
</html>
`;

const PASSING_HOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>For you</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="home-page">
    <h1>For you</h1>
    <a href="#/browse">Theatre</a>
  </main>
</body>
</html>
`;

const PASSING_BROWSE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Theatre</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="browse-page">
    <h1>Theatre</h1>
    <a href="#/home">Home</a>
  </main>
</body>
</html>
`;

const PASSING_DRAMA_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>The Heiress Returns</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="drama-page">
    <h1>The Heiress Returns</h1>
    <a href="#/home">Back</a>
  </main>
</body>
</html>
`;

const PASSING_PLAY_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Player</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="play-page">
    <h1>Player</h1>
    <a href="#/home">Back</a>
  </main>
</body>
</html>
`;

const PASSING_PROFILE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Me</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="profile-page">
    <h1>Me</h1>
    <a href="#/settings">Settings</a>
  </main>
</body>
</html>
`;

function writeRequiredStems(
  root: string,
  bodies: {
    readonly fallback?: string;
    readonly home?: string;
    readonly browse?: string;
    readonly drama?: string;
    readonly play?: string;
    readonly profile?: string;
  } = {},
): void {
  mkdirSync(join(root, 'screens'), { recursive: true });
  writeFileSync(join(root, 'screens', 'scr-13-fallback.html'), bodies.fallback ?? PASSING_HTML);
  writeFileSync(join(root, 'screens', 'scr-02-home.html'), bodies.home ?? PASSING_HOME_HTML);
  writeFileSync(join(root, 'screens', 'scr-03-browse.html'), bodies.browse ?? PASSING_BROWSE_HTML);
  writeFileSync(join(root, 'screens', 'scr-04-drama.html'), bodies.drama ?? PASSING_DRAMA_HTML);
  writeFileSync(join(root, 'screens', 'scr-05-play.html'), bodies.play ?? PASSING_PLAY_HTML);
  writeFileSync(
    join(root, 'screens', 'scr-06-profile.html'),
    bodies.profile ?? PASSING_PROFILE_HTML,
  );
}

describe('check-a11y CLI', () => {
  it('exits 2 on an unknown argument, rather than ignoring it', () => {
    const result = run(['--allow-unknown']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(result.stderr).toContain('usage: check-a11y');
  });

  it('exits non-zero when the source has no HTML screens', () => {
    const root = tempDir('cli-a11y-empty-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'ok.ts'), 'export const x = 1\n');
    const result = run(['--root', root, '--source', root]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('saw no screens');
    expect(result.stdout).not.toContain('a11y passed');
  });

  it('exits non-zero when a fixture injects a contrast violation', () => {
    const root = tempDir('cli-a11y-contrast-');
    writeRequiredStems(root, {
      fallback: `<!DOCTYPE html>
<html lang="en">
<head><title>Contrast fail</title>
<style>p { color: #ffffff; background: #ffffff; }</style>
</head>
<body><main><h1>Home</h1><p>secret</p></main></body>
</html>
`,
    });
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('QA-010 red');
    expect(result.stderr).toContain('color-contrast');
    expect(result.stderr).toContain('not TikTok WebView');
  });

  it('exits non-zero when axe-core sees a missing html lang', () => {
    const root = tempDir('cli-a11y-lang-');
    writeRequiredStems(root, {
      fallback: `<!DOCTYPE html>
<html>
<head><title>No lang</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body><main><h1>Home</h1><p>Hello</p></main></body>
</html>
`,
    });
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('html-has-lang');
  });

  it('exits zero on passing implemented-screen fixtures', () => {
    const root = tempDir('cli-a11y-clean-');
    writeRequiredStems(root);
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('a11y passed');
    expect(result.stdout).toContain('6 screens');
    expect(result.stdout).toContain('not TikTok WebView');
    expect(result.stdout).not.toMatch(/in TikTok WebView/);
  });

  it('exits non-zero when the required SCR-02 fixture is missing', () => {
    const root = tempDir('cli-a11y-nohome-');
    mkdirSync(join(root, 'screens'));
    writeFileSync(join(root, 'screens', 'scr-03-browse.html'), PASSING_BROWSE_HTML);
    writeFileSync(join(root, 'screens', 'scr-04-drama.html'), PASSING_DRAMA_HTML);
    writeFileSync(join(root, 'screens', 'scr-05-play.html'), PASSING_PLAY_HTML);
    writeFileSync(join(root, 'screens', 'scr-06-profile.html'), PASSING_PROFILE_HTML);
    writeFileSync(join(root, 'screens', 'scr-13-fallback.html'), PASSING_HTML);
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scr-02-home');
    expect(result.stdout).not.toContain('a11y passed');
  });

  it('exits non-zero when the required SCR-03 fixture is missing', () => {
    const root = tempDir('cli-a11y-nobrowse-');
    mkdirSync(join(root, 'screens'));
    writeFileSync(join(root, 'screens', 'scr-02-home.html'), PASSING_HOME_HTML);
    writeFileSync(join(root, 'screens', 'scr-04-drama.html'), PASSING_DRAMA_HTML);
    writeFileSync(join(root, 'screens', 'scr-05-play.html'), PASSING_PLAY_HTML);
    writeFileSync(join(root, 'screens', 'scr-06-profile.html'), PASSING_PROFILE_HTML);
    writeFileSync(join(root, 'screens', 'scr-13-fallback.html'), PASSING_HTML);
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scr-03-browse');
    expect(result.stdout).not.toContain('a11y passed');
  });

  it('exits non-zero when the required SCR-04 fixture is missing', () => {
    const root = tempDir('cli-a11y-nodrama-');
    mkdirSync(join(root, 'screens'));
    writeFileSync(join(root, 'screens', 'scr-02-home.html'), PASSING_HOME_HTML);
    writeFileSync(join(root, 'screens', 'scr-03-browse.html'), PASSING_BROWSE_HTML);
    writeFileSync(join(root, 'screens', 'scr-05-play.html'), PASSING_PLAY_HTML);
    writeFileSync(join(root, 'screens', 'scr-06-profile.html'), PASSING_PROFILE_HTML);
    writeFileSync(join(root, 'screens', 'scr-13-fallback.html'), PASSING_HTML);
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scr-04-drama');
    expect(result.stdout).not.toContain('a11y passed');
  });

  it('exits non-zero when the required SCR-05 fixture is missing', () => {
    const root = tempDir('cli-a11y-noplay-');
    mkdirSync(join(root, 'screens'));
    writeFileSync(join(root, 'screens', 'scr-02-home.html'), PASSING_HOME_HTML);
    writeFileSync(join(root, 'screens', 'scr-03-browse.html'), PASSING_BROWSE_HTML);
    writeFileSync(join(root, 'screens', 'scr-04-drama.html'), PASSING_DRAMA_HTML);
    writeFileSync(join(root, 'screens', 'scr-06-profile.html'), PASSING_PROFILE_HTML);
    writeFileSync(join(root, 'screens', 'scr-13-fallback.html'), PASSING_HTML);
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scr-05-play');
    expect(result.stdout).not.toContain('a11y passed');
  });

  it('exits non-zero when the required SCR-06 fixture is missing', () => {
    const root = tempDir('cli-a11y-noprofile-');
    mkdirSync(join(root, 'screens'));
    writeFileSync(join(root, 'screens', 'scr-02-home.html'), PASSING_HOME_HTML);
    writeFileSync(join(root, 'screens', 'scr-03-browse.html'), PASSING_BROWSE_HTML);
    writeFileSync(join(root, 'screens', 'scr-04-drama.html'), PASSING_DRAMA_HTML);
    writeFileSync(join(root, 'screens', 'scr-05-play.html'), PASSING_PLAY_HTML);
    writeFileSync(join(root, 'screens', 'scr-13-fallback.html'), PASSING_HTML);
    const result = run(['--root', root, '--source', join(root, 'screens')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('scr-06-profile');
    expect(result.stdout).not.toContain('a11y passed');
  });
});
