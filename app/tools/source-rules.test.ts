// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PLATFORM_DIR, checkSourceTree, listSourceFiles } from './source-rules.js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));

describe('source tree rules', () => {
  it('finds the app sources', () => {
    const files = listSourceFiles(join(appRoot, 'src'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.endsWith('main.tsx'))).toBe(true);
  });

  it('accepts the source tree that ships in this repository', () => {
    expect(checkSourceTree(appRoot)).toEqual([]);
  });

  it('rejects a TTMinis reference outside the platform directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'minidrama-source-rules-'));
    mkdirSync(join(root, 'src', 'features'), { recursive: true });
    mkdirSync(join(root, PLATFORM_DIR), { recursive: true });
    writeFileSync(
      join(root, 'src', 'features', 'leaky.ts'),
      'export const p = window.TTMinis.getPlayer();\n',
    );
    writeFileSync(join(root, PLATFORM_DIR, 'ok.ts'), 'export const ns = window.TTMinis;\n');

    const violations = checkSourceTree(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe(join('src', 'features', 'leaky.ts'));
    expect(violations[0]?.line).toBe(1);
  });

  it('ignores TTMinis mentioned in a comment', () => {
    const root = mkdtempSync(join(tmpdir(), 'minidrama-source-rules-'));
    mkdirSync(join(root, 'src', 'features'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'features', 'documented.ts'),
      '// TTMinis is reached through the bridge.\nexport const x = 1;\n',
    );

    expect(checkSourceTree(root)).toEqual([]);
  });
});
