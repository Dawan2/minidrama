// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PLATFORM_DIR,
  VIDEO_REPLACE_INSTALLER,
  checkSourceTree,
  listSourceFiles,
} from './source-rules.js';

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

  /**
   * The case both first-line defences miss. The ESLint rule reads the AST and the bundle scan
   * greps the artifact, and each of them matches a literal `'video'`; neither sees a name that was
   * assembled somewhere else, which produces the blocked element just as effectively.
   */
  it('rejects a createElement whose element name is computed', () => {
    const root = mkdtempSync(join(tmpdir(), 'minidrama-source-rules-'));
    mkdirSync(join(root, 'src', 'player'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'player', 'sneaky.ts'),
      "const tag = ['vi', 'deo'].join('');\nexport const el = document.createElement(tag);\n",
    );

    const violations = checkSourceTree(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe('createElement must be given a literal element name');
    expect(violations[0]?.line).toBe(2);
  });

  it('accepts a createElement with a literal element name', () => {
    const root = mkdtempSync(join(tmpdir(), 'minidrama-source-rules-'));
    mkdirSync(join(root, 'src', 'player'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'player', 'surface.ts'),
      "export const el = document.createElement('div');\n",
    );

    expect(checkSourceTree(root)).toEqual([]);
  });

  it('rejects setValidateVideoReplaceElement outside the fail-closed installer', () => {
    const root = mkdtempSync(join(tmpdir(), 'minidrama-source-rules-'));
    mkdirSync(join(root, 'src', 'player'), { recursive: true });
    mkdirSync(join(root, PLATFORM_DIR), { recursive: true });
    writeFileSync(
      join(root, 'src', 'player', 'PlayerSurface.tsx'),
      'export const install = (ns: { replace: (cb: unknown) => void }): void => {\n' +
        '  ns.setValidateVideoReplaceElement((el) => el);\n' +
        '};\n',
    );
    writeFileSync(
      join(root, VIDEO_REPLACE_INSTALLER),
      "export const name = 'setValidateVideoReplaceElement';\n",
    );

    const violations = checkSourceTree(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe(join('src', 'player', 'PlayerSurface.tsx'));
    expect(violations[0]?.rule).toContain('setValidateVideoReplaceElement');
    expect(violations[0]?.evidence).toContain('(el) => el');
  });

  it('accepts setValidateVideoReplaceElement in the installer module', () => {
    const root = mkdtempSync(join(tmpdir(), 'minidrama-source-rules-'));
    mkdirSync(join(root, PLATFORM_DIR), { recursive: true });
    writeFileSync(
      join(root, VIDEO_REPLACE_INSTALLER),
      'export function install(ns: { setValidateVideoReplaceElement: (cb: () => null) => void }) {\n' +
        '  ns.setValidateVideoReplaceElement(() => null);\n' +
        '}\n',
    );

    expect(checkSourceTree(root)).toEqual([]);
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
