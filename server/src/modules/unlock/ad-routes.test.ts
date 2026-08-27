import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';

import {
  FIXTURE_NOW_MS,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../entitlement/fixtures.js';
import { AD_GRANTS_PATH, AD_SESSIONS_PATH } from './ad-routes.js';
import { createInMemoryAdRewardLogStore } from './ad-reward-log.js';
import { createInMemoryAdUnlockSessionStore } from './ad-session-store.js';
import { createRefusingCompletionVerifier } from './ad-completion.js';
import { buildApp } from '../../app.js';
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { loadConfig } from '../../config.js';
import type { AdCompletionVerifier } from './ad-completion.js';
import type { AdRewardLogStore } from './ad-reward-log.js';
import type { AdUnlockSessionStore } from './ad-session-store.js';

/**
 * Ad unlock through Fastify. The claim this file exists for: **the client `isEnded` event is not
 * a grant.** A 200 with `isEnded: true` that the verifier refuses still leaves the episode locked,
 * and a skipped view consumes the nonce so it cannot be retried as a completion.
 */

const BUYER = 'usr_fx_newcomer';
const OTHER = 'usr_fx_vip_expired';
const COIN_OR_VIP_EPISODE = 'ep_fx_s2e01';
const VIP_ONLY_EPISODE = 'ep_fx_s2e05';

let app: FastifyInstance;
let sessions: AdUnlockSessionStore;
let logs: AdRewardLogStore;

async function startApp(
  options: {
    readonly verifier?: AdCompletionVerifier;
    readonly dailyLimit?: number;
  } = {},
): Promise<void> {
  sessions = createInMemoryAdUnlockSessionStore();
  logs = createInMemoryAdRewardLogStore();

  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      adUnlockSessionStore: sessions,
      adRewardLogStore: logs,
      ...(options.verifier === undefined ? {} : { adCompletionVerifier: options.verifier }),
      ...(options.dailyLimit === undefined
        ? {}
        : { adUnlockPolicy: { dailyLimit: options.dailyLimit } }),
      now: () => FIXTURE_NOW_MS,
    },
  );
  await app.ready();
}

afterEach(async () => {
  await app.close();
});

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

function mint(
  episodeId: string,
  options: { readonly viewer?: string; readonly key?: string } = {},
) {
  const viewer = options.viewer ?? BUYER;
  return app.inject({
    method: 'POST',
    url: AD_SESSIONS_PATH,
    headers: {
      authorization: `Bearer ${fixtureViewerToken(viewer)}`,
      'idempotency-key': options.key ?? `ad-${episodeId}`,
    },
    payload: { episodeId },
  });
}

function grant(sessionId: string, isEnded: unknown, viewer = BUYER) {
  return app.inject({
    method: 'POST',
    url: AD_GRANTS_PATH,
    headers: { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
    payload: { sessionId, isEnded },
  });
}

async function episodeAccess(episodeId: string, viewer = BUYER) {
  return app.inject({
    method: 'POST',
    url: '/v1/entitlement/episode-access',
    headers: { authorization: `Bearer ${fixtureViewerToken(viewer)}` },
    payload: { episodeId },
  });
}

function viewerReason(response: LightMyRequestResponse): string | undefined {
  return response.json<{ viewerAccess: { reason: string } }>().viewerAccess.reason;
}

describe('POST /v1/unlock/ad-sessions', () => {
  beforeEach(async () => {
    await startApp();
  });

  it('mints a nonce and does not unlock the episode', async () => {
    const created = await mint(COIN_OR_VIP_EPISODE);
    expect(created.statusCode).toBe(201);
    const body = created.json<{ sessionId: string; episodeId: string }>();
    expect(body.sessionId).toMatch(/^ads_/);
    expect(body.episodeId).toBe(COIN_OR_VIP_EPISODE);

    const access = await episodeAccess(COIN_OR_VIP_EPISODE);
    expect(viewerReason(access)).toBe('NEED_UNLOCK');
  });

  it('replays the same Idempotency-Key rather than minting a second nonce', async () => {
    const first = await mint(COIN_OR_VIP_EPISODE, { key: 'same' });
    const second = await mint(COIN_OR_VIP_EPISODE, { key: 'same' });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
  });

  it('refuses a VIP-only episode rather than minting a nonce for a showing that cannot grant', async () => {
    const created = await mint(VIP_ONLY_EPISODE);
    expect(created.statusCode).toBe(422);
    expect(errorCode(created)).toBe('UNLOCK_POLICY_NOT_ALLOWED');
  });

  it('refuses an anonymous mint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: AD_SESSIONS_PATH,
      headers: { 'idempotency-key': 'anon' },
      payload: { episodeId: COIN_OR_VIP_EPISODE },
    });
    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('requires episodeId and Idempotency-Key', async () => {
    const missingBody = await app.inject({
      method: 'POST',
      url: AD_SESSIONS_PATH,
      headers: {
        authorization: `Bearer ${fixtureViewerToken(BUYER)}`,
        'idempotency-key': 'k',
      },
      payload: {},
    });
    expect(missingBody.statusCode).toBe(400);
    expect(errorCode(missingBody)).toBe('COMMON_VALIDATION_FAILED');

    const missingKey = await app.inject({
      method: 'POST',
      url: AD_SESSIONS_PATH,
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
      payload: { episodeId: COIN_OR_VIP_EPISODE },
    });
    expect(missingKey.statusCode).toBe(400);
    expect(errorCode(missingKey)).toBe('COMMON_IDEMPOTENCY_KEY_REQUIRED');
  });

  it('conflicts when the same Idempotency-Key is reused for a different episode', async () => {
    expect((await mint(COIN_OR_VIP_EPISODE, { key: 'shared' })).statusCode).toBe(201);
    const conflict = await mint('ep_fx_s2e07', { key: 'shared' });
    expect(conflict.statusCode).toBe(409);
    expect(errorCode(conflict)).toBe('COMMON_IDEMPOTENCY_CONFLICT');
  });
});

describe('POST /v1/unlock/ad-grants', () => {
  beforeEach(async () => {
    await startApp();
  });

  it('grants when isEnded is true and the episode becomes UNLOCKED by method AD', async () => {
    const sessionId = (await mint(COIN_OR_VIP_EPISODE)).json<{ sessionId: string }>().sessionId;
    const granted = await grant(sessionId, true);

    expect(granted.statusCode).toBe(200);
    expect(granted.json()).toMatchObject({
      unlock: { episodeId: COIN_OR_VIP_EPISODE, method: 'AD', costCoins: 0 },
      quota: { usedToday: 1, dailyLimit: 5 },
    });

    const access = await episodeAccess(COIN_OR_VIP_EPISODE);
    expect(access.json()).toMatchObject({
      viewerAccess: { playable: true, reason: 'UNLOCKED', unlockedBy: 'AD' },
    });
  });

  it('replays a successful grant rather than writing a second receipt', async () => {
    const sessionId = (await mint(COIN_OR_VIP_EPISODE)).json<{ sessionId: string }>().sessionId;
    const first = await grant(sessionId, true);
    const second = await grant(sessionId, true);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it('does not grant when isEnded is false, and consumes the nonce', async () => {
    const sessionId = (await mint(COIN_OR_VIP_EPISODE)).json<{ sessionId: string }>().sessionId;
    const skipped = await grant(sessionId, false);

    expect(skipped.statusCode).toBe(422);
    expect(errorCode(skipped)).toBe('AD_NOT_COMPLETED');

    const access = await episodeAccess(COIN_OR_VIP_EPISODE);
    expect(viewerReason(access)).toBe('NEED_UNLOCK');

    const retry = await grant(sessionId, true);
    expect(retry.statusCode).toBe(422);
    expect(errorCode(retry)).toBe('AD_NOT_COMPLETED');
  });

  it('does not grant when isEnded is absent', async () => {
    const sessionId = (await mint(COIN_OR_VIP_EPISODE)).json<{ sessionId: string }>().sessionId;
    const response = await app.inject({
      method: 'POST',
      url: AD_GRANTS_PATH,
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
      payload: { sessionId },
    });
    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe('AD_NOT_COMPLETED');
  });

  it("does not leak another viewer's session", async () => {
    const sessionId = (await mint(COIN_OR_VIP_EPISODE)).json<{ sessionId: string }>().sessionId;
    const response = await grant(sessionId, true, OTHER);
    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('COMMON_RESOURCE_NOT_FOUND');
  });

  it('requires sessionId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: AD_GRANTS_PATH,
      headers: { authorization: `Bearer ${fixtureViewerToken(BUYER)}` },
      payload: { isEnded: true },
    });
    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
  });

  it('writes a reward log for a skipped view', async () => {
    const sessionId = (await mint(COIN_OR_VIP_EPISODE)).json<{ sessionId: string }>().sessionId;
    await grant(sessionId, false);
    const entries = await logs.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      sessionId,
      isEndedReported: false,
      completed: false,
      granted: false,
      refusal: 'NOT_COMPLETED',
    });
  });
});

describe('the verifier, not the client event, decides completion', () => {
  beforeEach(async () => {
    await startApp({ verifier: createRefusingCompletionVerifier() });
  });

  it('leaves the episode locked when the client claims isEnded true and the verifier refuses', async () => {
    const sessionId = (await mint(COIN_OR_VIP_EPISODE)).json<{ sessionId: string }>().sessionId;
    const granted = await grant(sessionId, true);

    expect(granted.statusCode).toBe(422);
    expect(errorCode(granted)).toBe('AD_NOT_COMPLETED');

    const access = await episodeAccess(COIN_OR_VIP_EPISODE);
    expect(viewerReason(access)).toBe('NEED_UNLOCK');

    const entries = await logs.list();
    expect(entries[0]).toMatchObject({
      isEndedReported: true,
      completed: false,
      granted: false,
    });
  });
});

describe('daily quota', () => {
  beforeEach(async () => {
    await startApp({ dailyLimit: 1 });
  });

  it('refuses a second grant the same UTC day and still logs it', async () => {
    const firstId = (await mint(COIN_OR_VIP_EPISODE, { key: 'one' })).json<{ sessionId: string }>()
      .sessionId;
    expect((await grant(firstId, true)).statusCode).toBe(200);

    const secondId = (await mint('ep_fx_s2e07', { key: 'two' })).json<{ sessionId: string }>()
      .sessionId;
    const second = await grant(secondId, true);
    expect(second.statusCode).toBe(429);
    expect(errorCode(second)).toBe('AD_QUOTA_EXCEEDED');
    expect(
      second.json<{ error: { details: { usedToday: number; dailyLimit: number } } }>().error
        .details,
    ).toEqual({
      usedToday: 1,
      dailyLimit: 1,
    });
  });
});
