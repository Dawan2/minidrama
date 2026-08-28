import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './paths.js';
import {
  A11Y_HOST,
  A11Y_HOST_DISCLAIMER,
  A11Y_TAGS,
  BLOCKING_IMPACTS,
  CONTRAST_MIN,
  REQUIRED_SCREEN_STEMS,
  USAGE,
  blockingViolations,
  contrastRatio,
  defaultSource,
  formatHit,
  isBlockingImpact,
  isScreenFileName,
  listScreenFiles,
  missingRequiredScreenStems,
  parseA11yArgs,
  parseCssHex,
  relativeLuminance,
  runA11yCheck,
  scanContrastViolations,
  toRepoFile,
  type AxeViolation,
} from './a11y.js';

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

function writeSource(root: string, relative: string, body: string): string {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
  return path;
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
    <p>Nothing to watch yet.</p>
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
    <p>Nothing to watch in the catalogue yet.</p>
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
    <p>She left with nothing. She came back owning the building.</p>
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
    <p>Episode 1</p>
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
    <p>You are browsing as a guest.</p>
    <a href="#/settings">Settings</a>
  </main>
</body>
</html>
`;

const PASSING_FAVORITES_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Favourites</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="favorites-page">
    <h1>Favourites</h1>
    <p>You are not following anything yet.</p>
    <a href="#/home">Find something to follow</a>
  </main>
</body>
</html>
`;

const PASSING_WALLET_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Wallet</title>
<style>html, body { background: #0b0b0f; color: #f4f4f7; }</style>
</head>
<body>
  <main data-testid="wallet-page">
    <h1>Wallet</h1>
    <p>0 coins</p>
    <p>No activity yet.</p>
    <a href="#/me">Back</a>
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
    readonly favorites?: string;
    readonly wallet?: string;
  } = {},
): void {
  writeSource(root, 'screens/scr-13-fallback.html', bodies.fallback ?? PASSING_HTML);
  writeSource(root, 'screens/scr-02-home.html', bodies.home ?? PASSING_HOME_HTML);
  writeSource(root, 'screens/scr-03-browse.html', bodies.browse ?? PASSING_BROWSE_HTML);
  writeSource(root, 'screens/scr-04-drama.html', bodies.drama ?? PASSING_DRAMA_HTML);
  writeSource(root, 'screens/scr-05-play.html', bodies.play ?? PASSING_PLAY_HTML);
  writeSource(root, 'screens/scr-06-profile.html', bodies.profile ?? PASSING_PROFILE_HTML);
  writeSource(root, 'screens/scr-08-favorites.html', bodies.favorites ?? PASSING_FAVORITES_HTML);
  writeSource(root, 'screens/scr-09-wallet.html', bodies.wallet ?? PASSING_WALLET_HTML);
}

const CONTRAST_FAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Contrast fail</title>
<style>p { color: #ffffff; background: #ffffff; }</style>
</head>
<body>
  <main>
    <h1>Home</h1>
    <p>secret text</p>
  </main>
</body>
</html>
`;

function silentAxe(_html: string): Promise<readonly AxeViolation[]> {
  return Promise.resolve([]);
}

describe('parseA11yArgs', () => {
  it('defaults the source to packages/quality/a11y/screens under the named root', () => {
    const parsed = parseA11yArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/repo', source: defaultSource('/repo') },
    });
    expect(defaultSource('/repo')).toBe('/repo/packages/quality/a11y/screens');
  });

  it('accepts --root and --source', () => {
    const parsed = parseA11yArgs(['--root', '/app', '--source', '/app/screens'], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: { root: '/app', source: '/app/screens' },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseA11yArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag that is missing its value', () => {
    expect(parseA11yArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
    expect(parseA11yArgs(['--source', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--source requires a path',
    });
  });

  it('names the flags in USAGE', () => {
    expect(USAGE).toContain('--root');
    expect(USAGE).toContain('--source');
  });
});

describe('isScreenFileName / listScreenFiles', () => {
  it('accepts HTML screens and ignores other files', () => {
    expect(isScreenFileName('scr-13-fallback.html')).toBe(true);
    expect(isScreenFileName('scr-13-fallback.htm')).toBe(false);
    expect(isScreenFileName('a11y.ts')).toBe(false);
  });

  it('walks nested HTML and skips node_modules / dist / coverage', () => {
    const root = tempDir('a11y-walk-');
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    writeSource(root, 'screens/notes.md', '# no');
    writeSource(root, 'node_modules/pkg/x.html', PASSING_HTML);
    writeSource(root, 'dist/x.html', PASSING_HTML);
    writeSource(root, 'coverage/x.html', PASSING_HTML);
    const files = listScreenFiles(root);
    expect(files).toEqual([join(root, 'screens/scr-13-fallback.html')]);
  });

  it('lists the wallet fixture next to favorites, profile, play, drama, browse, home and fallback when all eight are present', () => {
    const root = tempDir('a11y-walk-wallet-');
    writeSource(root, 'screens/scr-02-home.html', PASSING_HOME_HTML);
    writeSource(root, 'screens/scr-03-browse.html', PASSING_BROWSE_HTML);
    writeSource(root, 'screens/scr-04-drama.html', PASSING_DRAMA_HTML);
    writeSource(root, 'screens/scr-05-play.html', PASSING_PLAY_HTML);
    writeSource(root, 'screens/scr-06-profile.html', PASSING_PROFILE_HTML);
    writeSource(root, 'screens/scr-08-favorites.html', PASSING_FAVORITES_HTML);
    writeSource(root, 'screens/scr-09-wallet.html', PASSING_WALLET_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    expect(listScreenFiles(join(root, 'screens'))).toEqual([
      join(root, 'screens/scr-02-home.html'),
      join(root, 'screens/scr-03-browse.html'),
      join(root, 'screens/scr-04-drama.html'),
      join(root, 'screens/scr-05-play.html'),
      join(root, 'screens/scr-06-profile.html'),
      join(root, 'screens/scr-08-favorites.html'),
      join(root, 'screens/scr-09-wallet.html'),
      join(root, 'screens/scr-13-fallback.html'),
    ]);
  });

  it('returns no files when the source cannot be read', () => {
    expect(listScreenFiles(join(tempDir('a11y-gone-'), 'missing'))).toEqual([]);
  });
});

describe('missingRequiredScreenStems / toRepoFile / formatHit', () => {
  it('requires the SCR-02, SCR-03, SCR-04, SCR-05, SCR-06, SCR-08, SCR-09 and SCR-13 fixtures so deleting any is red', () => {
    expect(REQUIRED_SCREEN_STEMS).toEqual([
      'scr-02-home',
      'scr-03-browse',
      'scr-04-drama',
      'scr-05-play',
      'scr-06-profile',
      'scr-08-favorites',
      'scr-09-wallet',
      'scr-13-fallback',
    ]);
    expect(
      missingRequiredScreenStems([
        'scr-02-home.html',
        'scr-03-browse.html',
        'scr-04-drama.html',
        'scr-05-play.html',
        'scr-06-profile.html',
        'scr-08-favorites.html',
        'scr-09-wallet.html',
        'scr-13-fallback.html',
      ]),
    ).toEqual([]);
    expect(
      missingRequiredScreenStems([
        'scr-02-home.html',
        'scr-03-browse.html',
        'scr-04-drama.html',
        'scr-05-play.html',
        'scr-06-profile.html',
        'scr-08-favorites.html',
        'scr-13-fallback.html',
      ]),
    ).toEqual(['scr-09-wallet']);
    expect(missingRequiredScreenStems(['scr-13-fallback.html'])).toEqual([
      'scr-02-home',
      'scr-03-browse',
      'scr-04-drama',
      'scr-05-play',
      'scr-06-profile',
      'scr-08-favorites',
      'scr-09-wallet',
    ]);
    expect(missingRequiredScreenStems(['scr-02-home.html'])).toEqual([
      'scr-03-browse',
      'scr-04-drama',
      'scr-05-play',
      'scr-06-profile',
      'scr-08-favorites',
      'scr-09-wallet',
      'scr-13-fallback',
    ]);
    expect(missingRequiredScreenStems([])).toEqual([
      'scr-02-home',
      'scr-03-browse',
      'scr-04-drama',
      'scr-05-play',
      'scr-06-profile',
      'scr-08-favorites',
      'scr-09-wallet',
      'scr-13-fallback',
    ]);
  });

  it('formats a hit with a repo-relative path', () => {
    expect(toRepoFile('/repo/packages/quality/a11y/screens/a.html', '/repo')).toBe(
      'packages/quality/a11y/screens/a.html',
    );
    expect(toRepoFile('/elsewhere/a.html', '/repo')).toBe('/elsewhere/a.html');
    expect(
      formatHit({
        file: 'a.html',
        kind: 'contrast',
        id: 'color-contrast',
        excerpt: 'p 1.00:1',
      }),
    ).toContain('contrast a.html color-contrast');
  });
});

describe('blockingViolations', () => {
  it('keeps critical and serious and drops moderate', () => {
    expect(BLOCKING_IMPACTS).toEqual(['critical', 'serious']);
    expect(isBlockingImpact('critical')).toBe(true);
    expect(isBlockingImpact('serious')).toBe(true);
    expect(isBlockingImpact('moderate')).toBe(false);
    expect(isBlockingImpact(null)).toBe(false);
    const listed = blockingViolations([
      { id: 'html-has-lang', impact: 'serious', help: 'lang', nodes: [] },
      { id: 'region', impact: 'moderate', help: 'region', nodes: [{ html: '<div>' }] },
    ]);
    expect(listed.map((item) => item.id)).toEqual(['html-has-lang']);
  });
});

describe('parseCssHex / contrastRatio', () => {
  it('reads 3-digit and 6-digit hex and rejects junk', () => {
    expect(parseCssHex('#fff')).toEqual([255, 255, 255]);
    expect(parseCssHex('#0b0b0f')).toEqual([11, 11, 15]);
    expect(parseCssHex('  #F4F4F7 ')).toEqual([244, 244, 247]);
    expect(parseCssHex('#ggg')).toBeNull();
    expect(parseCssHex('red')).toBeNull();
  });

  it('computes WCAG 2 relative luminance and contrast', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
    expect(contrastRatio([244, 244, 247], [11, 11, 15])).toBeGreaterThan(CONTRAST_MIN);
    expect(contrastRatio([255, 255, 255], [254, 44, 85])).toBeLessThan(CONTRAST_MIN);
  });
});

describe('scanContrastViolations', () => {
  it('flags white-on-white in a style block', () => {
    const hits = scanContrastViolations(CONTRAST_FAIL_HTML, 'blocked.html');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('contrast');
    expect(hits[0]?.id).toBe('color-contrast');
    expect(hits[0]?.excerpt).toContain('1.00:1');
  });

  it('flags an inline style pair', () => {
    const html = '<p style="color:#fff; background:#fff">secret</p>';
    const hits = scanContrastViolations(html, 'inline.html');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('contrast');
  });

  it('flags background-color the same as background', () => {
    const html = '<style>p { color: #ffffff; background-color: #ffffff; }</style>';
    expect(scanContrastViolations(html, 'bgc.html')).toHaveLength(1);
  });

  it('does not flag a passing pair or a color without a background', () => {
    expect(scanContrastViolations(PASSING_HTML, 'ok.html')).toEqual([]);
    expect(scanContrastViolations('<style>a { color: #f4f4f7; }</style>', 'link.html')).toEqual([]);
  });

  it('ignores a declaration that has no colon', () => {
    expect(scanContrastViolations('<style>p { color }</style>', 'nocolon.html')).toEqual([]);
  });
});

describe('runA11yCheck', () => {
  it('fails when the root is missing', async () => {
    const output = await runA11yCheck(
      { root: join(tempDir('a11y-noroot-'), 'nope'), source: '/tmp' },
      silentAxe,
    );
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when the source is missing', async () => {
    const root = tempDir('a11y-nosource-');
    const output = await runA11yCheck({ root, source: join(root, 'missing') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scan source is required');
  });

  it('fails when the source has no HTML screens', async () => {
    const root = tempDir('a11y-empty-');
    writeSource(root, 'screens/notes.md', '# no');
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('saw no screens');
    expect(output.stdout).not.toContain('a11y passed');
  });

  it('fails when the required SCR-13 fixture is missing', async () => {
    const root = tempDir('a11y-nostem-');
    writeSource(root, 'screens/other.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-13-fallback');
    expect(output.stderr).toContain('scr-02-home');
    expect(output.stderr).toContain('scr-03-browse');
    expect(output.stderr).toContain('scr-04-drama');
    expect(output.stderr).toContain('scr-05-play');
    expect(output.stderr).toContain('scr-06-profile');
    expect(output.stderr).toContain('scr-08-favorites');
    expect(output.stderr).toContain('scr-09-wallet');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when the required SCR-02 fixture is missing', async () => {
    const root = tempDir('a11y-nohome-');
    writeSource(root, 'screens/scr-03-browse.html', PASSING_BROWSE_HTML);
    writeSource(root, 'screens/scr-04-drama.html', PASSING_DRAMA_HTML);
    writeSource(root, 'screens/scr-05-play.html', PASSING_PLAY_HTML);
    writeSource(root, 'screens/scr-06-profile.html', PASSING_PROFILE_HTML);
    writeSource(root, 'screens/scr-08-favorites.html', PASSING_FAVORITES_HTML);
    writeSource(root, 'screens/scr-09-wallet.html', PASSING_WALLET_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-02-home');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when the required SCR-03 fixture is missing', async () => {
    const root = tempDir('a11y-nobrowse-');
    writeSource(root, 'screens/scr-02-home.html', PASSING_HOME_HTML);
    writeSource(root, 'screens/scr-04-drama.html', PASSING_DRAMA_HTML);
    writeSource(root, 'screens/scr-05-play.html', PASSING_PLAY_HTML);
    writeSource(root, 'screens/scr-06-profile.html', PASSING_PROFILE_HTML);
    writeSource(root, 'screens/scr-08-favorites.html', PASSING_FAVORITES_HTML);
    writeSource(root, 'screens/scr-09-wallet.html', PASSING_WALLET_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-03-browse');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when the required SCR-04 fixture is missing', async () => {
    const root = tempDir('a11y-nodrama-');
    writeSource(root, 'screens/scr-02-home.html', PASSING_HOME_HTML);
    writeSource(root, 'screens/scr-03-browse.html', PASSING_BROWSE_HTML);
    writeSource(root, 'screens/scr-05-play.html', PASSING_PLAY_HTML);
    writeSource(root, 'screens/scr-06-profile.html', PASSING_PROFILE_HTML);
    writeSource(root, 'screens/scr-08-favorites.html', PASSING_FAVORITES_HTML);
    writeSource(root, 'screens/scr-09-wallet.html', PASSING_WALLET_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-04-drama');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when the required SCR-05 fixture is missing', async () => {
    const root = tempDir('a11y-noplay-');
    writeSource(root, 'screens/scr-02-home.html', PASSING_HOME_HTML);
    writeSource(root, 'screens/scr-03-browse.html', PASSING_BROWSE_HTML);
    writeSource(root, 'screens/scr-04-drama.html', PASSING_DRAMA_HTML);
    writeSource(root, 'screens/scr-06-profile.html', PASSING_PROFILE_HTML);
    writeSource(root, 'screens/scr-08-favorites.html', PASSING_FAVORITES_HTML);
    writeSource(root, 'screens/scr-09-wallet.html', PASSING_WALLET_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-05-play');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when the required SCR-06 fixture is missing', async () => {
    const root = tempDir('a11y-noprofile-');
    writeSource(root, 'screens/scr-02-home.html', PASSING_HOME_HTML);
    writeSource(root, 'screens/scr-03-browse.html', PASSING_BROWSE_HTML);
    writeSource(root, 'screens/scr-04-drama.html', PASSING_DRAMA_HTML);
    writeSource(root, 'screens/scr-05-play.html', PASSING_PLAY_HTML);
    writeSource(root, 'screens/scr-08-favorites.html', PASSING_FAVORITES_HTML);
    writeSource(root, 'screens/scr-09-wallet.html', PASSING_WALLET_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-06-profile');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when the required SCR-08 fixture is missing', async () => {
    const root = tempDir('a11y-nofavorites-');
    writeSource(root, 'screens/scr-02-home.html', PASSING_HOME_HTML);
    writeSource(root, 'screens/scr-03-browse.html', PASSING_BROWSE_HTML);
    writeSource(root, 'screens/scr-04-drama.html', PASSING_DRAMA_HTML);
    writeSource(root, 'screens/scr-05-play.html', PASSING_PLAY_HTML);
    writeSource(root, 'screens/scr-06-profile.html', PASSING_PROFILE_HTML);
    writeSource(root, 'screens/scr-09-wallet.html', PASSING_WALLET_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-08-favorites');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when the required SCR-09 fixture is missing', async () => {
    const root = tempDir('a11y-nowallet-');
    writeSource(root, 'screens/scr-02-home.html', PASSING_HOME_HTML);
    writeSource(root, 'screens/scr-03-browse.html', PASSING_BROWSE_HTML);
    writeSource(root, 'screens/scr-04-drama.html', PASSING_DRAMA_HTML);
    writeSource(root, 'screens/scr-05-play.html', PASSING_PLAY_HTML);
    writeSource(root, 'screens/scr-06-profile.html', PASSING_PROFILE_HTML);
    writeSource(root, 'screens/scr-08-favorites.html', PASSING_FAVORITES_HTML);
    writeSource(root, 'screens/scr-13-fallback.html', PASSING_HTML);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('scr-09-wallet');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when an injected contrast violation is present', async () => {
    const root = tempDir('a11y-contrast-');
    writeRequiredStems(root, { fallback: CONTRAST_FAIL_HTML });
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('QA-010 red');
    expect(output.stderr).toContain('color-contrast');
    expect(output.stderr).toContain(A11Y_HOST);
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when axe-core reports a serious violation', async () => {
    const root = tempDir('a11y-axe-');
    writeRequiredStems(root);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, async () => [
      {
        id: 'html-has-lang',
        impact: 'serious',
        help: 'html lang',
        nodes: [{ html: '<html>' }],
      },
    ]);
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('html-has-lang');
    expect(output.stderr).toContain('<html>');
  });

  it('fails when axe-core throws rather than treating that as a skip', async () => {
    const root = tempDir('a11y-throw-');
    writeRequiredStems(root);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, async () => {
      throw new Error('axe-core is required: a scan that did not run axe-core is not QA-010');
    });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('did not run axe-core');
    expect(output.stderr).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('fails when axe-core throws a non-Error', async () => {
    const root = tempDir('a11y-throw-raw-');
    writeRequiredStems(root);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, async () => {
      throw 'nope';
    });
    expect(output.ok).toBe(false);
    expect(output.stderr).toContain('axe-core failed');
  });

  it('passes a tree whose screens have no blocking axe hit and passing contrast', async () => {
    const root = tempDir('a11y-clean-');
    writeRequiredStems(root);
    const output = await runA11yCheck({ root, source: join(root, 'screens') }, silentAxe);
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('a11y passed');
    expect(output.stdout).toContain(`host=${A11Y_HOST}`);
    expect(output.stdout).toContain(A11Y_HOST_DISCLAIMER);
    expect(output.stdout).not.toMatch(/in TikTok WebView/);
  });

  it('the committed SCR-02, SCR-03, SCR-04, SCR-05, SCR-06, SCR-08, SCR-09 and SCR-13 fixtures pass the real axe-core run in jsdom', async () => {
    const output = await runA11yCheck({
      root: repoRoot,
      source: defaultSource(repoRoot),
    });
    expect(output.ok).toBe(true);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('a11y passed');
    expect(output.stdout).toContain('8 screens');
    expect(output.stdout).toContain(A11Y_HOST_DISCLAIMER);
  });
});

describe('QA-010 does not skip the engine or claim TikTok WebView', () => {
  it('keeps wcag2aa tags and does not disable color-contrast', () => {
    expect(A11Y_TAGS).toEqual(['wcag2a', 'wcag2aa', 'wcag22aa']);
    const source = readFileSync(join(repoRoot, 'packages/quality/src/a11y.ts'), 'utf8');
    expect(source).not.toMatch(/color-contrast['"]\s*:\s*\{\s*enabled\s*:\s*false/);
    expect(source).toContain('axe-core');
    expect(source).toContain(A11Y_HOST_DISCLAIMER);
  });

  it('the SCR-13 fixture still matches FallbackPage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/FallbackPage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="fallback-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-13-fallback.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="fallback-page"');
    expect(fixture).toContain('<html lang="en">');
  });

  it('the SCR-02 fixture still matches HomePage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/HomePage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="home-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    expect(page).toMatch(/data-testid="empty-state"|home.empty/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-02-home.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="home-page"');
    expect(fixture).toContain('data-testid="empty-state"');
    expect(fixture).toContain('<html lang="en">');
    expect(fixture).toContain('For you');
  });

  it('the SCR-03 fixture still matches BrowsePage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/BrowsePage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="browse-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    expect(page).toMatch(/data-testid="browse-filters"/);
    expect(page).toMatch(/data-testid="empty-state"|browse.empty/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-03-browse.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="browse-page"');
    expect(fixture).toContain('data-testid="browse-filters"');
    expect(fixture).toContain('data-testid="empty-state"');
    expect(fixture).toContain('<html lang="en">');
    expect(fixture).toContain('Theatre');
  });

  it('the SCR-04 fixture still matches DramaPage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/DramaPage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="drama-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    expect(page).toMatch(/data-testid="drama-header"/);
    expect(page).toMatch(/data-testid="episodes-section"/);
    expect(page).toMatch(/data-testid="watch-now"|drama.watchNow/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-04-drama.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="drama-page"');
    expect(fixture).toContain('data-testid="drama-header"');
    expect(fixture).toContain('data-testid="episodes-section"');
    expect(fixture).toContain('data-testid="watch-now"');
    expect(fixture).toContain('<html lang="en">');
    expect(fixture).toContain('Watch now');
  });

  it('the SCR-05 fixture still matches PlayPage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/PlayPage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="play-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    expect(page).toMatch(/data-testid="player-episode-label"|drama.episodeLabel/);
    expect(page).toMatch(/data-testid="player-next"|player.nextEpisode/);
    expect(page).toMatch(/data-testid="episode-picker-open"|picker.open/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-05-play.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="play-page"');
    expect(fixture).toContain('data-testid="player-surface"');
    expect(fixture).toContain('data-testid="player-container"');
    expect(fixture).toContain('data-testid="player-episode-label"');
    expect(fixture).toContain('data-testid="player-next"');
    expect(fixture).toContain('data-testid="episode-picker-open"');
    expect(fixture).toContain('<html lang="en">');
    expect(fixture).toContain('Player');
    expect(fixture).not.toMatch(/<video|<audio|<iframe/i);
  });

  it('the SCR-06 fixture still matches ProfilePage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/ProfilePage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="profile-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    expect(page).toMatch(/data-testid="profile-identity"/);
    expect(page).toMatch(/data-testid="profile-entries"/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-06-profile.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="profile-page"');
    expect(fixture).toContain('data-testid="profile-identity"');
    expect(fixture).toContain('data-testid="profile-entries"');
    expect(fixture).toContain('data-testid="profile-sign-in"');
    expect(fixture).toContain('<html lang="en">');
    expect(fixture).toContain('Me');
    expect(fixture).not.toContain('#/vip');
  });

  it('the SCR-08 fixture still matches FavoritesPage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/FavoritesPage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="favorites-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    expect(page).toMatch(/favorites.empty/);
    expect(page).toMatch(/favorites.browse/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-08-favorites.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="favorites-page"');
    expect(fixture).toContain('data-testid="empty-state"');
    expect(fixture).toContain('<html lang="en">');
    expect(fixture).toContain('Favourites');
    expect(fixture).toContain('Find something to follow');
    expect(fixture).not.toContain('#/vip');
  });

  it('the SCR-09 fixture still matches WalletPage structure', () => {
    const page = readFileSync(join(repoRoot, 'app/src/routes/WalletPage.tsx'), 'utf8');
    expect(page).toMatch(/data-testid="wallet-page"/);
    expect(page).toMatch(/<main/);
    expect(page).toMatch(/<h1/);
    expect(page).toMatch(/wallet.heading/);
    expect(page).toMatch(/wallet.ledgerEmpty/);
    expect(page).toMatch(/wallet.recharge/);
    const fixture = readFileSync(
      join(repoRoot, 'packages/quality/a11y/screens/scr-09-wallet.html'),
      'utf8',
    );
    expect(fixture).toContain('data-testid="wallet-page"');
    expect(fixture).toContain('data-testid="wallet-balance"');
    expect(fixture).toContain('data-testid="empty-state"');
    expect(fixture).toContain('data-testid="wallet-recharge"');
    expect(fixture).toContain('<html lang="en">');
    expect(fixture).toContain('Wallet');
    expect(fixture).toContain('0 coins');
    expect(fixture).toContain('No activity yet.');
    expect(fixture).toContain('Top up');
    expect(fixture).toContain('disabled');
    expect(fixture).not.toContain('#/vip');
    expect(fixture).not.toMatch(/beans/i);
  });
});
