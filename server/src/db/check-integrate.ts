import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DramaDetail, FavoriteList, FavoriteState, WalletView } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { TEST_LOGIN_ENABLE_VALUE, mockAuthCode } from '../modules/identity/test-login.js';
import { COIN_ORDERS_PATH } from '../modules/unlock/routes.js';
import { databaseNotWiredMessage, parseDatabaseUrl } from './database-url.js';

/**
 * G2.2 (`docs/14-quality-gates.md` §4): the assembled service talks to a real sqlite file, a
 * write survives a process bounce, and the payment gateway stays refuse-closed. The durable
 * unit suites already bounce one store at a time; this module is the L2 job's entry so an
 * in-memory run, a rewritten postgres URL, or a stubbed `201` trade order fails CI the same way
 * a no-op down fails G2.7 — by the process exit status, not by a comment.
 *
 * Postgres is T14 and is not rewritten to a file. Redis is T15 and is not read. Mock login is
 * enabled only inside this check (the two-variable gate), so the job can mint a session without
 * injecting a store or synthesising an `open_id` on the real identity port.
 */

const DRAMA_ID = 'drm_revenge_0001';
const EPISODE_ID = 'ep_revenge_e04';
const VIEWER_A = 'g22_viewer_a';
const VIEWER_B = 'g22_viewer_b';

export type IntegrateCheckResult =
  | {
      readonly ok: true;
      readonly dramaId: string;
      readonly message: string;
    }
  | { readonly ok: false; readonly message: string };

export function refuseNonFileDatabase(databaseUrl: string): string | undefined {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed.kind === 'memory') {
    return (
      'G2.2 requires DATABASE_URL=sqlite:<path>; unset or empty is in-memory, ' +
      'which is not a real database'
    );
  }
  if (parsed.kind === 'unwired') {
    return `${databaseNotWiredMessage(parsed.scheme)}. G2.2 does not rewrite postgres or redis to a file.`;
  }
  if (parsed.path === ':memory:') {
    return 'G2.2 requires a sqlite file; in-memory is not an integration suite';
  }
  return undefined;
}

function errorCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return undefined;
  }
  const error = payload.error;
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

async function startApp(databaseUrl: string): Promise<FastifyInstance> {
  const app = await buildApp({
    ...loadConfig({
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
      MINIDRAMA_TEST_LOGIN: TEST_LOGIN_ENABLE_VALUE,
    }),
    logLevel: 'silent',
  });
  await app.ready();
  return app;
}

async function login(app: FastifyInstance, userId: string): Promise<string | IntegrateCheckResult> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { provider: 'TIKTOK', authCode: mockAuthCode(userId) },
  });
  if (response.statusCode !== 200) {
    return {
      ok: false,
      message: `login as ${userId} returned ${String(response.statusCode)}, not a session`,
    };
  }
  const token = response.json<{ accessToken?: unknown }>().accessToken;
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, message: `login as ${userId} did not issue an accessToken` };
  }
  return token;
}

async function probeFirstProcess(app: FastifyInstance): Promise<string | IntegrateCheckResult> {
  const health = await app.inject({ method: 'GET', url: '/health' });
  if (health.statusCode !== 200) {
    return { ok: false, message: `GET /health returned ${String(health.statusCode)}` };
  }

  const drama = await app.inject({ method: 'GET', url: `/v1/dramas/${DRAMA_ID}` });
  if (drama.statusCode !== 200) {
    return {
      ok: false,
      message: `GET /v1/dramas/${DRAMA_ID} returned ${String(drama.statusCode)}: catalogue is not the sqlite store`,
    };
  }
  if (drama.json<DramaDetail>().id !== DRAMA_ID) {
    return {
      ok: false,
      message: `catalogue served ${drama.json<DramaDetail>().id}, not ${DRAMA_ID}`,
    };
  }

  const tokenA = await login(app, VIEWER_A);
  if (typeof tokenA !== 'string') return tokenA;

  const hearted = await app.inject({
    method: 'PUT',
    url: `/v1/dramas/${DRAMA_ID}/favorite`,
    headers: { authorization: `Bearer ${tokenA}` },
  });
  if (hearted.statusCode !== 204) {
    return {
      ok: false,
      message: `PUT favorite returned ${String(hearted.statusCode)}, not 204`,
    };
  }

  const tokenB = await login(app, VIEWER_B);
  if (typeof tokenB !== 'string') return tokenB;

  const other = await app.inject({
    method: 'GET',
    url: `/v1/dramas/${DRAMA_ID}/favorite`,
    headers: { authorization: `Bearer ${tokenB}` },
  });
  if (other.statusCode !== 200 || other.json<FavoriteState>().favorited !== false) {
    return {
      ok: false,
      message:
        "viewer B saw viewer A's favourite: G2.2 requires the store to be per-session, not a shared in-memory leak",
    };
  }

  const wallet = await app.inject({
    method: 'GET',
    url: '/v1/wallet',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  if (wallet.statusCode !== 200) {
    return { ok: false, message: `GET /v1/wallet returned ${String(wallet.statusCode)}` };
  }
  const walletBody = wallet.json<WalletView>();
  if (Object.hasOwn(walletBody, 'coinBalance') || Object.hasOwn(walletBody, 'totalBalance')) {
    return {
      ok: false,
      message:
        'GET /v1/wallet quoted a coin figure: the default gateway has no platform balance, and an invented zero is not G2.2',
    };
  }

  const order = await app.inject({
    method: 'POST',
    url: COIN_ORDERS_PATH,
    headers: {
      authorization: `Bearer ${tokenA}`,
      'idempotency-key': `g22-${VIEWER_A}-${EPISODE_ID}`,
    },
    payload: { episodeId: EPISODE_ID },
  });
  if (order.statusCode === 201) {
    return {
      ok: false,
      message:
        'POST /v1/unlock/coin-orders returned 201: G2.2 requires the refusing trade-order gateway, not a stubbed payment',
    };
  }
  if (order.statusCode !== 503 || errorCode(order.json()) !== 'COMMON_SERVICE_UNAVAILABLE') {
    return {
      ok: false,
      message:
        `POST /v1/unlock/coin-orders returned ${String(order.statusCode)} ` +
        `${errorCode(order.json()) ?? '(no code)'}; expected 503 COMMON_SERVICE_UNAVAILABLE`,
    };
  }

  return tokenA;
}

async function probeAfterBounce(
  app: FastifyInstance,
  tokenA: string,
): Promise<IntegrateCheckResult | undefined> {
  const drama = await app.inject({ method: 'GET', url: `/v1/dramas/${DRAMA_ID}` });
  if (drama.statusCode !== 200) {
    return {
      ok: false,
      message: `after bounce, GET /v1/dramas/${DRAMA_ID} returned ${String(drama.statusCode)}`,
    };
  }

  const list = await app.inject({
    method: 'GET',
    url: '/v1/users/me/favorites',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  if (list.statusCode !== 200) {
    return {
      ok: false,
      message:
        `after bounce, GET /v1/users/me/favorites returned ${String(list.statusCode)}: ` +
        'the session did not survive, so the store is not the sqlite file',
    };
  }
  const items = list.json<FavoriteList>().items;
  if (!items.some((item) => item.dramaId === DRAMA_ID)) {
    return {
      ok: false,
      message:
        'favourite did not survive the bounce: G2.2 requires the sqlite file, not an in-memory store',
    };
  }

  const order = await app.inject({
    method: 'POST',
    url: COIN_ORDERS_PATH,
    headers: {
      authorization: `Bearer ${tokenA}`,
      'idempotency-key': `g22-bounce-${VIEWER_A}-${EPISODE_ID}`,
    },
    payload: { episodeId: EPISODE_ID },
  });
  if (order.statusCode === 201) {
    return {
      ok: false,
      message:
        'after bounce, coin unlock invented a trade order; G2.2 requires the refusing gateway',
    };
  }

  return undefined;
}

const USAGE = 'usage: check-integrate [--db <sqlite-path>] [--url <DATABASE_URL>]';

export type IntegrateParseResult =
  | { readonly ok: true; readonly databaseUrl: string | undefined }
  | { readonly ok: false; readonly message: string };

export function parseIntegrateArgs(argv: readonly string[]): IntegrateParseResult {
  let databaseUrl: string | undefined;
  let dbPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    if (flag !== '--db' && flag !== '--url') {
      return { ok: false, message: `unknown argument: ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return {
        ok: false,
        message: `${flag} requires a ${flag === '--url' ? 'DATABASE_URL' : 'path'}`,
      };
    }
    if (flag === '--db') {
      if (databaseUrl !== undefined) {
        return { ok: false, message: '--db and --url cannot both be set' };
      }
      dbPath = value;
    } else {
      if (dbPath !== undefined) {
        return { ok: false, message: '--db and --url cannot both be set' };
      }
      databaseUrl = value;
    }
    index += 1;
  }

  if (dbPath !== undefined) {
    return { ok: true, databaseUrl: `sqlite:${dbPath}` };
  }
  return { ok: true, databaseUrl };
}

export async function runIntegrateCli(
  argv: readonly string[],
  io: {
    readonly stdout: NodeJS.WritableStream;
    readonly stderr: NodeJS.WritableStream;
  } = process,
): Promise<number> {
  const parsed = parseIntegrateArgs(argv);
  if (!parsed.ok) {
    io.stderr.write(`${parsed.message}\n${USAGE}\n`);
    return 2;
  }

  let databaseUrl = parsed.databaseUrl;
  let tempRoot: string | undefined;
  if (databaseUrl === undefined) {
    tempRoot = mkdtempSync(join(tmpdir(), 'check-integrate-'));
    databaseUrl = `sqlite:${join(tempRoot, 'g22.sqlite')}`;
  }

  const result = await checkIntegrate({ databaseUrl });
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

export async function checkIntegrate(options: {
  readonly databaseUrl: string;
}): Promise<IntegrateCheckResult> {
  const refused = refuseNonFileDatabase(options.databaseUrl);
  if (refused !== undefined) {
    return { ok: false, message: refused };
  }

  let first: FastifyInstance | undefined;
  let second: FastifyInstance | undefined;
  try {
    first = await startApp(options.databaseUrl);
    const tokenOrError = await probeFirstProcess(first);
    if (typeof tokenOrError !== 'string') return tokenOrError;
    await first.close();
    first = undefined;

    second = await startApp(options.databaseUrl);
    const bounced = await probeAfterBounce(second, tokenOrError);
    if (bounced !== undefined) return bounced;

    return {
      ok: true,
      dramaId: DRAMA_ID,
      message:
        'integrate against sqlite passed (catalogue, session, favourite bounce, gateway refused)',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (first !== undefined) await first.close();
    if (second !== undefined) await second.close();
  }
}
