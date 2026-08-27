// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { DEFAULT_CAPSULE_INSET_PX } from './capsule-inset';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROUTES_DIR = join(APP_ROOT, 'src', 'routes');
const STYLES = join(APP_ROOT, 'src', 'styles', 'app.css');

/**
 * Every routed screen owes the capsule the same CSS class. A page that used a bare `<h1>` would
 * sit under the TikTok menu button, which is the finding C3-05 exists to close. The scan is the
 * reverse check: deleting `page__heading` from a screen fails here even if no unit test opened
 * that screen's heading.
 */
describe('capsule reservation', () => {
  it('the stylesheet default matches the number the shell falls back to', () => {
    const css = readFileSync(STYLES, 'utf8');
    expect(css).toContain(`--capsule-safe-area: ${DEFAULT_CAPSULE_INSET_PX}px`);
  });

  it('every routed page heading uses the class that reads that variable', () => {
    const pages = readdirSync(ROUTES_DIR).filter(
      (name) => name.endsWith('Page.tsx') && !name.endsWith('.test.tsx'),
    );
    expect(pages.length).toBeGreaterThan(5);

    const missing: string[] = [];
    for (const name of pages) {
      const source = readFileSync(join(ROUTES_DIR, name), 'utf8');
      if (!source.includes('page__heading')) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the heading and the home nav both consume the measured variable', () => {
    const css = readFileSync(STYLES, 'utf8');
    expect(css).toMatch(/\.page__heading[\s\S]*var\(--capsule-safe-area\)/);
    expect(css).toMatch(/\.page__nav[\s\S]*var\(--capsule-safe-area\)/);
  });
});
