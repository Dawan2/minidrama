import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import {
  FIXTURE_NOW_MS,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../entitlement/fixtures.js';
import { AD_GRANTS_PATH, AD_SESSIONS_PATH } from './ad-routes.js';
import { buildApp } from '../../app.js';
import { createReportedCompletionVerifier } from './ad-completion.js';
import { createInMemoryAdRewardLog } from './ad-reward-log.js';
import { createInMemoryUnlockStore } from './unlock-store.js';
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { loadConfig } from '../../config.js';
import type { AdCompletionVerifier } from './ad-completion.js';
import type { AdPlacementConfig } from './ad-placement.js';
import type { AdRewardLog } from './ad-reward-log.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * Ad unlock through the real Fastify stack.
 *
 * The claim this file exists for: **the client event does not grant.** `isEnded: true` in a
 * POST body is not an unlock. A missing nonce, a skipped view, a verifier that refuses, and a
 * sixth grant in one UTC day all leave the episode `NEED_UNLOCK`. The default deployment has
 * no Portal unit id, so a session is `UNLOCK_AD_UNAVAILABLE` rather than a nonce for a made-up
 * placement.
 */

const BUYER = 'usr_fx_newcomer';
const COIN_OR_VIP_EPISODE = 'ep_fx_s2e01';
const VIP_ONLY_EPISODE = 'ep_fx_s2e05';
const FIXTURE_REWARDED_ID = 'ad_fx_rewarded';

const WITH_IDS: AdPlacementConfig = {
  rewardedAdUnitId: FIXTURE_REWARDED_ID,
  interstitialAdUnitId: 'ad_fx_interstitial',
  dailyLimit: 5,
  sessionTtlMs: 10 * 60 * 1000,
};

let app: FastifyInstance;
let unlockStore: UnlockStore;
let rewardLog: AdRewardLog;

interface StartOptions {
  readonly placement?: AdPlacementConfig;
  readonly verifier?: AdCompletionVerifier;
  readonly nowMs?: number;
}

async function startApp(options: StartOptions = {}): Promise<void> {
  unlockStore = createInMemoryUnlockStore();
  rewardLog = createInMemoryAdRewardLog();

  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createFixturePlaybackMediaPort(),
      unlockStore,
      now: () => options.nowMs ?? FIXTURE_NOW_MS,
      adPlacement: options.placement ?? WITH_IDS,
      adCompletionVerifier: options.verifier ?? createReportedCompletionVerifier(),
      adRewardLog: rewardLog,
    },
  );
  await app.ready();
}

afterEach(async () => {
  if (app !== undefined) await app.close();
});

function auth(viewer = BUYER): string {
  return `Bearer ${fixtureViewerToken(viewer)}`;
}

function openSession(
  episodeId = COIN_OR_VIP_EPISODE,
  extras: { readonly placement?: string; readonly viewer?: string | null } = {},
) {
  const viewer = extras.viewer === undefined ? BUYER : extras.viewer;
  return app.inject({
    method: 'POST',
    url: AD_SESSIONS_PATH,
    headers: viewer === null ? {} : { authorization: auth(viewer) },
    payload: {
      episodeId,
      placement: extras.placement ?? 'AFTER_EPISODE',
    },
  });
}

function grant(body: Record<string, unknown>, extras: { readonly key?: string } = {}) {
  return app.inject({
    method: 'POST',
    url: AD_GRANTS_PATH,
    headers: {
      authorization: auth(),
      'idempotency-key': extras.key ?? `ad-${String(body['nonce'] ?? 'none')}`,
    },
    payload: body,
  });
}

async function nonceFor(episodeId = COIN_OR_VIP_EPISODE): Promise<string> {
  const opened = await openSession(episodeId);
  expect(opened.statusCode).toBe(201);
  const body = opened.json() as { nonce: string };
  return body.nonce;
}

describe('POST /v1/unlock/ad-sessions', () => {
  beforeEach(async () => {
    await startApp();
  });

  it('mints a nonce and the configured unit id, and does not grant', async () => {
    const response = await openSession();
    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      nonce: string;
      adUnitId: string;
      placement: string;
      episodeId: string;
    };
    expect(body.adUnitId).toBe(FIXTURE_REWARDED_ID);
    expect(body.placement).toBe('AFTER_EPISODE');
    expect(body.episodeId).toBe(COIN_OR_VIP_EPISODE);
    expect(body.nonce.length).toBeGreaterThan(8);

    const owned = await unlockStore.findForEpisode(BUYER, COIN_OR_VIP_EPISODE);
    expect(owned).toBeUndefined();
  });

  it('refuses a placement the contract cannot express (F-4)', async () => {
    const response = await openSession(COIN_OR_VIP_EPISODE, { placement: 'UNLOCK_PANEL' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'COMMON_VALIDATION_FAILED' },
    });
  });

  it('does not issue a nonce without a session', async () => {
    const response = await openSession(COIN_OR_VIP_EPISODE, { viewer: null });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });

  it('does not issue a nonce for a VIP-only episode', async () => {
    const response = await openSession(VIP_ONLY_EPISODE);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'UNLOCK_POLICY_NOT_ALLOWED' } });
  });
});

describe('POST /v1/unlock/ad-sessions — no Portal id', () => {
  it('is UNLOCK_AD_UNAVAILABLE rather than a nonce for an invented unit', async () => {
    await startApp({
      placement: {
        rewardedAdUnitId: null,
        interstitialAdUnitId: null,
        dailyLimit: 5,
        sessionTtlMs: 60_000,
      },
    });

    const response = await openSession();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: 'UNLOCK_AD_UNAVAILABLE' } });
    expect(JSON.stringify(response.json())).not.toMatch(/ad_fx_|adUnitId/);
  });
});

describe('POST /v1/unlock/ad-grants — the client event does not grant', () => {
  beforeEach(async () => {
    await startApp();
  });

  it('writes an AD receipt when isEnded is true against a live nonce', async () => {
    const nonce = await nonceFor();
    const response = await grant({ episodeId: COIN_OR_VIP_EPISODE, nonce, isEnded: true });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      unlock: { method: string; costCoins: number; episodeId: string };
      quota: { usedToday: number; dailyLimit: number };
    };
    expect(body.unlock.method).toBe('AD');
    expect(body.unlock.costCoins).toBe(0);
    expect(body.unlock.episodeId).toBe(COIN_OR_VIP_EPISODE);
    expect(body.quota).toEqual({ usedToday: 1, dailyLimit: 5 });

    const owned = await unlockStore.findForEpisode(BUYER, COIN_OR_VIP_EPISODE);
    expect(owned?.method).toBe('AD');
  });

  it('is UNLOCK_AD_NOT_COMPLETED when isEnded is false, and writes no receipt', async () => {
    const nonce = await nonceFor();
    const response = await grant({ episodeId: COIN_OR_VIP_EPISODE, nonce, isEnded: false });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'UNLOCK_AD_NOT_COMPLETED' } });
    expect(await unlockStore.findForEpisode(BUYER, COIN_OR_VIP_EPISODE)).toBeUndefined();
    expect(rewardLog.list().map((entry) => entry.verdict)).toContain('NOT_COMPLETED');
  });

  it('cannot retry the same nonce as a completion after a skip', async () => {
    const nonce = await nonceFor();
    await grant({ episodeId: COIN_OR_VIP_EPISODE, nonce, isEnded: false });
    const retry = await grant(
      { episodeId: COIN_OR_VIP_EPISODE, nonce, isEnded: true },
      { key: 'ad-retry-true' },
    );

    expect(retry.statusCode).toBe(422);
    expect(await unlockStore.findForEpisode(BUYER, COIN_OR_VIP_EPISODE)).toBeUndefined();
  });

  it('refuses isEnded true when the nonce is missing — not a synthesised grant', async () => {
    const response = await grant({
      episodeId: COIN_OR_VIP_EPISODE,
      nonce: 'nonce_that_was_never_issued',
      isEnded: true,
    });

    expect(response.statusCode).toBe(422);
    expect(await unlockStore.findForEpisode(BUYER, COIN_OR_VIP_EPISODE)).toBeUndefined();
  });

  it('requires Idempotency-Key', async () => {
    const nonce = await nonceFor();
    const response = await app.inject({
      method: 'POST',
      url: AD_GRANTS_PATH,
      headers: { authorization: auth() },
      payload: { episodeId: COIN_OR_VIP_EPISODE, nonce, isEnded: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'COMMON_IDEMPOTENCY_KEY_REQUIRED' },
    });
  });
});

describe('a verifier that refuses even when the client reports isEnded', () => {
  it('still writes no receipt — the HTTP body is not the grantor', async () => {
    const refusing: AdCompletionVerifier = {
      verify: () => 'NOT_COMPLETED',
    };
    await startApp({ verifier: refusing });

    const nonce = await nonceFor();
    const response = await grant({ episodeId: COIN_OR_VIP_EPISODE, nonce, isEnded: true });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'UNLOCK_AD_NOT_COMPLETED' } });
    expect(await unlockStore.findForEpisode(BUYER, COIN_OR_VIP_EPISODE)).toBeUndefined();
  });
});

describe('ad-unlock quota', () => {
  it('refuses a grant once five AD receipts already sit in the UTC day', async () => {
    await startApp();

    const { createAdUnlock, newUnlockId } = await import('./unlocks.js');
    for (let i = 0; i < 5; i += 1) {
      await unlockStore.record(
        createAdUnlock({
          id: newUnlockId(),
          userId: BUYER,
          episodeId: `ep_quota_${String(i)}`,
          dramaId: 'drm_fx_revenge',
          sessionId: `ads_quota_${String(i)}`,
          grantedAtMs: FIXTURE_NOW_MS,
        }),
      );
    }

    const nonce = await nonceFor();
    const sixth = await grant(
      { episodeId: COIN_OR_VIP_EPISODE, nonce, isEnded: true },
      { key: 'ad-quota-sixth' },
    );
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({
      error: { code: 'UNLOCK_AD_QUOTA_EXCEEDED', details: { usedToday: 5, dailyLimit: 5 } },
    });
    expect(await unlockStore.findForEpisode(BUYER, COIN_OR_VIP_EPISODE)).toBeUndefined();
  });
});
