import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  HIGH_FIX_GRACE_MS,
  LOCKFILE_NAME,
  USAGE,
  buildTrivyArgv,
  defaultLockfile,
  defaultTrivyRunner,
  formatVulnerability,
  isBlockingVulnerability,
  isDockerfileName,
  isImageTarballName,
  listImageSubjects,
  parseScaArgs,
  parseTrivyResults,
  parseTrivyVulnerability,
  runScaCheck,
  type ScaVulnerability,
  type TrivyRunResult,
} from './sca.js';

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

function writeLockfile(root: string, name: string = LOCKFILE_NAME): string {
  const path = join(root, name);
  writeFileSync(path, 'lockfileVersion: 9.0\n');
  return path;
}

function vulnJson(options: {
  readonly target?: string;
  readonly type?: string;
  readonly className?: string;
  readonly vulns?: ReadonlyArray<Record<string, unknown>>;
}): string {
  return JSON.stringify({
    Results: [
      {
        Target: options.target ?? 'pnpm-lock.yaml',
        Class: options.className ?? 'lang-pkgs',
        Type: options.type ?? 'pnpm',
        Vulnerabilities: options.vulns,
      },
    ],
  });
}

function runnerOf(result: TrivyRunResult): () => TrivyRunResult {
  return () => result;
}

function sampleVuln(overrides: Partial<ScaVulnerability> = {}): ScaVulnerability {
  return {
    id: 'CVE-2024-0001',
    pkgName: 'lodash',
    installedVersion: '4.17.20',
    fixedVersion: '4.17.21',
    severity: 'HIGH',
    publishedAtMs: Date.parse('2020-01-01T00:00:00Z'),
    target: 'pnpm-lock.yaml',
    ...overrides,
  };
}

describe('parseScaArgs', () => {
  it('defaults the lockfile to pnpm-lock.yaml under the named root', () => {
    const parsed = parseScaArgs([], '/repo');
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/repo',
        lockfile: '/repo/pnpm-lock.yaml',
        trivyBin: 'trivy',
      },
    });
  });

  it('accepts --root, --lockfile, and --trivy', () => {
    const parsed = parseScaArgs(
      ['--root', '/app', '--lockfile', '/app/pnpm-lock.yaml', '--trivy', '/bin/trivy'],
      '/repo',
    );
    expect(parsed).toEqual({
      ok: true,
      args: {
        root: '/app',
        lockfile: '/app/pnpm-lock.yaml',
        trivyBin: '/bin/trivy',
      },
    });
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    expect(parseScaArgs(['--allow-unknown'], '/repo')).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects a flag with no value', () => {
    expect(parseScaArgs(['--lockfile'], '/repo')).toEqual({
      ok: false,
      message: '--lockfile requires a path',
    });
    expect(parseScaArgs(['--trivy', '--root', '/x'], '/repo')).toEqual({
      ok: false,
      message: '--trivy requires a path',
    });
    expect(parseScaArgs(['--root'], '/repo')).toEqual({
      ok: false,
      message: '--root requires a directory',
    });
  });

  it('documents the usage string the CLI prints on parse failure', () => {
    expect(USAGE).toContain('check-sca');
    expect(USAGE).toContain('--trivy');
    expect(defaultLockfile('/repo')).toBe('/repo/pnpm-lock.yaml');
  });
});

describe('image subject names', () => {
  it('recognises Dockerfile names and image tarballs', () => {
    expect(isDockerfileName('Dockerfile')).toBe(true);
    expect(isDockerfileName('Dockerfile.dev')).toBe(true);
    expect(isDockerfileName('web.dockerfile')).toBe(true);
    expect(isDockerfileName('package.json')).toBe(false);
    expect(isImageTarballName('image.tar')).toBe(true);
    expect(isImageTarballName('image.tar.gz')).toBe(true);
    expect(isImageTarballName('app.oci.tar')).toBe(true);
    expect(isImageTarballName('notes.txt')).toBe(false);
  });

  it('lists Dockerfiles and tarballs, skipping node_modules', () => {
    const root = tempDir('sca-img-');
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(root, 'Dockerfile'), 'FROM scratch\n');
    writeFileSync(join(root, 'image.tar'), 'not-an-image');
    writeFileSync(join(root, 'node_modules', 'pkg', 'Dockerfile'), 'FROM scratch\n');
    expect(listImageSubjects(root)).toEqual([join(root, 'Dockerfile'), join(root, 'image.tar')]);
  });
});

describe('isBlockingVulnerability', () => {
  const now = Date.parse('2026-08-27T00:00:00Z');

  it('blocks every CRITICAL finding, even without a fix', () => {
    expect(
      isBlockingVulnerability(
        sampleVuln({ severity: 'CRITICAL', fixedVersion: '', publishedAtMs: undefined }),
        now,
      ),
    ).toBe(true);
  });

  it('blocks HIGH with a fix older than seven days', () => {
    expect(
      isBlockingVulnerability(
        sampleVuln({
          severity: 'HIGH',
          fixedVersion: '1.2.3',
          publishedAtMs: now - HIGH_FIX_GRACE_MS - 1,
        }),
        now,
      ),
    ).toBe(true);
  });

  it('does not block HIGH with a fix published inside the grace window', () => {
    expect(
      isBlockingVulnerability(
        sampleVuln({
          severity: 'HIGH',
          fixedVersion: '1.2.3',
          publishedAtMs: now - HIGH_FIX_GRACE_MS + 1000,
        }),
        now,
      ),
    ).toBe(false);
  });

  it('blocks HIGH with a fix and no published date, rather than greening on missing clocks', () => {
    expect(
      isBlockingVulnerability(
        sampleVuln({ severity: 'HIGH', fixedVersion: '1.2.3', publishedAtMs: undefined }),
        now,
      ),
    ).toBe(true);
  });

  it('does not block HIGH with no fix, or MEDIUM/LOW', () => {
    expect(isBlockingVulnerability(sampleVuln({ severity: 'HIGH', fixedVersion: '' }), now)).toBe(
      false,
    );
    expect(isBlockingVulnerability(sampleVuln({ severity: 'MEDIUM' }), now)).toBe(false);
    expect(isBlockingVulnerability(sampleVuln({ severity: 'LOW' }), now)).toBe(false);
  });
});

describe('parseTrivyResults', () => {
  it('reads language-package targets and vulnerabilities', () => {
    const evaluated = parseTrivyResults(
      vulnJson({
        vulns: [
          {
            VulnerabilityID: 'CVE-2024-0001',
            PkgName: 'lodash',
            InstalledVersion: '4.17.20',
            FixedVersion: '4.17.21',
            Severity: 'HIGH',
            PublishedDate: '2020-01-01T00:00:00Z',
          },
        ],
      }),
    );
    expect(evaluated.targets).toEqual(['pnpm-lock.yaml']);
    expect(evaluated.vulns).toHaveLength(1);
    expect(formatVulnerability(evaluated.vulns[0]!)).toBe(
      'CVE-2024-0001 lodash@4.17.20 HIGH (fixed 4.17.21) pnpm-lock.yaml',
    );
  });

  it('treats a missing Vulnerabilities array as zero findings, not an error', () => {
    const evaluated = parseTrivyResults(vulnJson({}));
    expect(evaluated.targets).toEqual(['pnpm-lock.yaml']);
    expect(evaluated.vulns).toEqual([]);
  });

  it('falls back to LastModifiedDate when PublishedDate is empty', () => {
    const evaluated = parseTrivyResults(
      vulnJson({
        vulns: [
          {
            VulnerabilityID: 'CVE-1',
            PkgName: 'x',
            InstalledVersion: '1',
            FixedVersion: '2',
            Severity: 'HIGH',
            PublishedDate: '',
            LastModifiedDate: '2020-06-01T00:00:00Z',
          },
        ],
      }),
    );
    expect(evaluated.vulns[0]?.publishedAtMs).toBe(Date.parse('2020-06-01T00:00:00Z'));
  });

  it('formats an unfixed package without inventing a version', () => {
    expect(
      formatVulnerability(
        sampleVuln({ installedVersion: '', fixedVersion: '', pkgName: 'left-pad' }),
      ),
    ).toBe('CVE-2024-0001 left-pad HIGH (unfixed) pnpm-lock.yaml');
  });

  it('fails closed on non-JSON, a missing Results array, and a non-object result', () => {
    expect(() => parseTrivyResults('not json')).toThrow(/not JSON/);
    expect(() => parseTrivyResults('[]')).toThrow(/not an object/);
    expect(() => parseTrivyResults('{"SchemaVersion":2}')).toThrow(/missing Results/);
    expect(() => parseTrivyResults('{"Results":[null]}')).toThrow(/result is not an object/);
    expect(() => parseTrivyResults('{"Results":[{"Target":"x","Vulnerabilities":{}}]}')).toThrow(
      /Vulnerabilities is not an array/,
    );
  });

  it('rejects a vulnerability that is not an object', () => {
    expect(() => parseTrivyVulnerability(null, 'x')).toThrow(/not an object/);
  });

  it('does not treat a config-class result as a language-package target', () => {
    const evaluated = parseTrivyResults(
      vulnJson({ className: 'config', type: 'dockerfile', target: 'Dockerfile' }),
    );
    expect(evaluated.targets).toEqual([]);
  });

  it('accepts Type pnpm even when Class is omitted', () => {
    const evaluated = parseTrivyResults(vulnJson({ className: '', type: 'pnpm' }));
    expect(evaluated.targets).toEqual(['pnpm-lock.yaml']);
  });

  it('treats an unparseable published date as missing rather than inventing a clock', () => {
    const evaluated = parseTrivyResults(
      vulnJson({
        vulns: [
          {
            VulnerabilityID: 'CVE-1',
            PkgName: 'x',
            InstalledVersion: '1',
            FixedVersion: '2',
            Severity: 'HIGH',
            PublishedDate: 'not-a-date',
            LastModifiedDate: 'also-bad',
          },
        ],
      }),
    );
    expect(evaluated.vulns[0]?.publishedAtMs).toBeUndefined();
  });
});

describe('buildTrivyArgv', () => {
  it('points Trivy at the lockfile as filesystem SCA, never a grep', () => {
    const argv = buildTrivyArgv({ lockfile: '/repo/pnpm-lock.yaml' });
    expect(argv[0]).toBe('fs');
    expect(argv).toContain('--format');
    expect(argv).toContain('json');
    expect(argv).toContain('--scanners');
    expect(argv).toContain('vuln');
    expect(argv.at(-1)).toBe('/repo/pnpm-lock.yaml');
    expect(argv.filter((flag) => flag.includes('grep'))).toEqual([]);
  });

  it('reports ENOENT from the default runner so a missing binary cannot look like a clean scan', () => {
    const run = defaultTrivyRunner({
      bin: '/no/such/trivy-binary',
      argv: ['version'],
      cwd: tmpdir(),
    });
    expect(run.status).toBeNull();
    expect(run.error).toBeDefined();
    expect((run.error as NodeJS.ErrnoException).code).toBe('ENOENT');
  });
});

describe('runScaCheck', () => {
  const now = Date.parse('2026-08-27T00:00:00Z');

  it('fails when the scan root is missing', () => {
    const root = tempDir('sca-missing-root-');
    const output = runScaCheck(
      {
        root: join(root, 'no-src'),
        lockfile: join(root, 'pnpm-lock.yaml'),
        trivyBin: 'trivy',
      },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('scan root is required');
  });

  it('fails when the lockfile path exists but is not a file', () => {
    const root = tempDir('sca-lockdir-');
    mkdirSync(join(root, LOCKFILE_NAME));
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('lockfile is required');
  });

  it('fails when the lockfile is missing', () => {
    const root = tempDir('sca-nolock-');
    const output = runScaCheck(
      { root, lockfile: join(root, 'pnpm-lock.yaml'), trivyBin: 'trivy' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('lockfile is required');
    expect(output.stdout).not.toContain('sca passed');
  });

  it('fails when a Dockerfile is present, rather than reporting 0 images over it', () => {
    const root = tempDir('sca-docker-');
    writeLockfile(root);
    writeFileSync(join(root, 'Dockerfile'), 'FROM scratch\n');
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({ status: 0, stdout: vulnJson({}), stderr: '', error: undefined }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('container image scan has not run');
    expect(output.stderr).toContain('Dockerfile');
  });

  it('fails when Trivy is not on PATH', () => {
    const root = tempDir('sca-nobin-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: '/no/such/trivy' },
      runnerOf({
        status: null,
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('spawn /no/such/trivy ENOENT'), { code: 'ENOENT' }),
      }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('trivy is required');
    expect(output.stdout).not.toContain('sca passed');
  });

  it('fails when Trivy exits 2', () => {
    const root = tempDir('sca-crash-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({ status: 2, stdout: '', stderr: 'db download failed', error: undefined }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('trivy failed (2)');
    expect(output.stderr).toContain('db download failed');
  });

  it('fails when Trivy prints nothing', () => {
    const root = tempDir('sca-silent-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({ status: 0, stdout: '', stderr: '', error: undefined }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('trivy produced no JSON');
  });

  it('fails when Trivy reports no language-package targets', () => {
    const root = tempDir('sca-notargets-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({
        status: 0,
        stdout: JSON.stringify({ Results: [] }),
        stderr: '',
        error: undefined,
      }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('no language-package targets');
  });

  it('fails when Trivy reports a CRITICAL finding', () => {
    const root = tempDir('sca-crit-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({
        status: 0,
        stdout: vulnJson({
          vulns: [
            {
              VulnerabilityID: 'CVE-2024-9999',
              PkgName: 'evil',
              InstalledVersion: '1.0.0',
              FixedVersion: '',
              Severity: 'CRITICAL',
            },
          ],
        }),
        stderr: '',
        error: undefined,
      }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('sca failed (1)');
    expect(output.stderr).toContain('CVE-2024-9999');
    expect(output.stderr).toContain('CRITICAL');
    expect(output.stdout).not.toContain('sca passed');
  });

  it('fails when Trivy reports HIGH with a fix older than seven days', () => {
    const root = tempDir('sca-high-old-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({
        status: 0,
        stdout: vulnJson({
          vulns: [
            {
              VulnerabilityID: 'CVE-2020-0001',
              PkgName: 'lodash',
              InstalledVersion: '4.17.20',
              FixedVersion: '4.17.21',
              Severity: 'HIGH',
              PublishedDate: '2020-01-01T00:00:00Z',
            },
          ],
        }),
        stderr: '',
        error: undefined,
      }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('CVE-2020-0001');
  });

  it('passes when Trivy returns JSON with no blocking findings', () => {
    const root = tempDir('sca-clean-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({
        status: 0,
        stdout: vulnJson({
          vulns: [
            {
              VulnerabilityID: 'CVE-2026-1',
              PkgName: 'fresh',
              InstalledVersion: '1.0.0',
              FixedVersion: '1.0.1',
              Severity: 'HIGH',
              PublishedDate: '2026-08-25T00:00:00Z',
            },
          ],
        }),
        stderr: '',
        error: undefined,
      }),
      now,
    );
    expect(output.stderr).toBe('');
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('sca passed');
    expect(output.stdout).toContain('0 images');
    expect(output.stdout).toContain('1 non-blocking findings');
  });

  it('passes when Trivy exits 1 with JSON that has no blocking findings', () => {
    const root = tempDir('sca-exit1-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({
        status: 1,
        stdout: vulnJson({
          vulns: [
            {
              VulnerabilityID: 'CVE-2024-low',
              PkgName: 'x',
              InstalledVersion: '1',
              FixedVersion: '2',
              Severity: 'LOW',
            },
          ],
        }),
        stderr: '',
        error: undefined,
      }),
      now,
    );
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('sca passed');
  });

  it('does not fail the gate on MEDIUM-only findings', () => {
    const root = tempDir('sca-medium-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({
        status: 0,
        stdout: vulnJson({
          vulns: [
            {
              VulnerabilityID: 'CVE-2024-low',
              PkgName: 'x',
              InstalledVersion: '1',
              FixedVersion: '2',
              Severity: 'MEDIUM',
            },
          ],
        }),
        stderr: '',
        error: undefined,
      }),
      now,
    );
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('1 non-blocking findings');
  });

  it('fails when the engine JSON is garbage after a findings exit', () => {
    const root = tempDir('sca-garbage-');
    writeLockfile(root);
    const output = runScaCheck(
      { root, lockfile: join(root, LOCKFILE_NAME), trivyBin: 'trivy' },
      runnerOf({ status: 1, stdout: '<html>nope</html>', stderr: '', error: undefined }),
      now,
    );
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('trivy output was not JSON');
  });
});
