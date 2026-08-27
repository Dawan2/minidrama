import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { TIKTOK_WEBHOOK_PATH } from './routes.js';
import { buildApp } from '../../app.js';
import { computeWebhookSignature } from './webhook-signature.js';
import { loadConfig } from '../../config.js';
import { createPlatformCredentials } from './credentials.js';

/**
 * C3-06, the next store after sessions: a verified webhook, a process restart, the same
 * delivery still flagged as a duplicate. Unlock receipts and sessions already survive this
 * bounce on the same file. The order store stays in memory.
 */

const SECRET = 'client-secret-for-tests';
const CLIENT_KEY = 'awtest';
const NOW_MS = 1_700_000_000_000;
const NOW_SEC = NOW_MS / 1000;
const CONTENT = JSON.stringify({ trade_order_id: 'to_1', order_id: 'ord_1', is_sandbox: false });

const dirs: string[] = [];
let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app !== undefined) {
    await app.close();
    app = undefined;
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function rawEnvelope(): string {
  return JSON.stringify({
    client_key: CLIENT_KEY,
    event: 'minis.trade_order.redeem.success',
    create_time: NOW_SEC,
    user_openid: 'open_abc',
    content: CONTENT,
  });
}

function signature(rawBody: string): string {
  return `t=${NOW_SEC},s=${computeWebhookSignature(Buffer.from(rawBody, 'utf8'), SECRET, NOW_SEC)}`;
}

async function start(sqlitePath: string): Promise<FastifyInstance> {
  const instance = await buildApp(
    { ...loadConfig({ DATABASE_URL: `sqlite:${sqlitePath}` }), logLevel: 'silent' },
    {
      platformCredentials: createPlatformCredentials(CLIENT_KEY, SECRET),
      now: () => NOW_MS,
    },
  );
  await instance.ready();
  app = instance;
  return instance;
}

function post(instance: FastifyInstance, rawBody: string) {
  return instance.inject({
    method: 'POST',
    url: TIKTOK_WEBHOOK_PATH,
    headers: {
      'content-type': 'application/json',
      'tiktok-signature': signature(rawBody),
    },
    payload: rawBody,
  });
}

describe('a sqlite webhook event store survives a process restart', () => {
  it('still flags a redelivery as a duplicate after the process is replaced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minidrama-durable-webhook-'));
    dirs.push(dir);
    const sqlitePath = join(dir, 'app.sqlite');
    const body = rawEnvelope();

    const first = await start(sqlitePath);
    const accepted = await post(first, body);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ received: true, duplicate: false });

    await first.close();
    app = undefined;

    const second = await start(sqlitePath);
    const redelivery = await post(second, body);
    expect(redelivery.statusCode).toBe(200);
    expect(redelivery.json()).toEqual({ received: true, duplicate: true });
  });

  it('refuses to start behind a postgres URL rather than serving a file', async () => {
    await expect(
      buildApp({
        ...loadConfig({ DATABASE_URL: 'postgres://localhost/minidrama' }),
        logLevel: 'silent',
      }),
    ).rejects.toThrow(/scheme "postgres"/);
  });
});
