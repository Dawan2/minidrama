import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkIntegrate,
  parseIntegrateArgs,
  refuseNonFileDatabase,
  runIntegrateCli,
} from './check-integrate.js';

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

function memoryStream(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return { stream, text: () => chunks.join('') };
}

describe('parseIntegrateArgs', () => {
  it('rejects an unknown flag rather than ignoring it', () => {
    expect(parseIntegrateArgs(['--allow-unknown'])).toEqual({
      ok: false,
      message: 'unknown argument: --allow-unknown',
    });
  });

  it('rejects --db without a path', () => {
    expect(parseIntegrateArgs(['--db'])).toEqual({
      ok: false,
      message: '--db requires a path',
    });
  });

  it('rejects --url without a value', () => {
    expect(parseIntegrateArgs(['--url'])).toEqual({
      ok: false,
      message: '--url requires a DATABASE_URL',
    });
  });

  it('rejects --db and --url together', () => {
    expect(parseIntegrateArgs(['--db', '/tmp/a.sqlite', '--url', 'sqlite:/tmp/b.sqlite'])).toEqual({
      ok: false,
      message: '--db and --url cannot both be set',
    });
    expect(parseIntegrateArgs(['--url', 'sqlite:/tmp/b.sqlite', '--db', '/tmp/a.sqlite'])).toEqual({
      ok: false,
      message: '--db and --url cannot both be set',
    });
  });

  it('turns --db into a sqlite URL', () => {
    expect(parseIntegrateArgs(['--db', '/tmp/g22.sqlite'])).toEqual({
      ok: true,
      databaseUrl: 'sqlite:/tmp/g22.sqlite',
    });
  });

  it('passes --url through', () => {
    expect(parseIntegrateArgs(['--url', 'postgres://localhost/minidrama'])).toEqual({
      ok: true,
      databaseUrl: 'postgres://localhost/minidrama',
    });
  });

  it('omits the URL when no flags are given, so the CLI creates a temp file', () => {
    expect(parseIntegrateArgs([])).toEqual({ ok: true, databaseUrl: undefined });
  });
});

describe('runIntegrateCli', () => {
  it('exits 2 on an unknown argument', async () => {
    const stdout = memoryStream();
    const stderr = memoryStream();

    const code = await runIntegrateCli(['--allow-unknown'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    expect(code).toBe(2);
    expect(stderr.text()).toContain('unknown argument');
    expect(stdout.text()).not.toContain('passed');
  });

  it('exits 1 on a postgres URL rather than rewriting it to a file', async () => {
    const stdout = memoryStream();
    const stderr = memoryStream();

    const code = await runIntegrateCli(['--url', 'postgres://localhost/minidrama'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain('scheme "postgres"');
    expect(stdout.text()).not.toContain('passed');
  });

  it('exits 1 on sqlite :memory:', async () => {
    const stdout = memoryStream();
    const stderr = memoryStream();

    const code = await runIntegrateCli(['--url', 'sqlite::memory:'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain('in-memory is not an integration suite');
  });

  it('exits 0 against a real sqlite file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-integrate-cli-lib-'));
    tempDirs.push(dir);
    const stdout = memoryStream();
    const stderr = memoryStream();

    const code = await runIntegrateCli(['--db', join(dir, 'g22.sqlite')], {
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain(
      'integrate against sqlite passed (catalogue, session, favourite bounce, gateway refused)',
    );
    expect(stderr.text()).not.toContain('in-memory');
  });

  it('exits 0 when it has to create the temp sqlite file itself', async () => {
    const stdout = memoryStream();
    const stderr = memoryStream();

    const code = await runIntegrateCli([], { stdout: stdout.stream, stderr: stderr.stream });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('integrate against sqlite passed');
  });
});

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
