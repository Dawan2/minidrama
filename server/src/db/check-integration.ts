import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { mockAuthCode, TEST_LOGIN_ENABLE_VALUE } from '../modules/identity/test-login.js';
import { databaseNotWiredMessage, parseDatabaseUrl } from './database-url.js';

/**
 * G2.2 (`docs/14-quality-gates.md` §4): the HTTP service talks to a real sqlite file. The store
 * suites already prove a bounce via Fastify `inject`; this module is the L2 job's entry so an
 * in-memory path, a `:memory:` database, or a postgres URL fails CI the same way a no-op down
 * fails G2.7 — by the process exit status, not by a comment.
 *
 * Postgres is T14 and is not rewritten to a file. Redis is T15 and is not started. A check that
 * greened those by stubbing them would be how a later slot thinks the data layer is done.
 */

const DRAMA_ID = 'drm_revenge_0001';
const VIEWER_ID = 'usr_g22_integration';

export type IntegrationCheckResult =
  | {
      readonly ok: true;
      readonly dramaId: string;
      readonly message: string;
    }
  | { readonly ok: false; readonly message: string };

export function sqliteFileUrl(path: string): string {
  return `sqlite:${path}`;
}

export function refuseDatabaseUrl(databaseUrl: string): string | undefined {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed.kind === 'memory') {
    return 'G2.2 requires a real sqlite file; unset DATABASE_URL is in-memory, not a database';
  }
  if (parsed.kind === 'unwired') {
    return databaseNotWiredMessage(parsed.scheme);
  }
  if (parsed.path === ':memory:') {
    return 'G2.2 requires a real sqlite file; :memory: is not a database';
  }
  return undefined;
}

export async function checkSqliteIntegration(options: {
  readonly databaseUrl: string;
}): Promise<IntegrationCheckResult> {
  const refused = refuseDatabaseUrl(options.databaseUrl);
  if (refused !== undefined) {
    return { ok: false, message: refused };
  }

  let token: string;
  try {
    const first = await withListeningApp(options.databaseUrl, async (baseUrl) => {
      const health = await request(baseUrl, 'GET', '/health');
      if (health.status !== 200) {
        return fail(`GET /health returned ${String(health.status)}: the service did not listen`);
      }

      const dramas = await request(baseUrl, 'GET', '/v1/dramas');
      if (dramas.status !== 200 || !listHasDrama(dramas.body, DRAMA_ID)) {
        return fail(
          `GET /v1/dramas did not serve ${DRAMA_ID}: sqlite catalogue seed is missing or unused`,
        );
      }

      const login = await request(baseUrl, 'POST', '/v1/auth/login', {
        body: { provider: 'TIKTOK', authCode: mockAuthCode(VIEWER_ID) },
      });
      const accessToken = readAccessToken(login.body);
      if (login.status !== 200 || accessToken === undefined) {
        return fail(
          `POST /v1/auth/login returned ${String(login.status)}: a G2.2 job that could not mint a ` +
            'session has not run the restart',
        );
      }

      const put = await request(baseUrl, 'PUT', `/v1/dramas/${DRAMA_ID}/favorite`, {
        token: accessToken,
      });
      if (put.status !== 204) {
        return fail(
          `PUT /v1/dramas/${DRAMA_ID}/favorite returned ${String(put.status)}: the write never landed`,
        );
      }

      const before = await request(baseUrl, 'GET', `/v1/dramas/${DRAMA_ID}/favorite`, {
        token: accessToken,
      });
      if (before.status !== 200 || !isFavorited(before.body, DRAMA_ID)) {
        return fail(`GET /v1/dramas/${DRAMA_ID}/favorite did not report the write before restart`);
      }

      return { ok: true as const, token: accessToken };
    });

    if (!first.ok) return first;
    token = first.token;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  try {
    return await withListeningApp(options.databaseUrl, async (baseUrl) => {
      const health = await request(baseUrl, 'GET', '/health');
      if (health.status !== 200) {
        return fail(
          `GET /health after restart returned ${String(health.status)}: the second process did not listen`,
        );
      }

      const after = await request(baseUrl, 'GET', `/v1/dramas/${DRAMA_ID}/favorite`, {
        token,
      });
      if (after.status === 401) {
        return fail(
          'session did not survive a restart: in-memory is not G2.2. A real sqlite file keeps the token.',
        );
      }
      if (after.status !== 200 || !isFavorited(after.body, DRAMA_ID)) {
        return fail(
          `favourite did not survive a restart (status ${String(after.status)}). ` +
            'G2.2 requires the repository layer on a real sqlite file.',
        );
      }

      const dramas = await request(baseUrl, 'GET', '/v1/dramas');
      if (dramas.status !== 200 || !listHasDrama(dramas.body, DRAMA_ID)) {
        return fail(`catalogue did not survive a restart: GET /v1/dramas lost ${DRAMA_ID}`);
      }

      return {
        ok: true,
        dramaId: DRAMA_ID,
        message:
          'sqlite integration passed: HTTP service, file-backed session and favourite survived a restart',
      };
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function fail(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}

async function withListeningApp<T>(
  databaseUrl: string,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  let app: FastifyInstance | undefined;
  try {
    app = await buildApp({
      ...loadConfig({
        DATABASE_URL: databaseUrl,
        HOST: '127.0.0.1',
        PORT: '0',
        LOG_LEVEL: 'silent',
        NODE_ENV: 'test',
        MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE,
      }),
      logLevel: 'silent',
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('the HTTP service did not bind a TCP port');
    }
    return await fn(baseUrl(address));
  } finally {
    if (app !== undefined) {
      await app.close();
    }
  }
}

function baseUrl(address: AddressInfo): string {
  return `http://127.0.0.1:${String(address.port)}`;
}

interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

async function request(
  origin: string,
  method: string,
  path: string,
  options: { readonly token?: string; readonly body?: unknown } = {},
): Promise<HttpResponse> {
  const headers = new Headers();
  if (options.token !== undefined) {
    headers.set('authorization', `Bearer ${options.token}`);
  }
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${origin}${path}`, init);

  const text = await response.text();
  if (text.length === 0) {
    return { status: response.status, body: undefined };
  }

  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, body: text };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readAccessToken(body: unknown): string | undefined {
  if (!isRecord(body) || typeof body['accessToken'] !== 'string') return undefined;
  return body['accessToken'].length > 0 ? body['accessToken'] : undefined;
}

function isFavorited(body: unknown, dramaId: string): boolean {
  return isRecord(body) && body['dramaId'] === dramaId && body['favorited'] === true;
}

function listHasDrama(body: unknown, dramaId: string): boolean {
  if (!isRecord(body) || !Array.isArray(body['items'])) return false;
  return body['items'].some((item) => isRecord(item) && item['id'] === dramaId);
}

export const INTEGRATION_CLI_USAGE =
  'usage: check-integration [--db <sqlite-path>] [--database-url <url>]';

interface ParsedArgs {
  readonly databaseUrl: string | undefined;
}

export type ParseIntegrationArgsResult =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly message: string };

export function parseIntegrationArgs(argv: readonly string[]): ParseIntegrationArgsResult {
  let databaseUrl: string | undefined;
  let dbPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--db' && flag !== '--database-url') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return {
        ok: false,
        message: `${flag} requires a ${flag === '--db' ? 'path' : 'url'}`,
      };
    }
    if (flag === '--db') {
      dbPath = value;
    } else {
      databaseUrl = value;
    }
    index += 1;
  }

  if (databaseUrl !== undefined && dbPath !== undefined) {
    return { ok: false, message: 'pass --db or --database-url, not both' };
  }

  if (databaseUrl !== undefined) {
    return { ok: true, args: { databaseUrl } };
  }
  if (dbPath !== undefined) {
    return { ok: true, args: { databaseUrl: sqliteFileUrl(dbPath) } };
  }
  return { ok: true, args: { databaseUrl: undefined } };
}

export interface CliIo {
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
}

/**
 * The G2.2 L2 entry, minus `process.exit`. A temp sqlite file is created when `--db` and
 * `--database-url` are omitted, so CI does not need `DATABASE_URL` and cannot pass by pointing
 * at an in-memory store or a postgres URL rewritten to a file.
 */
export async function runCheckIntegrationCli(
  argv: readonly string[],
  io: CliIo = process,
): Promise<number> {
  const parsed = parseIntegrationArgs(argv);
  if (!parsed.ok) {
    io.stderr.write(`${parsed.message}\n${INTEGRATION_CLI_USAGE}\n`);
    return 2;
  }

  let databaseUrl = parsed.args.databaseUrl;
  let tempRoot: string | undefined;
  if (databaseUrl === undefined) {
    tempRoot = mkdtempSync(join(tmpdir(), 'check-integration-'));
    databaseUrl = sqliteFileUrl(join(tempRoot, 'g22.sqlite'));
  }

  const result = await checkSqliteIntegration({ databaseUrl });
  if (tempRoot !== undefined) {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  if (!result.ok) {
    io.stderr.write(`${result.message}\n`);
    return 1;
  }

  io.stdout.write(`${result.message}\n`);
  return 0;
}
