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
 * Where a credential may and may not go, as a source scan.
 *
 * The session is held in memory by one module and attached by one other. These are the two ways a
 * bearer token leaks out of that arrangement without anybody deciding to leak it: it gets written
 * somewhere durable "so the viewer stays signed in", or it gets printed while somebody is debugging
 * something else.
 */
describe('a session token stays in memory and out of the logs', () => {
  const CREDENTIAL_WORDS = /\b(accessToken|authCode|bearerToken|Authorization)\b/;

  function offendingLines(pattern: RegExp, permitted: ReadonlySet<string> = new Set()): string[] {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      if (isTestFile(path) || permitted.has(path)) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (!isCommentLine(line) && pattern.test(line)) {
            offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    return offenders;
  }

  /**
   * Minis holds the access token in memory and re-runs silent login when it expires
   * (`contracts/openapi.yaml`, `LoginResponse`). Persisting it would leave a credential in a
   * WebView's storage, outliving the session it belongs to, for a refresh that costs nothing to
   * redo.
   */
  it('is never written to storage, because nothing in the app writes to storage', () => {
    expect(offendingLines(/\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/)).toEqual(
      [],
    );
  });

  it('is never handed to a console call', () => {
    const offenders = offendingLines(/console\.\w+\(/).filter((line) =>
      CREDENTIAL_WORDS.test(line),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * One attachment point. A call site that assembles its own `Authorization` is a second way to
   * authenticate with none of the transport's rules — no expiry guard, no invalidation on `401`,
   * and nothing stopping a hard-coded token from shipping.
   */
  it('is turned into a header only by the transport', () => {
    const permitted = new Set([join('src', 'data', 'http.ts')]);
    expect(offendingLines(/['"]?Bearer\s/, permitted)).toEqual([]);
    expect(offendingLines(/Authorization/, permitted)).toEqual([]);
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

/**
 * The unlock flow's central rule, as a source scan.
 *
 * `runCoinUnlock` decides one thing — whether the *server* said this order bought the episode — and
 * everything downstream renders that decision. The two shapes below are how a second, client-side
 * entitlement decision would get written by accident:
 *
 * 1. reading `unlockGranted` at a surface, which puts an access decision next to a render;
 * 2. reading an order `status` as access. `PAID` means the viewer was charged and says nothing
 *    about whether the episode is playable — today it never becomes playable — so a component
 *    switching on it would show a locked episode as unlocked.
 *
 * Both are backstops behind the real guarantee, which is that `viewerAccess` arrives already
 * decided and is the only thing the row reads.
 */
describe('the client never decides an unlock', () => {
  /** The flow that interprets an order, the client that parses one, and the fixtures. */
  const ORDER_READERS = new Set([
    join('src', 'unlock', 'coin-unlock.ts'),
    join('src', 'data', 'unlock-api.ts'),
    join('src', 'testing', 'unlock-fixtures.ts'),
  ]);

  function offendersMatching(pattern: RegExp, permitted: ReadonlySet<string>): readonly string[] {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      if (isTestFile(path) || permitted.has(path)) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (!isCommentLine(line) && pattern.test(line)) {
            offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    return offenders;
  }

  it('reads unlockGranted only where an order outcome is decided', () => {
    expect(offendersMatching(/\bunlockGranted\b/, ORDER_READERS)).toEqual([]);
  });

  it('never compares an order status against PAID or FULFILLED to decide anything', () => {
    expect(offendersMatching(/['"](PAID|FULFILLED)['"]/, ORDER_READERS)).toEqual([]);
  });

  /**
   * `viewerAccess` is the server's answer. Building one on the client — to mark an episode unlocked
   * after a purchase, say — is the free-window mistake in a more expensive place: an episode
   * rendered as playable that the playback endpoint will refuse.
   */
  it('never constructs a viewerAccess outside the fixtures', () => {
    const permitted = new Set([join('src', 'testing', 'catalog-fixtures.ts')]);
    expect(offendersMatching(/viewerAccess:\s*[{'"]/, permitted)).toEqual([]);
  });
});

/**
 * The cover allowlist has exactly one place it can be applied, as a source scan.
 *
 * `CoverImage` checks its `src` with `checkCoverUrl` before it renders an `<img>`
 * (`packages/config/src/cover-hosts.ts`), which is what stops a string out of the content database
 * from becoming a request to a host nobody registered. That guarantee holds only while `CoverImage`
 * is the *only* way a cover reaches the DOM: a second `<img>` somewhere else is a second decision,
 * and it will be the one that renders whatever the response happened to contain.
 *
 * `CoverImage.test.tsx` proves the gate refuses what it should. This proves nothing walks around it.
 */
describe('a cover URL is checked before the browser is asked to fetch it', () => {
  const COVER_COMPONENT = join('src', 'components', 'CoverImage.tsx');

  it('reaches an <img> only through CoverImage', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      if (isTestFile(path) || path === COVER_COMPONENT) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (!isCommentLine(line) && /<img[\s/>]/.test(line)) {
            offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });

  it('and that one component takes the decision from the registry rather than its own', () => {
    const source = readFileSync(join(APP_ROOT, COVER_COMPONENT), 'utf8');

    expect(source).toContain("from '@minidrama/config'");
    expect(source).toContain('checkCoverUrl(src)');
    // The prop is not what gets fetched: the checked, parsed URL is. `src={src}` would make the
    // check advisory, and it is the one line that would still pass every behavioural test that
    // only asserts an image appeared.
    expect(source).not.toContain('src={src}');
  });
});

/**
 * Native `<video>` is prohibited in the source, not only in the artifact. ESLint and the bundle
 * scan already reject it; this is the backstop for an `eslint-disable` that would otherwise
 * leave a tag in a file the compiler never sees as JSX.
 */
describe('native video does not appear in app source', () => {
  it('contains no video tag and no createElement("video") outside tests', () => {
    const offenders: string[] = [];
    const videoTag = ['<', 'video'].join('');
    const createVideo = "createElement('video')";
    const createVideoDouble = 'createElement("video")';

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      if (isTestFile(path)) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (isCommentLine(line)) {
            return;
          }
          if (
            line.includes(videoTag) ||
            line.includes(createVideo) ||
            line.includes(createVideoDouble)
          ) {
            offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The coin→Beans rate does not exist, and inventing one is a commercial decision this client is
 * not allowed to make (`docs/plan/cycle-3-backlog.md` C3-09). A constant here would be believed.
 */
describe('no coin-to-Beans rate is invented on the client', () => {
  it('names no beansPerCoin, coinToBeans or BEANS_RATE outside comments', () => {
    const offenders: string[] = [];
    const rate = /\b(beansPerCoin|coinToBeans|BEANS_RATE|beansRate)\b/;

    for (const file of sourceFiles()) {
      const path = relativeToApp(file);
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (isCommentLine(line) || isTestFile(path)) {
            return;
          }
          if (rate.test(line)) {
            offenders.push(`${path}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
