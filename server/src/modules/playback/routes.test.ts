import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';

import {
  FIXTURE_NOW_MS,
  FIXTURE_WORLD,
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../entitlement/fixtures.js';
import { FIXTURE_MEDIA_EPISODE_IDS, createCountingPlaybackMediaPort } from './fixtures.js';
import { buildApp } from '../../app.js';
import { createUnavailablePlaybackMediaPort } from './media-port.js';
import { loadConfig } from '../../config.js';
import type { CountingPlaybackMediaPort } from './fixtures.js';

/**
 * `POST /v1/playback/sessions`, wired to the real entitlement decision.
 *
 * The endpoint is exercised through the assembled app, because what this slot owns is the
 * translation between one verdict and one HTTP response — and because playback and
 * `POST /v1/entitlement/episode-access` are registered against the *same* facts port in
 * `buildApp`, which is the property that keeps the browse view and the play attempt from
 * disagreeing.
 *
 * Three apps:
 *   - `app` — the fixture world, a fixed clock, and a media port that counts what it is asked for;
 *   - `assetlessApp` — entitled viewers, no media-asset table, the one failure a paying viewer sees;
 *   - `defaultApp` — what a deployment gets with nothing wired, which must refuse.
 */

let app: FastifyInstance;
let assetlessApp: FastifyInstance;
let defaultApp: FastifyInstance;
let media: CountingPlaybackMediaPort;

beforeAll(async () => {
  app = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      // Rebuilt per test below; the app closes over this object, so the array it exposes is the
      // one the route writes to.
      playbackMediaPort: {
        resolveMedia: async (query) => media.resolveMedia(query),
      },
      now: () => FIXTURE_NOW_MS,
    },
  );

  assetlessApp = await buildApp(
    { ...loadConfig({}), logLevel: 'silent' },
    {
      entitlementFactsPort: createFixtureEntitlementFactsPort(),
      viewerResolver: createFixtureViewerResolver(),
      playbackMediaPort: createUnavailablePlaybackMediaPort(),
      now: () => FIXTURE_NOW_MS,
    },
  );

  defaultApp = await buildApp({ ...loadConfig({}), logLevel: 'silent' });

  await Promise.all([app.ready(), assetlessApp.ready(), defaultApp.ready()]);
});

beforeEach(() => {
  media = createCountingPlaybackMediaPort();
});

afterAll(async () => {
  await Promise.all([app.close(), assetlessApp.close(), defaultApp.close()]);
});

interface Descriptor {
  readonly albumId: string;
  readonly episodeId: string;
  readonly vid: string;
  readonly resumePositionSec: number;
}

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly traceId: string;
    readonly details?: Record<string, unknown>;
  };
}

function play(
  episodeId: unknown,
  userId?: string,
  target: FastifyInstance = app,
): Promise<LightMyRequestResponse> {
  return target.inject({
    method: 'POST',
    url: '/v1/playback/sessions',
    ...(userId === undefined
      ? {}
      : { headers: { authorization: `Bearer ${fixtureViewerToken(userId)}` } }),
    payload: episodeId === undefined ? {} : { episodeId },
  });
}

/** Asserts a `201` and returns the descriptor. */
async function playable(episodeId: string, userId?: string): Promise<Descriptor> {
  const response = await play(episodeId, userId);

  expect(response.statusCode).toBe(201);

  return response.json<Descriptor>();
}

/**
 * Asserts a refusal, and — for every refusal, not only the commercial ones — that no media
 * identifier was resolved and none appears in the body.
 */
async function denied(
  episodeId: string,
  userId: string | undefined,
  status: number,
  code: string,
): Promise<ErrorEnvelope['error']> {
  const response = await play(episodeId, userId);

  expect(response.statusCode).toBe(status);

  const body = response.json<ErrorEnvelope>();
  expect(body.error.code).toBe(code);
  expect(media.lookups).toEqual([]);
  // The fixture world spells every video id `vid_fx_*` and every album `drm_fx_*`, so this catches
  // a descriptor field leaking into an error body without depending on the generated trace id.
  expect(response.body).not.toMatch(/vid_fx_|drm_fx_/);

  return body.error;
}

describe('POST /v1/playback/sessions — request handling', () => {
  it('rejects a request without an episodeId', async () => {
    const response = await play(undefined);

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorEnvelope>().error.code).toBe('COMMON_VALIDATION_FAILED');
  });

  it.each([
    ['', 'an empty string'],
    [42, 'a number'],
    [null, 'null'],
  ] as const)('rejects %j as an episodeId (%s)', async (episodeId, _description) => {
    const response = await play(episodeId);

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorEnvelope>().error.code).toBe('COMMON_VALIDATION_FAILED');
  });

  it('does not consult the media port for a request it cannot even read', async () => {
    await play(undefined);

    expect(media.lookups).toEqual([]);
  });

  it('echoes the trace id on a denial so a user report maps to a trace', async () => {
    const error = await denied('ep_fx_s2e01', 'usr_fx_newcomer', 403, 'EPISODE_LOCKED');

    expect(error.traceId).toMatch(/^req_/);
  });
});

describe('POST /v1/playback/sessions — ALLOWED issues a descriptor', () => {
  it('issues one for a free episode, naming the drama it was authorized against', async () => {
    expect(await playable('ep_fx_s1e01')).toEqual({
      albumId: 'drm_fx_revenge',
      episodeId: 'ep_fx_s1e01',
      vid: 'vid_fx_0001',
      resumePositionSec: 0,
    });
  });

  it('issues one for an episode the viewer bought with coins', async () => {
    expect(await playable('ep_fx_s2e03', 'usr_fx_vip_expired')).toMatchObject({
      episodeId: 'ep_fx_s2e03',
      vid: 'vid_fx_0013',
    });
  });

  it('issues one for a VIP-only episode to a live subscriber', async () => {
    expect(await playable('ep_fx_s2e05', 'usr_fx_vip_active')).toMatchObject({
      episodeId: 'ep_fx_s2e05',
      vid: 'vid_fx_0015',
    });
  });

  it('resolves the media exactly once, and only for the episode that was authorized', async () => {
    await playable('ep_fx_s1e05');

    expect(media.lookups).toEqual(['ep_fx_s1e05']);
  });

  /**
   * Correction A4: playback authorization is identifier-based. A media URL in this response would
   * mean we had quietly rebuilt the self-hosted delivery path the platform forbids. Asserted
   * against the raw body rather than the parsed object, so a field added later cannot smuggle one
   * in.
   */
  it('never returns a media URL or a quality ladder', async () => {
    for (const [episodeId, userId] of [
      ['ep_fx_s1e01', undefined],
      ['ep_fx_s2e03', 'usr_fx_vip_expired'],
      ['ep_fx_s2e05', 'usr_fx_vip_active'],
    ] as const) {
      const response = await play(episodeId, userId);

      expect(response.statusCode).toBe(201);
      expect(response.body).not.toMatch(/https?:\/\//);
      expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|definitions?"/i);
    }
  });

  it('starts at the beginning until watch progress owns the resume position', async () => {
    expect((await playable('ep_fx_s1e01')).resumePositionSec).toBe(0);
  });
});

describe('POST /v1/playback/sessions — NEED_UNLOCK mints nothing', () => {
  it('refuses a locked episode with the unlock context, and no descriptor', async () => {
    const error = await denied('ep_fx_s2e01', 'usr_fx_newcomer', 403, 'EPISODE_LOCKED');

    expect(error.details).toEqual({
      episodeId: 'ep_fx_s2e01',
      unlockPolicy: 'COIN_OR_VIP',
      unlockOptions: ['COINS', 'VIP'],
      priceCoins: 300,
    });
  });

  /**
   * The load-bearing assertion of this slot. An absent `vid` in the `403` body would only prove the
   * descriptor was not *sent*; a route that resolved the media first and discarded it would satisfy
   * that while still reading the media-asset store on behalf of someone who has not paid.
   */
  it('never asks the media port about an episode it is about to refuse', async () => {
    await play('ep_fx_s2e01', 'usr_fx_newcomer');

    expect(media.lookups).toEqual([]);
  });

  it('refuses the first paid episode after the drama-wide free window', async () => {
    const error = await denied('ep_fx_s1e06', 'usr_fx_newcomer', 403, 'EPISODE_LOCKED');

    expect(error.details).toMatchObject({ priceCoins: 300 });
  });

  it('refuses a coin-only episode to a live subscriber, offering coins and not VIP', async () => {
    const error = await denied('ep_fx_s2e07', 'usr_fx_vip_active', 403, 'EPISODE_LOCKED');

    expect(error.details).toMatchObject({ unlockOptions: ['COINS'], priceCoins: 500 });
  });

  it('refuses an episode whose limited-time grant has expired', async () => {
    await denied('ep_fx_s2e03', 'usr_fx_lapsed_grant', 403, 'EPISODE_LOCKED');
  });

  it('separates a commercial lock from a platform block by code', async () => {
    const error = await denied('ep_fx_s2e01', 'usr_fx_newcomer', 403, 'EPISODE_LOCKED');

    // `EPISODE_LOCKED` is a conversion opportunity; the platform's own refusals are incidents and
    // never arrive under this code (`docs/architecture/system-overview.md` §5.2).
    expect(error.code).not.toBe('COMMON_SERVICE_UNAVAILABLE');
  });
});

describe('POST /v1/playback/sessions — NEED_VIP is its own refusal', () => {
  it('refuses a VIP-only episode with EPISODE_VIP_REQUIRED, not EPISODE_LOCKED', async () => {
    const error = await denied('ep_fx_s2e05', 'usr_fx_newcomer', 403, 'EPISODE_VIP_REQUIRED');

    expect(error.details).toMatchObject({ unlockOptions: ['VIP'], priceCoins: null });
  });

  it('quotes no coin price for an episode that cannot be bought', async () => {
    const error = await denied('ep_fx_s2e05', 'usr_fx_newcomer', 403, 'EPISODE_VIP_REQUIRED');

    expect(error.details?.['priceCoins']).toBeNull();
  });
});

/**
 * The fixture this slot inherits from `docs/handoff/w2-work-f.md`: `usr_fx_vip_expired` still has
 * `vip.active: true` stored while its expiry has passed. Playback is the enforcement point, so
 * these are the cases where getting the lapse wrong either gives content away or charges a viewer
 * twice for something they own.
 */
describe('POST /v1/playback/sessions — a lapsed subscription (DM-3)', () => {
  it('still plays the episode the lapsed subscriber paid coins for', async () => {
    expect(await playable('ep_fx_s2e03', 'usr_fx_vip_expired')).toMatchObject({
      vid: 'vid_fx_0013',
    });
  });

  it('refuses an episode the lapsed subscriber only ever watched as a VIP', async () => {
    // A `VIP`-method unlock row is a viewing receipt, not a purchase. Honouring it would turn one
    // month of VIP into permanent access to everything watched during it.
    await denied('ep_fx_s2e05', 'usr_fx_vip_expired', 403, 'EPISODE_VIP_REQUIRED');
  });

  it('refuses a paid episode the lapsed subscriber never bought', async () => {
    const error = await denied('ep_fx_s2e01', 'usr_fx_vip_expired', 403, 'EPISODE_LOCKED');

    expect(error.details).toMatchObject({ priceCoins: 300 });
  });

  it('admits the live subscriber to the same episode it refuses the lapsed one', async () => {
    await denied('ep_fx_s2e01', 'usr_fx_vip_expired', 403, 'EPISODE_LOCKED');

    // The contrast is what makes the previous assertion about the lapse rather than about the
    // episode: one stored flag reads `true` in both cases, and only the expiry differs.
    expect(await playable('ep_fx_s2e01', 'usr_fx_vip_active')).toMatchObject({
      episodeId: 'ep_fx_s2e01',
    });
  });

  it('does not resolve the media for the lapsed subscriber it refuses', async () => {
    await play('ep_fx_s2e01', 'usr_fx_vip_expired');

    expect(media.lookups).toEqual([]);
  });
});

describe('POST /v1/playback/sessions — an anonymous play attempt', () => {
  /**
   * `docs/12-api-contracts.md` §4.4. The decision endpoint answers the same viewer `200
   * NEED_UNLOCK`, which is the truth for a browse view; this is an attempt, and signing in is the
   * step that has to happen first.
   */
  it('asks an anonymous viewer to sign in rather than quoting a 403', async () => {
    const error = await denied('ep_fx_s2e01', undefined, 401, 'AUTH_REQUIRED');

    expect(error.details).toMatchObject({ unlockOptions: ['COINS', 'VIP'], priceCoins: 300 });
  });

  it('asks an anonymous viewer to sign in for a VIP-only episode too', async () => {
    await denied('ep_fx_s2e05', undefined, 401, 'AUTH_REQUIRED');
  });

  it('still plays a free episode for an anonymous viewer', async () => {
    expect((await playable('ep_fx_s1e01')).vid).toBe('vid_fx_0001');
  });

  it('refuses a credential that is not a bearer token instead of assuming anonymous', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
      payload: { episodeId: 'ep_fx_s1e01' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorEnvelope>().error.code).toBe('AUTH_REQUIRED');
    expect(media.lookups).toEqual([]);
  });

  it('refuses a session naming a user we do not have', async () => {
    await denied('ep_fx_s1e01', 'usr_nope', 401, 'AUTH_REQUIRED');
  });
});

describe('POST /v1/playback/sessions — unavailable content', () => {
  it('reports an unknown episode as absent', async () => {
    const error = await denied('ep_nope', 'usr_fx_vip_active', 404, 'CONTENT_NOT_FOUND');

    expect(error.details).toEqual({ resourceType: 'EPISODE', resourceId: 'ep_nope' });
  });

  it('reports a draft episode as absent rather than as taken down', async () => {
    await denied('ep_fx_s2e09_draft', 'usr_fx_vip_active', 404, 'CONTENT_NOT_FOUND');
  });

  it('reports a published episode under a draft season as absent', async () => {
    await denied('ep_fx_s3e01', 'usr_fx_vip_active', 404, 'CONTENT_NOT_FOUND');
  });

  it('reports a withdrawn episode as gone', async () => {
    await denied('ep_fx_s2e10_offline', 'usr_fx_vip_active', 410, 'CONTENT_OFFLINE');
  });

  // Free, published, and belonging to a drama that is off the shelf. An unlock is not a licence to
  // play content we have taken down, and neither is a free policy.
  it('reports a free episode of a withdrawn drama as gone', async () => {
    await denied('ep_fx_w1e01', 'usr_fx_vip_active', 410, 'CONTENT_OFFLINE');
  });

  it('refuses a paid episode with no usable price, and quotes nothing', async () => {
    const response = await play('ep_fx_s2e08_unpriced', 'usr_fx_newcomer');

    expect(response.statusCode).toBe(503);
    expect(response.json<ErrorEnvelope>().error.code).toBe('COMMON_SERVICE_UNAVAILABLE');
    expect(response.body).not.toMatch(/priceCoins/);
    expect(media.lookups).toEqual([]);
  });
});

describe('POST /v1/playback/sessions — an entitled viewer with no asset', () => {
  it('answers EPISODE_ASSET_UNAVAILABLE rather than a descriptor with an empty vid', async () => {
    const response = await play('ep_fx_s1e01', undefined, assetlessApp);

    expect(response.statusCode).toBe(503);

    const error = response.json<ErrorEnvelope>().error;
    expect(error.code).toBe('EPISODE_ASSET_UNAVAILABLE');
    expect(error.details).toEqual({ episodeId: 'ep_fx_s1e01' });
  });

  it('does not report a missing asset as a commercial lock', async () => {
    const response = await play('ep_fx_s2e03', 'usr_fx_vip_expired', assetlessApp);

    // The viewer paid for this episode. Telling them it is locked would invite them to pay again.
    expect(response.json<ErrorEnvelope>().error.code).not.toBe('EPISODE_LOCKED');
  });
});

describe('POST /v1/playback/sessions — the default deployment', () => {
  it('denies rather than guessing when there is no data layer', async () => {
    const response = await play('ep_fx_s1e01', undefined, defaultApp);

    expect(response.statusCode).toBe(503);
    expect(response.json<ErrorEnvelope>().error.code).toBe('COMMON_SERVICE_UNAVAILABLE');
  });

  // Since W3 slot L the default app has a session store, so a token nothing issued is a rejected
  // credential (401) rather than one we cannot resolve (503). The property under test is unchanged:
  // a presented token is never read as an anonymous viewer.
  it('refuses a presented session rather than downgrading it to anonymous', async () => {
    const response = await defaultApp.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      headers: { authorization: 'Bearer some-opaque-session-token' },
      payload: { episodeId: 'ep_fx_s1e01' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorEnvelope>().error.code).toBe('AUTH_REQUIRED');
  });

  it('still validates the request first, so a bad request is still a 400', async () => {
    const response = await play(undefined, undefined, defaultApp);

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorEnvelope>().error.code).toBe('COMMON_VALIDATION_FAILED');
  });
});

describe('the playback and entitlement modules answer from the same facts', () => {
  /**
   * The two endpoints disagree about the *status* by design — reporting state versus refusing an
   * attempt — and must never disagree about the *verdict*. Registered against one facts port in
   * `buildApp`, this holds structurally; the test is here so a future second port is caught.
   */
  it.each([
    ['ep_fx_s1e01', undefined, true],
    ['ep_fx_s2e01', 'usr_fx_newcomer', false],
    ['ep_fx_s2e03', 'usr_fx_vip_expired', true],
    ['ep_fx_s2e05', 'usr_fx_vip_expired', false],
    ['ep_fx_s2e05', 'usr_fx_vip_active', true],
    ['ep_fx_s2e07', 'usr_fx_vip_active', false],
  ] as const)('agrees on %s for %s', async (episodeId, userId, expectedPlayable) => {
    const decision = await app.inject({
      method: 'POST',
      url: '/v1/entitlement/episode-access',
      ...(userId === undefined
        ? {}
        : { headers: { authorization: `Bearer ${fixtureViewerToken(userId)}` } }),
      payload: { episodeId },
    });
    const attempt = await play(episodeId, userId);

    expect(decision.statusCode).toBe(200);
    expect(decision.json<{ viewerAccess: { playable: boolean } }>().viewerAccess.playable).toBe(
      expectedPlayable,
    );
    expect(attempt.statusCode === 201).toBe(expectedPlayable);
  });

  it('has a media fixture for every episode in the entitlement fixture world', () => {
    const entitlementEpisodeIds = FIXTURE_WORLD.episodes.map((entry) => entry.episode.id);

    expect([...FIXTURE_MEDIA_EPISODE_IDS].sort()).toEqual([...entitlementEpisodeIds].sort());
  });
});
