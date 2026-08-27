import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { ConfigView } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { loadConfig } from '../../config.js';
import { LIVE_CLIENT_CONFIG } from './live.js';
import { CONFIG_CACHE_CONTROL, CONFIG_PATH } from './routes.js';
import { CONFIG_VIEW_KEYS } from './view.js';

/**
 * `GET /v1/config` over HTTP.
 *
 * The assembled app answers `200` with the conservative product state: comments off, ads off,
 * heartbeat 10 s. That is the property the splash rests on: a missing comments flag is not
 * "comments on", and a missing legal URL is not a placeholder link.
 */

let app: FastifyInstance;

async function startApp(): Promise<void> {
  app = await buildApp({ ...loadConfig({}), logLevel: 'silent' });
  await app.ready();
}

function get(token?: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'GET',
    url: CONFIG_PATH,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function bodyKeys(response: LightMyRequestResponse): readonly string[] {
  return Object.keys(response.json<Record<string, unknown>>());
}

afterEach(async () => {
  await app.close();
});

describe('GET /v1/config — anonymous, conservative product state', () => {
  it('answers 200 without a session, because boot needs a config before login can succeed', async () => {
    await startApp();

    const response = await get();

    expect(response.statusCode).toBe(200);
    expect(response.json<ConfigView>()).toEqual({
      features: { comments: false, adUnlock: false },
      playback: { progressHeartbeatSec: 10 },
    });
  });

  it('does not change the body when a session is presented: the flags are not per viewer', async () => {
    await startApp();

    expect((await get()).json()).toEqual((await get('tok_a')).json());
  });

  it('sends Cache-Control: public with a short max-age, including to a signed-in caller', async () => {
    await startApp();

    expect((await get()).headers['cache-control']).toBe(CONFIG_CACHE_CONTROL);
    expect((await get('tok_a')).headers['cache-control']).toBe(CONFIG_CACHE_CONTROL);
  });

  it('is the live product state, which today equals the conservative fallback', async () => {
    expect(LIVE_CLIENT_CONFIG.features.comments).toBe(false);
    expect(LIVE_CLIENT_CONFIG.features.adUnlock).toBe(false);
    expect(LIVE_CLIENT_CONFIG.playback.progressHeartbeatSec).toBe(10);
  });
});

describe('GET /v1/config — the body is flags, not legal URLs, ads units or Beans', () => {
  it('carries only ConfigView keys', async () => {
    await startApp();

    const response = await get();
    const keys = bodyKeys(response);
    const body = response.json<ConfigView>();

    expect(keys.every((key) => (CONFIG_VIEW_KEYS as readonly string[]).includes(key))).toBe(true);
    expect([...keys].sort()).toEqual(['features', 'playback']);
    expect([...Object.keys(body.features)].sort()).toEqual(['adUnlock', 'comments']);
    expect(Object.keys(body.playback)).toEqual(['progressHeartbeatSec']);
    expect(JSON.stringify(body)).not.toMatch(
      /vip|beans|termsUrl|privacyUrl|legalUrls|adUnitId|coinName|"wallet"/i,
    );
  });

  /**
   * A source scan, not a typecheck. Adding `comments: true` to the live object would still
   * typecheck; this is the check that fails when somebody turns comments on so the splash looks
   * finished while PNL-04 is still unbuilt (`C4-04`).
   */
  it('names no comments: true, legal URL, ad-unit id or Beans rate in the config module, outside comments', () => {
    const moduleDir = fileURLToPath(new URL('.', import.meta.url));
    const files = ['routes.ts', 'view.ts', 'live.ts'];
    const forbidden =
      /comments:\s*true|termsUrl|privacyUrl|adUnitId|beansPerCoin|coinToBeans|BEANS_RATE|coinName/;
    const offenders: string[] = [];

    for (const file of files) {
      readFileSync(join(moduleDir, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const trimmed = line.trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return;
          }
          if (forbidden.test(line)) {
            offenders.push(`${file}:${String(index + 1)} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});
