import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';

import { FIXTURE_NOW_MS, createFixtureEntitlementFactsPort } from './fixtures.js';
import { buildApp } from '../../app.js';
import { createFixtureViewerResolver, fixtureViewerToken } from './fixtures.js';
import { loadConfig } from '../../config.js';

/**
 * The wrapper is exercised through the assembled app rather than in isolation, because half of what
 * it owns is the translation between one verdict and one HTTP response — statuses, error codes and
 * the shape of the body. `fixtureApp` injects the fixture world and a fixed clock; `defaultApp` is
 * the app a deployment gets with no data layer, and is here to prove that the default denies.
 */

let fixtureApp: FastifyInstance;
let defaultApp: FastifyInstance;

beforeAll(async () => {
  fixtureApp = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      now: () => FIXTURE_NOW_MS,
    },
  );
  defaultApp = await buildApp({ ...loadConfig({}), logLevel: 'silent' });

  await Promise.all([fixtureApp.ready(), defaultApp.ready()]);
});

afterAll(async () => {
  await Promise.all([fixtureApp.close(), defaultApp.close()]);
});

interface AccessResponse {
  readonly episodeId: string;
  readonly viewerAccess: {
    readonly playable: boolean;
    readonly reason: string;
    readonly unlockedBy: string | null;
  };
  readonly unlockOptions: readonly string[];
  readonly priceCoins: number | null;
}

function ask(
  episodeId: unknown,
  userId?: string,
  app: FastifyInstance = fixtureApp,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/v1/entitlement/episode-access',
    ...(userId === undefined
      ? {}
      : { headers: { authorization: `Bearer ${fixtureViewerToken(userId)}` } }),
    payload: episodeId === undefined ? {} : { episodeId },
  });
}

async function access(episodeId: string, userId?: string): Promise<AccessResponse> {
  const response = await ask(episodeId, userId);

  expect(response.statusCode).toBe(200);

  return response.json<AccessResponse>();
}

function errorCode(response: LightMyRequestResponse): string {
  return response.json<{ error: { code: string } }>().error.code;
}

describe('POST /v1/entitlement/episode-access — request handling', () => {
  it('rejects a request without an episodeId', async () => {
    const response = await ask(undefined);

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
  });

  it.each([
    ['', 'an empty string'],
    [42, 'a number'],
    [null, 'null'],
  ] as const)('rejects %j as an episodeId (%s)', async (episodeId, _description) => {
    const response = await ask(episodeId);

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
  });

  it('returns the full access view and nothing else', async () => {
    expect(await access('ep_fx_s2e01')).toEqual({
      episodeId: 'ep_fx_s2e01',
      viewerAccess: { playable: false, reason: 'NEED_UNLOCK', unlockedBy: null },
      unlockOptions: ['COINS', 'VIP'],
      priceCoins: 300,
    });
  });

  /**
   * Entitlement decides whether playback may be requested; playback issues the descriptor
   * (correction A4, `docs/architecture/system-overview.md` §1.1). A media reference in this response
   * would be a second, unaudited source of playable URLs.
   */
  it('never returns a media URL, a signed URL or a quality ladder', async () => {
    for (const episodeId of ['ep_fx_s1e01', 'ep_fx_s2e01', 'ep_fx_s2e05']) {
      const response = await ask(episodeId, 'usr_fx_vip_active');

      expect(response.body).not.toMatch(/https?:\/\//);
      expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|playAuthToken|definitions?"/i);
    }
  });

  it('echoes the trace id on a denial so a user report maps to a trace', async () => {
    const response = await ask('ep_nope');

    expect(response.json<{ error: { traceId: string } }>().error.traceId).toMatch(/^req_/);
  });
});

describe('POST /v1/entitlement/episode-access — the free window is drama-wide (DM-1)', () => {
  it('answers FREE inside the window', async () => {
    expect(await access('ep_fx_s1e01')).toMatchObject({
      viewerAccess: { playable: true, reason: 'FREE' },
      priceCoins: null,
    });
  });

  it('answers FREE at the last episode of the window', async () => {
    expect((await access('ep_fx_s1e05')).viewerAccess).toMatchObject({
      playable: true,
      reason: 'FREE',
    });
  });

  it('answers NEED_UNLOCK immediately after the window', async () => {
    expect((await access('ep_fx_s1e06')).viewerAccess.reason).toBe('NEED_UNLOCK');
  });

  // `ep_fx_s2e01` is episode 1 of season 2 and episode 11 of the drama. Measuring the drama-level
  // free window on the per-season number would give the first five episodes of season 2 away too.
  it('does not reopen the window at the start of season 2', async () => {
    const view = await access('ep_fx_s2e01');

    expect(view.viewerAccess.playable).toBe(false);
    expect(view.viewerAccess.reason).toBe('NEED_UNLOCK');
    expect(view.priceCoins).toBe(300);
  });
});

describe('POST /v1/entitlement/episode-access — a purchase outranks a subscription (DM-3)', () => {
  it('keeps the coin-unlocked episode playable for a lapsed subscriber', async () => {
    expect(await access('ep_fx_s2e03', 'usr_fx_vip_expired')).toMatchObject({
      viewerAccess: { playable: true, reason: 'UNLOCKED', unlockedBy: 'COIN' },
      unlockOptions: [],
      priceCoins: null,
    });
  });

  it('reports the purchase rather than the subscription for an active subscriber', async () => {
    // Same episode, a viewer whose subscription is live and who has bought nothing: the difference
    // proves the previous case answered from the unlock row, not from a VIP bundle.
    expect((await access('ep_fx_s2e03', 'usr_fx_vip_active')).viewerAccess.reason).toBe('VIP');
  });

  it('does not honour a VIP viewing receipt once the subscription has lapsed', async () => {
    const view = await access('ep_fx_s2e05', 'usr_fx_vip_expired');

    expect(view.viewerAccess).toEqual({ playable: false, reason: 'NEED_VIP', unlockedBy: null });
    expect(view.unlockOptions).toEqual(['VIP']);
  });

  it('admits an active subscriber to the same VIP-only episode', async () => {
    expect((await access('ep_fx_s2e05', 'usr_fx_vip_active')).viewerAccess).toEqual({
      playable: true,
      reason: 'VIP',
      unlockedBy: 'VIP',
    });
  });

  it('does not admit a subscriber to a coin-only episode', async () => {
    const view = await access('ep_fx_s2e07', 'usr_fx_vip_active');

    expect(view.viewerAccess.reason).toBe('NEED_UNLOCK');
    expect(view.unlockOptions).toEqual(['COINS']);
    expect(view.priceCoins).toBe(500);
  });

  it('stops honouring an unlock that has expired', async () => {
    expect((await access('ep_fx_s2e03', 'usr_fx_lapsed_grant')).viewerAccess.reason).toBe(
      'NEED_UNLOCK',
    );
  });

  it('answers a viewer who holds nothing the same as an anonymous one', async () => {
    const newcomer = await access('ep_fx_s2e03', 'usr_fx_newcomer');
    const anonymous = await access('ep_fx_s2e03');

    expect(newcomer).toEqual(anonymous);
  });
});

describe('POST /v1/entitlement/episode-access — unavailable content', () => {
  it('reports an unknown episode as absent, with the resource in the details', async () => {
    const response = await ask('ep_nope');

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('CONTENT_NOT_FOUND');
    expect(response.json<{ error: { details: unknown } }>().error.details).toEqual({
      resourceType: 'EPISODE',
      resourceId: 'ep_nope',
    });
  });

  it('reports a draft episode as absent rather than as taken down', async () => {
    const response = await ask('ep_fx_s2e09_draft');

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('CONTENT_NOT_FOUND');
  });

  it('reports a published episode under a draft season as absent', async () => {
    const response = await ask('ep_fx_s3e01');

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('CONTENT_NOT_FOUND');
  });

  it('reports a withdrawn episode as gone', async () => {
    const response = await ask('ep_fx_s2e10_offline');

    expect(response.statusCode).toBe(410);
    expect(errorCode(response)).toBe('CONTENT_OFFLINE');
  });

  it('reports a free episode of a withdrawn drama as gone', async () => {
    const response = await ask('ep_fx_w1e01');

    expect(response.statusCode).toBe(410);
    expect(errorCode(response)).toBe('CONTENT_OFFLINE');
  });

  it('refuses to quote a paid episode that has no price', async () => {
    const response = await ask('ep_fx_s2e08_unpriced');

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/priceCoins/);
  });
});

describe('POST /v1/entitlement/episode-access — who is asking', () => {
  it('treats a request with no credential as anonymous', async () => {
    expect((await access('ep_fx_s1e01')).viewerAccess.reason).toBe('FREE');
  });

  it('refuses a credential that is not a bearer token instead of assuming anonymous', async () => {
    const response = await fixtureApp.inject({
      method: 'POST',
      url: '/v1/entitlement/episode-access',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
      payload: { episodeId: 'ep_fx_s2e03' },
    });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('refuses an empty bearer token', async () => {
    const response = await fixtureApp.inject({
      method: 'POST',
      url: '/v1/entitlement/episode-access',
      headers: { authorization: 'Bearer ' },
      payload: { episodeId: 'ep_fx_s2e03' },
    });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  // A session that names a user we do not have is not an anonymous viewer. Answering as anonymous
  // would tell a subscriber they own nothing, and would look like a successful request.
  it('refuses a session naming an unknown user', async () => {
    const response = await ask('ep_fx_s2e03', 'usr_nope');

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });
});

describe('POST /v1/entitlement/episode-access — the default deployment', () => {
  it('denies rather than guessing when there is no data layer', async () => {
    const response = await ask('ep_fx_s1e01', undefined, defaultApp);

    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('COMMON_SERVICE_UNAVAILABLE');
  });

  // The default app resolves sessions against the store its own login route writes to (W3 slot L),
  // so a token nothing issued is the caller's problem — a 401 answered by running silent login —
  // rather than the 503 it was while no store existed. What has not changed, and is what this test
  // is for, is that a presented token is never read as an anonymous viewer.
  it('refuses a presented session rather than downgrading it to anonymous', async () => {
    const response = await defaultApp.inject({
      method: 'POST',
      url: '/v1/entitlement/episode-access',
      headers: { authorization: 'Bearer some-opaque-session-token' },
      payload: { episodeId: 'ep_fx_s1e01' },
    });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('AUTH_REQUIRED');
  });

  it('still validates the request first, so a bad request is still a 400', async () => {
    const response = await ask(undefined, undefined, defaultApp);

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('COMMON_VALIDATION_FAILED');
  });
});
