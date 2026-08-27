// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Proves the platform enforcement matrix is live.
 *
 * `docs/architecture/tech-stack.md` §6 promises that each platform rule "fails the build, not the
 * review". A lint rule that was silently dropped during a config refactor would keep that promise
 * on paper and break it in practice, and nothing else would notice until the platform code scan
 * rejected a release. So the real config is run against fixtures here.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const configPath = fileURLToPath(new URL('../../eslint.config.js', import.meta.url));

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: configPath });
});

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? '');
}

describe('platform lint guardrails', () => {
  it.each([
    ['eval', 'export const x = eval("1 + 1");'],
    ['the Function constructor', 'export const f = new Function("return 1");'],
    ['string-form setTimeout', 'export const t = () => { setTimeout("go()", 1); };'],
  ])('rejects %s in client code', async (_label, code) => {
    const ruleIds = await ruleIdsFor(code, 'app/src/features/probe.ts');
    expect(ruleIds).toContain('no-restricted-syntax');
  });

  it('rejects a native video element in JSX', async () => {
    const ruleIds = await ruleIdsFor(
      'export const V = () => <video src="x" />;',
      'app/src/features/probe.tsx',
    );
    expect(ruleIds).toContain('no-restricted-syntax');
  });

  it('rejects an imperatively created video element', async () => {
    const ruleIds = await ruleIdsFor(
      'export const v = document.createElement("video");',
      'app/src/features/probe.ts',
    );
    expect(ruleIds).toContain('no-restricted-syntax');
  });

  it('rejects an iframe', async () => {
    const ruleIds = await ruleIdsFor(
      'export const F = () => <iframe title="x" />;',
      'app/src/features/probe.tsx',
    );
    expect(ruleIds).toContain('no-restricted-syntax');
  });

  it.each(['hls.js', 'video.js', 'shaka-player', 'dashjs'])(
    'rejects importing %s',
    async (packageName) => {
      const ruleIds = await ruleIdsFor(
        `import x from '${packageName}';\nexport default x;`,
        'app/src/features/probe.ts',
      );
      expect(ruleIds).toContain('no-restricted-imports');
    },
  );

  it.each([
    ['clipboard', 'export const c = () => navigator.clipboard.writeText("x");'],
    ['geolocation', 'export const g = navigator.geolocation;'],
  ])('rejects the blocked %s web API', async (_label, code) => {
    const ruleIds = await ruleIdsFor(code, 'app/src/features/probe.ts');
    expect(ruleIds).toContain('no-restricted-syntax');
  });

  it('rejects a direct TTMinis reference outside the platform directory', async () => {
    const ruleIds = await ruleIdsFor(
      'export const p = window.TTMinis;',
      'app/src/features/probe.ts',
    );
    expect(ruleIds).toContain('no-restricted-syntax');
  });

  it('allows a direct TTMinis reference inside the platform directory', async () => {
    const ruleIds = await ruleIdsFor(
      'export const p = window.TTMinis;',
      'app/src/platform/probe.ts',
    );
    expect(ruleIds).not.toContain('no-restricted-syntax');
  });

  it('accepts ordinary client code', async () => {
    const ruleIds = await ruleIdsFor(
      'export const add = (a: number, b: number): number => a + b;',
      'app/src/features/probe.ts',
    );
    expect(ruleIds).toEqual([]);
  });
});
