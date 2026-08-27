// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

/**
 * Two rules about what may reach the shipped bundle, checked over the source tree.
 *
 * `app/tools/` holds the platform guardrails and is untouched: this is a narrower check that
 * belongs to this slot's own code, so it runs in `pnpm test` rather than in
 * `pnpm check:guardrails`.
 */

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE_ROOT = join(APP_ROOT, 'src');
const TESTING_DIR = join('src', 'testing');

function sourceFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        found.push(full);
      }
    }
  };
  walk(SOURCE_ROOT);
  return found;
}

function relativeToApp(file: string): string {
  return relative(APP_ROOT, file);
}

function isTestFile(path: string): boolean {
  return path.endsWith('.test.ts') || path.endsWith('.test.tsx');
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function importSpecifiers(text: string): readonly string[] {
  return [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '');
}

describe('the source tree', () => {
  it('is found, so a passing suite is not an empty one', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((file) => file.endsWith('main.tsx'))).toBe(true);
  });
});

describe('test-only code cannot reach the bundle', () => {
  /**
   * `src/testing/` holds fixtures and a render helper that imports `@testing-library/react`, a
   * devDependency. A screen importing from there would pull the test harness into the artifact the
   * platform scans at upload time.
   */
  it('is imported only by tests and by other testing helpers', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      if (isTestFile(path) || path.startsWith(`${TESTING_DIR}${sep}`)) {
        continue;
      }
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier.includes('testing/') || specifier.includes('@testing-library')) {
          offenders.push(`${path} imports ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The client must never derive playability. `viewerAccess` is the answer that arrives already
 * decided, and `freeEpisodes` is a badge and nothing else (`packages/shared/src/catalog.ts`).
 *
 * A client-side copy of the free-window rule is a second, unauthenticated entitlement system with
 * none of the server's information, and it drifts from the first the day the rule changes — which
 * it already did once: the window is measured in `globalEpisodeNumber`, not `episodeNumber`
 * (`docs/handoff/w2-work-d.md` decision S21). `presentEpisodeAccess` is the primary guard, because
 * its signature takes `ViewerAccess` and cannot see the ingredients. This is the backstop for
 * everywhere else.
 */
describe('the free-window rule is not reimplemented on the client', () => {
  it('never compares an episode number against the free-episode count', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (isCommentLine(line)) {
            return;
          }
          if (/freeEpisodes/.test(line) && /[Ee]pisodeNumber/.test(line)) {
            offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });

  it('reads freeEpisodes only where it is rendered as a badge', () => {
    /** The badge itself, and the fixtures that feed it. */
    const permitted = new Set([
      join('src', 'catalog', 'FeedCardView.tsx'),
      join('src', 'testing', 'catalog-fixtures.ts'),
    ]);
    /** Handing the value on to the badge, and checking it exists in a response, are both fine. */
    const allowedForms = [/freeEpisodes=\{drama\.freeEpisodes\}/, /'freeEpisodes'/];
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      if (isTestFile(path) || permitted.has(path)) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (isCommentLine(line) || !/\bfreeEpisodes\b/.test(line)) {
            return;
          }
          if (allowedForms.some((form) => form.test(line))) {
            return;
          }
          offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
        });
    }

    expect(offenders).toEqual([]);
  });
});
