import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  evaluateLicense,
  formatViolation,
  isCaseByCaseAllowed,
  scanPnpmStore,
  violationsFor,
} from './licenses.js';
import { repoRoot } from './paths.js';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop() ?? '', { recursive: true, force: true });
  }
});

function storeWith(
  packages: ReadonlyArray<{
    readonly name: string;
    readonly version: string;
    readonly license?: unknown;
    readonly licenses?: unknown;
  }>,
): string {
  const root = mkdtempSync(join(tmpdir(), 'license-store-'));
  fixtures.push(root);

  for (const pkg of packages) {
    const folder = pkg.name.startsWith('@') ? pkg.name.replace('/', '+') : pkg.name;
    const slot = join(root, `${folder}@${pkg.version}`, 'node_modules');
    const dest = pkg.name.startsWith('@')
      ? join(slot, ...pkg.name.split('/'))
      : join(slot, pkg.name);
    mkdirSync(dest, { recursive: true });
    const body: Record<string, unknown> = {
      name: pkg.name,
      version: pkg.version,
    };
    if (pkg.license !== undefined) body.license = pkg.license;
    if (pkg.licenses !== undefined) body.licenses = pkg.licenses;
    writeFileSync(join(dest, 'package.json'), `${JSON.stringify(body, null, 2)}\n`);
  }

  return root;
}

describe('evaluateLicense', () => {
  it.each([
    'MIT',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'ISC',
    '0BSD',
    'Unlicense',
    'CC0-1.0',
  ])('allows the stack-decision §4 id %s', (id) => {
    expect(evaluateLicense(id)).toEqual({ ok: true });
  });

  it.each(['MIT-0', 'BlueOak-1.0.0', 'Python-2.0', 'CC-BY-4.0'])(
    'allows the id already in the tree at introduction: %s',
    (id) => {
      expect(evaluateLicense(id)).toEqual({ ok: true });
    },
  );

  it('allows a dual-licensed package that offers an allowed choice', () => {
    expect(evaluateLicense('MIT OR GPL-3.0')).toEqual({ ok: true });
    expect(evaluateLicense('(BSD-3-Clause OR MIT)')).toEqual({ ok: true });
  });

  it('allows MIT*', () => {
    expect(evaluateLicense('MIT*')).toEqual({ ok: true });
  });

  it('allows Apache-2.0 WITH an exception that is not Commons Clause', () => {
    expect(evaluateLicense('Apache-2.0 WITH LLVM-exception')).toEqual({ ok: true });
  });

  it.each(['GPL-3.0', 'GPL-3.0-only', 'GPL-2.0-or-later', 'AGPL-3.0', 'SSPL-1.0', 'BUSL-1.1'])(
    'forbids %s',
    (id) => {
      const result = evaluateLicense(id);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('forbidden');
      }
    },
  );

  it('forbids a conjunction that includes the GPL family', () => {
    const result = evaluateLicense('MIT AND GPL-3.0');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('forbidden');
    }
  });

  it('forbids Commons Clause, including the hyphenated exception form', () => {
    expect(evaluateLicense('Apache-2.0 WITH Commons-Clause').ok).toBe(false);
    expect(evaluateLicense('MIT with Commons Clause').ok).toBe(false);
  });

  it('refuses a missing license rather than treating it as nothing to check', () => {
    expect(evaluateLicense(undefined)).toEqual({ ok: false, reason: 'missing license' });
    expect(evaluateLicense('')).toEqual({ ok: false, reason: 'missing license' });
  });

  it('refuses an id that is not on the allow-list, even when it is not the GPL family', () => {
    const result = evaluateLicense('MPL-2.0');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('allow-list');
    }
  });

  it('refuses LGPL, which stack-decision §4 leaves as case-by-case', () => {
    const result = evaluateLicense('LGPL-3.0-only');
    expect(result.ok).toBe(false);
  });
});

describe('scanPnpmStore', () => {
  it('reads the packages pnpm installed and ignores nested fixture package.json files', () => {
    const store = storeWith([
      { name: 'left-pad', version: '1.3.0', license: 'MIT' },
      { name: '@scope/pkg', version: '2.0.0', license: 'ISC' },
    ]);
    mkdirSync(join(store, 'left-pad@1.3.0', 'node_modules', 'left-pad', 'benchmarks'), {
      recursive: true,
    });
    writeFileSync(
      join(store, 'left-pad@1.3.0', 'node_modules', 'left-pad', 'benchmarks', 'package.json'),
      JSON.stringify({ name: 'benchmarks', version: '1.0.0' }),
    );

    const packages = scanPnpmStore(store);
    expect(packages.map((pkg) => `${pkg.name}@${pkg.version}`)).toEqual([
      '@scope/pkg@2.0.0',
      'left-pad@1.3.0',
    ]);
    expect(packages.find((pkg) => pkg.name === 'benchmarks')).toBeUndefined();
  });

  it('deduplicates name@version when pnpm materialises the same package in two slots', () => {
    const store = storeWith([{ name: 'left-pad', version: '1.3.0', license: 'MIT' }]);
    const other = join(store, 'other@9.0.0', 'node_modules', 'left-pad');
    mkdirSync(other, { recursive: true });
    writeFileSync(
      join(other, 'package.json'),
      JSON.stringify({ name: 'left-pad', version: '1.3.0', license: 'MIT' }),
    );

    expect(scanPnpmStore(store)).toHaveLength(1);
  });

  it('reads the historical { type } license object and the licenses array', () => {
    const store = storeWith([
      { name: 'old-object', version: '1.0.0', license: { type: 'MIT', url: 'https://mit' } },
      { name: 'old-array', version: '1.0.0', licenses: [{ type: 'ISC' }] },
    ]);
    const violations = violationsFor(scanPnpmStore(store));
    expect(violations).toEqual([]);
  });
});

describe('violationsFor', () => {
  it('names the GPL package and not the MIT neighbour', () => {
    const store = storeWith([
      { name: 'clean', version: '1.0.0', license: 'MIT' },
      { name: 'copyleft', version: '2.0.0', license: 'GPL-3.0' },
    ]);
    const violations = violationsFor(scanPnpmStore(store));
    expect(violations).toHaveLength(1);
    expect(formatViolation(violations[0]!)).toContain('copyleft@2.0.0');
    expect(formatViolation(violations[0]!)).toContain('GPL-3.0');
  });

  it('allows axe-core MPL-2.0 as the QA-010 case and still refuses a different MPL package', () => {
    const store = storeWith([
      { name: 'axe-core', version: '4.13.0', license: 'MPL-2.0' },
      { name: 'other-mpl', version: '1.0.0', license: 'MPL-2.0' },
    ]);
    const violations = violationsFor(scanPnpmStore(store));
    expect(violations).toHaveLength(1);
    expect(violations[0]?.name).toBe('other-mpl');
    expect(
      isCaseByCaseAllowed({
        name: 'axe-core',
        version: '4.13.0',
        license: 'MPL-2.0',
        path: 'x',
      }),
    ).toBe(true);
    expect(
      isCaseByCaseAllowed({
        name: 'axe-core',
        version: '4.13.0',
        license: undefined,
        path: 'x',
      }),
    ).toBe(false);
  });
});

describe('the real install', () => {
  it('has no G2.8 violations in the current pnpm store', () => {
    const store = join(repoRoot, 'node_modules', '.pnpm');
    const violations = violationsFor(scanPnpmStore(store));
    expect(violations).toEqual([]);
  });
});
