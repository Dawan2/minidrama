import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkIntegrate,
  login,
  parseIntegrateArgs,
  probeAfterBounce,
  probeFirstProcess,
  readErrorCode,
  refuseNonFileDatabase,
  runIntegrateCli,
  type ProbeApp,
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

function scriptedApp(
  script: (opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }) => { statusCode: number; body: unknown },
): ProbeApp {
  return {
    inject: async (opts) => {
      const result = script(opts);
      return { statusCode: result.statusCode, json: <T>() => result.body as T };
    },
  };
}

function happyScript(opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: unknown;
}): { statusCode: number; body: unknown } {
  if (opts.url === '/health') return { statusCode: 200, body: { status: 'ok' } };
  if (opts.url === '/v1/dramas/drm_revenge_0001' && opts.method === 'GET') {
    return { statusCode: 200, body: { id: 'drm_revenge_0001' } };
  }
  if (opts.url === '/v1/auth/login') {
    const payload = opts.payload as { authCode?: string } | undefined;
    const code = payload?.authCode ?? '';
    return { statusCode: 200, body: { accessToken: `tok_${code}` } };
  }
  if (opts.method === 'PUT' && opts.url.endsWith('/favorite')) {
    return { statusCode: 204, body: null };
  }
  if (opts.method === 'GET' && opts.url.endsWith('/favorite')) {
    const auth = opts.headers?.['authorization'] ?? '';
    return { statusCode: 200, body: { favorited: auth.includes('g22_viewer_a') } };
  }
  if (opts.url === '/v1/wallet') return { statusCode: 200, body: {} };
  if (opts.url === '/v1/unlock/coin-orders') {
    return {
      statusCode: 503,
      body: { error: { code: 'COMMON_SERVICE_UNAVAILABLE', message: 'unavailable' } },
    };
  }
  if (opts.url === '/v1/users/me/favorites') {
    return {
      statusCode: 200,
      body: {
        items: [{ dramaId: 'drm_revenge_0001' }],
        pageInfo: { nextCursor: null, hasMore: false },
      },
    };
  }
  return { statusCode: 404, body: {} };
}

describe('readErrorCode', () => {
  it('returns undefined for a non-object, a body without error, and a non-string code', () => {
    expect(readErrorCode(null)).toBeUndefined();
    expect(readErrorCode('nope')).toBeUndefined();
    expect(readErrorCode({})).toBeUndefined();
    expect(readErrorCode({ error: null })).toBeUndefined();
    expect(readErrorCode({ error: {} })).toBeUndefined();
    expect(readErrorCode({ error: { code: 503 } })).toBeUndefined();
    expect(readErrorCode({ error: { code: 'COMMON_SERVICE_UNAVAILABLE' } })).toBe(
      'COMMON_SERVICE_UNAVAILABLE',
    );
  });
});

describe('probeFirstProcess reverse fixtures', () => {
  it('fails when /health is not 200', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url === '/health' ? { statusCode: 500, body: {} } : happyScript(opts),
      ),
    );
    expect(result).toEqual({ ok: false, message: 'GET /health returned 500' });
  });

  it('fails when the catalogue is not the sqlite store', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url.startsWith('/v1/dramas/') ? { statusCode: 404, body: {} } : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('catalogue is not the sqlite store');
  });

  it('fails when the catalogue serves a different drama id', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url.startsWith('/v1/dramas/') && opts.method === 'GET'
          ? { statusCode: 200, body: { id: 'drm_other_0002' } }
          : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('catalogue served drm_other_0002');
  });

  it('fails when login does not issue a session', async () => {
    const result = await login(
      scriptedApp(() => ({ statusCode: 401, body: {} })),
      'g22_viewer_a',
    );
    expect(result).toEqual({
      ok: false,
      message: 'login as g22_viewer_a returned 401, not a session',
    });
  });

  it('fails when login omits accessToken', async () => {
    const result = await login(
      scriptedApp(() => ({ statusCode: 200, body: {} })),
      'g22_viewer_a',
    );
    expect(result).toEqual({
      ok: false,
      message: 'login as g22_viewer_a did not issue an accessToken',
    });
  });

  it('fails when PUT favorite is not 204', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.method === 'PUT' ? { statusCode: 500, body: {} } : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('PUT favorite returned 500');
  });

  it("fails when viewer B sees viewer A's favourite", async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.method === 'GET' && opts.url.endsWith('/favorite')
          ? { statusCode: 200, body: { favorited: true } }
          : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain("viewer B saw viewer A's favourite");
  });

  it('fails when the wallet quotes a totalBalance figure', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url === '/v1/wallet'
          ? { statusCode: 200, body: { totalBalance: 0 } }
          : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('quoted a coin figure');
  });

  it('fails when the wallet quotes a coinBalance figure', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url === '/v1/wallet'
          ? { statusCode: 200, body: { coinBalance: 0 } }
          : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('quoted a coin figure');
  });

  it('fails when the wallet is not 200', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url === '/v1/wallet' ? { statusCode: 503, body: {} } : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('GET /v1/wallet returned 503');
  });

  it('fails when coin unlock invents a 201', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url === '/v1/unlock/coin-orders'
          ? { statusCode: 201, body: { orderId: 'ord_fake' } }
          : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('returned 201');
  });

  it('fails when coin unlock is not the refusing 503', async () => {
    const result = await probeFirstProcess(
      scriptedApp((opts) =>
        opts.url === '/v1/unlock/coin-orders' ? { statusCode: 400, body: {} } : happyScript(opts),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    if (typeof result === 'string' || result.ok) return;
    expect(result.message).toContain('expected 503 COMMON_SERVICE_UNAVAILABLE');
  });

  it('returns the viewer A token on the assembled happy path', async () => {
    const result = await probeFirstProcess(scriptedApp(happyScript));
    expect(typeof result).toBe('string');
  });
});

describe('probeAfterBounce reverse fixtures', () => {
  it('fails when the catalogue is gone after bounce', async () => {
    const result = await probeAfterBounce(
      scriptedApp((opts) =>
        opts.url.startsWith('/v1/dramas/') ? { statusCode: 500, body: {} } : happyScript(opts),
      ),
      'tok',
    );
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('after bounce, GET /v1/dramas/');
  });

  it('fails when the session did not survive', async () => {
    const result = await probeAfterBounce(
      scriptedApp((opts) =>
        opts.url === '/v1/users/me/favorites' ? { statusCode: 401, body: {} } : happyScript(opts),
      ),
      'tok',
    );
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('the session did not survive');
  });

  it('fails when the favourite did not survive', async () => {
    const result = await probeAfterBounce(
      scriptedApp((opts) =>
        opts.url === '/v1/users/me/favorites'
          ? { statusCode: 200, body: { items: [] } }
          : happyScript(opts),
      ),
      'tok',
    );
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('favourite did not survive the bounce');
  });

  it('fails when coin unlock invents a 201 after bounce', async () => {
    const result = await probeAfterBounce(
      scriptedApp((opts) =>
        opts.url === '/v1/unlock/coin-orders'
          ? { statusCode: 201, body: { orderId: 'ord_fake' } }
          : happyScript(opts),
      ),
      'tok',
    );
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('invented a trade order');
  });

  it('returns undefined on a surviving bounce', async () => {
    await expect(probeAfterBounce(scriptedApp(happyScript), 'tok')).resolves.toBeUndefined();
  });
});
