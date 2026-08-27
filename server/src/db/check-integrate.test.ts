import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkIntegrate, refuseNonFileDatabase } from './check-integrate.js';

/**
 * Reverse verification for G2.2. The L2 job runs the CLI; these fixtures are the injection that
 * proves an in-memory URL, a postgres URL, or a redis URL turns the check red rather than being
 * rewritten to a file. A coverage number without a failing fixture is the D-01 shape; an
 * integration job that only hits `/health` is the same shape for "real database".
 */

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqliteUrl(): string {
  const dir = mkdtempSync(join(tmpdir(), 'check-integrate-'));
  tempDirs.push(dir);
  return `sqlite:${join(dir, 'g22.sqlite')}`;
}

describe('refuseNonFileDatabase', () => {
  it('fails when DATABASE_URL is unset-shaped (empty)', () => {
    expect(refuseNonFileDatabase('')).toContain('in-memory, which is not a real database');
  });

  it('fails on sqlite :memory:', () => {
    expect(refuseNonFileDatabase('sqlite::memory:')).toContain(
      'G2.2 requires a sqlite file; in-memory is not an integration suite',
    );
  });

  it('fails on postgres and does not rewrite it to a file', () => {
    const message = refuseNonFileDatabase('postgres://localhost/minidrama');
    expect(message).toContain('scheme "postgres"');
    expect(message).toContain('does not rewrite postgres or redis to a file');
  });

  it('fails on redis rather than faking a cache', () => {
    const message = refuseNonFileDatabase('redis://localhost:6379');
    expect(message).toContain('scheme "redis"');
    expect(message).toContain('does not rewrite postgres or redis to a file');
  });

  it('accepts a sqlite file path', () => {
    expect(refuseNonFileDatabase('sqlite:/tmp/g22.sqlite')).toBeUndefined();
  });
});

describe('checkIntegrate', () => {
  it('passes against a real sqlite file: catalogue, session, favourite bounce, gateway refused', async () => {
    const result = await checkIntegrate({ databaseUrl: tempSqliteUrl() });

    expect(result).toEqual({
      ok: true,
      dramaId: 'drm_revenge_0001',
      message:
        'integrate against sqlite passed (catalogue, session, favourite bounce, gateway refused)',
    });
  });

  it('fails when pointed at in-memory sqlite, rather than reporting a bounce that never hit disk', async () => {
    const result = await checkIntegrate({ databaseUrl: 'sqlite::memory:' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('in-memory is not an integration suite');
  });

  it('fails on a postgres URL instead of opening a sqlite file behind it', async () => {
    const result = await checkIntegrate({ databaseUrl: 'postgres://localhost/minidrama' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('scheme "postgres"');
    expect(result.message).not.toContain('passed');
  });

  it('fails on a redis URL instead of installing a no-op client', async () => {
    const result = await checkIntegrate({ databaseUrl: 'redis://127.0.0.1:6379' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('scheme "redis"');
  });
});
