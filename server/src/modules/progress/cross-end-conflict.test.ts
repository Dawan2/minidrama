import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  EpisodeResumeView,
  FeedCard,
  DramaProgressView,
  Page,
  PlaybackDescriptor,
  WatchHistoryEntry,
} from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createInMemorySessionStore } from '../identity/session-store.js';
import { createInMemoryWatchProgressStore } from './store.js';
import { createFakeSessionResolver } from './test-sessions.js';
import { createFixtureWatchHistoryCatalogPort } from './fixtures.js';
import {
  createFixtureEntitlementFactsPort,
  createFixtureViewerResolver,
  fixtureViewerToken,
} from '../entitlement/fixtures.js';
import { createFixturePlaybackMediaPort } from '../playback/fixtures.js';
import { loadConfig } from '../../config.js';
import { WATCH_HISTORY_PATH } from './history-routes.js';

/**
 * Protocol C4 exit 2 — 跨端进度冲突用例 (`PRG-001`).
 *
 * Heartbeats, session `resumePositionSec`, and the HOME continue-watching rail are already on
 * `main`. What cycle-4 verify still called absent is the *use case*: phone B writes a newer
 * `clientUpdatedAt`, phone A's older report arrives second, and every surface that a returning
 * viewer reads — resume GET, HOME rail, history, playback session — still shows B. Arrival order
 * is a property of the network; the client clock is the LWW key. A stale report is still 204.
 *
 * Two apps, one story. The HOME rail needs a published catalogue episode (`ep_sweet_e02`).
 * Playback sessions need the entitlement fixture world (`ep_fx_s1e01`) and its existing fixture
 * `vid` — this file does not invent a BytePlus id.
 */

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app !== undefined) {
    await app.close();
    app = undefined;
  }
});

function report(positionSec: number, atIso: string): {
  readonly positionSec: number;
  readonly durationSec: number;
  readonly clientUpdatedAt: string;
} {
  return { positionSec, durationSec: 95, clientUpdatedAt: atIso };
}

describe('cross-end progress conflict — resume, HOME rail, drama lastWatched', () => {
  async function startCatalogApp(): Promise<{ token: string }> {
    const sessionStore = createInMemorySessionStore();
    const progress = createInMemoryWatchProgressStore();
    app = await buildApp(
      { ...loadConfig({}), logLevel: 'silent' },
      { sessionStore, watchProgressStore: progress },
    );
    await app.ready();
    return { token: sessionStore.issue('open_abc').accessToken };
  }

  it('keeps the newer device after the older report arrives late', async () => {
    const { token } = await startCatalogApp();
    const headers = { authorization: `Bearer ${token}` };

    expect(
      (
        await app!.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_sweet_e02',
          headers,
          payload: report(12, '2026-08-27T12:00:00.000Z'),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app!.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_sweet_e02',
          headers,
          payload: report(41, '2026-08-27T12:00:10.000Z'),
        })
      ).statusCode,
    ).toBe(204);
    const late = await app!.inject({
      method: 'PUT',
      url: '/v1/progress/episodes/ep_sweet_e02',
      headers,
      payload: report(12, '2026-08-27T12:00:00.000Z'),
    });
    expect(late.statusCode).toBe(204);
    expect(late.body).toBe('');

    const resume = await app!.inject({
      method: 'GET',
      url: '/v1/progress/episodes/ep_sweet_e02',
      headers,
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json<EpisodeResumeView>().resumePositionSec).toBe(41);

    const feed = await app!.inject({
      method: 'GET',
      url: '/v1/recommendations/feed?limit=3',
      headers,
    });
    expect(feed.statusCode).toBe(200);
    expect(feed.json<Page<FeedCard>>().items[0]).toMatchObject({
      cardType: 'CONTINUE_WATCHING',
      continueEpisode: { episodeId: 'ep_sweet_e02', globalEpisodeNumber: 2, positionSec: 41 },
    });

    const drama = await app!.inject({
      method: 'GET',
      url: '/v1/progress/dramas/drm_sweet_0003',
      headers,
    });
    expect(drama.statusCode).toBe(200);
    expect(drama.json<DramaProgressView>().lastWatched).toEqual({
      episodeId: 'ep_sweet_e02',
      episodeNumber: 2,
      positionSec: 41,
    });
  });
});

describe('cross-end progress conflict — playback session and history', () => {
  async function startFixtureApp(): Promise<void> {
    app = await buildApp(
      { ...loadConfig({}), logLevel: 'silent' },
      {
        viewerResolver: createFixtureViewerResolver(),
        entitlementFactsPort: createFixtureEntitlementFactsPort(),
        playbackMediaPort: createFixturePlaybackMediaPort(),
        watchProgressStore: createInMemoryWatchProgressStore(),
        watchHistoryCatalogPort: createFixtureWatchHistoryCatalogPort(),
      },
    );
    await app.ready();
  }

  it('resumes and lists history from the LWW winner, not from arrival order', async () => {
    await startFixtureApp();
    const headers = {
      authorization: `Bearer ${fixtureViewerToken('usr_fx_newcomer')}`,
    };

    expect(
      (
        await app!.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_fx_s1e01',
          headers,
          payload: report(12, '2026-08-27T12:00:00.000Z'),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app!.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_fx_s1e01',
          headers,
          payload: report(45, '2026-08-27T12:00:10.000Z'),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app!.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_fx_s1e01',
          headers,
          payload: report(12, '2026-08-27T12:00:00.000Z'),
        })
      ).statusCode,
    ).toBe(204);

    const session = await app!.inject({
      method: 'POST',
      url: '/v1/playback/sessions',
      headers,
      payload: { episodeId: 'ep_fx_s1e01' },
    });
    expect(session.statusCode).toBe(201);
    expect(session.json<PlaybackDescriptor>().resumePositionSec).toBe(45);

    const history = await app!.inject({
      method: 'GET',
      url: WATCH_HISTORY_PATH,
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json<Page<WatchHistoryEntry>>().items[0]).toMatchObject({
      lastEpisodeId: 'ep_fx_s1e01',
      lastPositionSec: 45,
    });
  });
});

describe('cross-end progress conflict — two viewers are not two devices', () => {
  it('never lets one viewer win a conflict against another viewer', async () => {
    app = await buildApp(
      { ...loadConfig({}), logLevel: 'silent' },
      {
        viewerResolver: createFakeSessionResolver(),
        watchProgressStore: createInMemoryWatchProgressStore(),
      },
    );
    await app.ready();

    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_1',
          headers: { authorization: 'Bearer tok_a' },
          payload: report(45, '2026-08-27T12:00:10.000Z'),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/progress/episodes/ep_1',
          headers: { authorization: 'Bearer tok_b' },
          payload: report(12, '2026-08-27T12:00:20.000Z'),
        })
      ).statusCode,
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/progress/episodes/ep_1',
          headers: { authorization: 'Bearer tok_a' },
        })
      ).json<EpisodeResumeView>().resumePositionSec,
    ).toBe(45);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/progress/episodes/ep_1',
          headers: { authorization: 'Bearer tok_b' },
        })
      ).json<EpisodeResumeView>().resumePositionSec,
    ).toBe(12);
  });
});
