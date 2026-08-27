import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkSqliteIntegration, refuseDatabaseUrl, sqliteFileUrl } from './check-integration.js';

/**
 * Reverse verification for G2.2. The L2 job runs the CLI; these fixtures are the injection that
 * proves an in-memory path, a `:memory:` database, or a postgres URL turns the check red. A job
 * that only `inject`s against one process is the D-01 shape for "real dependencies".
 */

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('refuseDatabaseUrl', () => {
  it('fails when DATABASE_URL is unset', () => {
    expect(refuseDatabaseUrl('')).toContain('unset DATABASE_URL is in-memory');
  });

  it('fails on :memory: rather than treating a connection as a file', () => {
    expect(refuseDatabaseUrl('sqlite::memory:')).toContain(':memory: is not a database');
    expect(refuseDatabaseUrl(':memory:')).toContain(':memory: is not a database');
  });

  it('fails on postgres rather than rewriting it to a file', () => {
    expect(refuseDatabaseUrl('postgres://localhost/minidrama')).toContain('scheme "postgres"');
    expect(refuseDatabaseUrl('postgres://localhost/minidrama')).toContain('not faked as a file');
  });

  it('fails on redis rather than starting a fake cache', () => {
    expect(refuseDatabaseUrl('redis://localhost:6379')).toContain('scheme "redis"');
  });
});

describe('checkSqliteIntegration', () => {
  it('passes HTTP login and a favourite against a real sqlite file after a restart', async () => {
    const dir = tempDir('check-integration-real-');
    const result = await checkSqliteIntegration({
      databaseUrl: sqliteFileUrl(join(dir, 'g22.sqlite')),
    });

    expect(result).toEqual({
      ok: true,
      dramaId: 'drm_revenge_0001',
      message:
        'sqlite integration passed: HTTP service, file-backed session and favourite survived a restart',
    });
  });

  it('fails when DATABASE_URL is unset rather than running in-memory stores', async () => {
    const result = await checkSqliteIntegration({ databaseUrl: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('unset DATABASE_URL is in-memory');
  });

  it('fails on :memory: rather than a bounce inside one process', async () => {
    const result = await checkSqliteIntegration({ databaseUrl: 'sqlite::memory:' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(':memory: is not a database');
  });

  it('fails on a postgres URL rather than serving sqlite behind it', async () => {
    const result = await checkSqliteIntegration({
      databaseUrl: 'postgres://localhost/minidrama',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('scheme "postgres"');
    expect(result.message).not.toContain('survived a restart');
  });
});
