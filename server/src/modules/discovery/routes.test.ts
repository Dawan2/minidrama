import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { FeedCard, Page } from '@minidrama/shared';

import { buildApp } from '../../app.js';
import { createInMemorySessionStore } from '../identity/session-store.js';
import { createInMemoryWatchProgressStore } from '../progress/store.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';
import type { ContinueWatchingEntry, ContinueWatchingSource } from './feed.js';
import type { WatchProgressRecord } from '../progress/progress.js';

async function buildTestApp(dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, dependencies);
  await app.ready();
  return app;
}

function watching(...entries: readonly ContinueWatchingEntry[]): ContinueWatchingSource {
  return { forViewer: (): Promise<readonly ContinueWatchingEntry[]> => Promise.resolve(entries) };
}

async function feedOf(
  app: FastifyInstance,
  query = '',
  headers: Record<string, string> = {},
): Promise<Page<FeedCard>> {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/recommendations/feed${query}`,
    headers,
  });
  expect(response.statusCode).toBe(200);
  return response.json<Page<FeedCard>>();
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /v1/recommendations/feed', () => {
  it('serves an anonymous viewer a non-personalised mix rather than an error', async () => {
    const page = await feedOf(app);

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((card) => card.cardType === 'DRAMA')).toBe(true);
  });

  it('serves the card fields the contract publishes, and no others', async () => {
    const page = await feedOf(app, '?limit=1');

    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      'cardType',
      'continueEpisode',
      'drama',
      'recReason',
      'trackingId',
    ]);
  });

  it('never puts an unpublished drama on a card', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/recommendations/feed?limit=50' });

    expect(response.body).not.toContain('drm_offline_0007');
    expect(response.body).not.toContain('drm_draft_0008');
  });

  it('shows each drama once across the whole feed, page boundaries included', async () => {
    const seen: string[] = [];
    let query = '?limit=2';

    for (let guard = 0; guard < 10; guard += 1) {
      const page = await feedOf(app, query);
      seen.push(...page.items.map((card) => card.drama.id));
      if (!page.pageInfo.hasMore) break;
      query = `?limit=2&cursor=${encodeURIComponent(page.pageInfo.nextCursor ?? '')}`;
    }

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('mints a fresh tracking id per card and per response', async () => {
    const first = await feedOf(app, '?limit=6');
    const second = await feedOf(app, '?limit=6');

    const ids = first.items.map((card) => card.trackingId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^trk_[0-9a-f]{16}$/.test(id))).toBe(true);

    // Two responses are two impression opportunities; sharing an id would collapse them into one
    // and make click-through rate unmeasurable.
    const repeated = second.items.map((card) => card.trackingId);
    expect(ids.some((id) => repeated.includes(id))).toBe(false);
  });

  it.each([
    ['an unknown scene', '?scene=LOBBY'],
    ['a limit above the maximum', '?limit=51'],
    ['a malformed cursor', '?cursor=nonsense'],
  ])('rejects %s', async (_label, query) => {
    const response = await app.inject({ method: 'GET', url: `/v1/recommendations/feed${query}` });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  it('rejects a cursor minted for the other scene', async () => {
    const home = await feedOf(app, '?limit=2');
    const response = await app.inject({
      method: 'GET',
      url: `/v1/recommendations/feed?scene=PLAYER&limit=2&cursor=${encodeURIComponent(
        home.pageInfo.nextCursor ?? '',
      )}`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('carries no playback handle', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/recommendations/feed?limit=50' });
    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|videoUrl|assetKey|"vid"/i);
  });
});

describe('continue watching', () => {
  it('leads the home feed and carries the resume position', async () => {
    const resuming = await buildTestApp({
      continueWatching: watching({ episodeId: 'ep_sweet_e02', positionSec: 41 }),
    });

    try {
      const page = await feedOf(resuming, '?limit=3');

      expect(page.items[0]).toMatchObject({
        cardType: 'CONTINUE_WATCHING',
        recReason: 'Continue watching',
        continueEpisode: { episodeId: 'ep_sweet_e02', globalEpisodeNumber: 2, positionSec: 41 },
      });
      expect(page.items[0]?.drama.id).toBe('drm_sweet_0003');
      // And the drama does not come round again as an ordinary card further down.
      expect(page.items.filter((card) => card.drama.id === 'drm_sweet_0003')).toHaveLength(1);
    } finally {
      await resuming.close();
    }
  });

  it('does not appear on the player scene', async () => {
    const resuming = await buildTestApp({
      continueWatching: watching({ episodeId: 'ep_sweet_e02', positionSec: 41 }),
    });

    try {
      const page = await feedOf(resuming, '?scene=PLAYER');
      expect(page.items.every((card) => card.cardType === 'DRAMA')).toBe(true);
    } finally {
      await resuming.close();
    }
  });

  // A progress record outlives the content it points at. Serving the card anyway sends the viewer
  // straight into an error screen.
  it.each([
    ['a delisted drama', 'ep_offline_e01'],
    ['a withdrawn episode', 'ep_revenge_e07'],
    ['an episode of a withdrawn season', 'ep_dynasty_s3e01'],
    ['an episode that no longer exists', 'ep_deleted_e01'],
  ])('drops a continue-watching card pointing at %s', async (_label, episodeId) => {
    const resuming = await buildTestApp({
      continueWatching: watching({ episodeId, positionSec: 12 }),
    });

    try {
      const page = await feedOf(resuming, '?limit=50');
      expect(page.items.every((card) => card.cardType === 'DRAMA')).toBe(true);
      expect(page.items.every((card) => card.continueEpisode === null)).toBe(true);
    } finally {
      await resuming.close();
    }
  });

  it('leaves the drama itself in the feed when only its resume point is gone', async () => {
    const resuming = await buildTestApp({
      continueWatching: watching({ episodeId: 'ep_revenge_e07', positionSec: 12 }),
    });

    try {
      const page = await feedOf(resuming, '?limit=50');
      expect(page.items.map((card) => card.drama.id)).toContain('drm_revenge_0001');
    } finally {
      await resuming.close();
    }
  });

  // Numbering is a property of the drama; a number copied into a progress record can be stale.
  it('takes the episode number from the catalogue, not from the progress record', async () => {
    const resuming = await buildTestApp({
      continueWatching: watching({ episodeId: 'ep_dynasty_s2e01', positionSec: 5 }),
    });

    try {
      const page = await feedOf(resuming, '?limit=1');
      expect(page.items[0]?.continueEpisode?.globalEpisodeNumber).toBe(4);
    } finally {
      await resuming.close();
    }
  });
});

describe('continue watching — default source is the heartbeat table', () => {
  const nowMs = Date.parse('2026-08-27T12:00:00.000Z');

  function heartbeat(overrides: Partial<WatchProgressRecord> = {}): WatchProgressRecord {
    return {
      userId: 'open_abc',
      episodeId: 'ep_sweet_e02',
      positionSec: 41,
      durationSec: 95,
      completed: false,
      clientUpdatedAtMs: nowMs,
      updatedAtMs: nowMs,
      ...overrides,
    };
  }

  async function wiredFeed(): Promise<{
    readonly app: FastifyInstance;
    readonly token: string;
    readonly otherToken: string;
  }> {
    const sessionStore = createInMemorySessionStore();
    const progress = createInMemoryWatchProgressStore();
    await progress.save(heartbeat());
    const app = await buildTestApp({ sessionStore, watchProgressStore: progress });
    return {
      app,
      token: sessionStore.issue('open_abc').accessToken,
      otherToken: sessionStore.issue('open_xyz').accessToken,
    };
  }

  it('leads the home feed from the heartbeat the same viewer wrote', async () => {
    const { app: resuming, token } = await wiredFeed();

    try {
      const page = await feedOf(resuming, '?limit=3', { authorization: `Bearer ${token}` });

      expect(page.items[0]).toMatchObject({
        cardType: 'CONTINUE_WATCHING',
        recReason: 'Continue watching',
        continueEpisode: { episodeId: 'ep_sweet_e02', globalEpisodeNumber: 2, positionSec: 41 },
      });
      expect(page.items[0]?.drama.id).toBe('drm_sweet_0003');
    } finally {
      await resuming.close();
    }
  });

  it('does not invent a rail for an anonymous caller, even when the store has rows', async () => {
    const { app: resuming } = await wiredFeed();

    try {
      const page = await feedOf(resuming, '?limit=3');
      expect(page.items.every((card) => card.cardType === 'DRAMA')).toBe(true);
    } finally {
      await resuming.close();
    }
  });

  it("does not leak another viewer's heartbeat onto this rail", async () => {
    const { app: resuming, otherToken } = await wiredFeed();

    try {
      const page = await feedOf(resuming, '?limit=3', {
        authorization: `Bearer ${otherToken}`,
      });
      expect(page.items.every((card) => card.cardType === 'DRAMA')).toBe(true);
    } finally {
      await resuming.close();
    }
  });

  it('answers a rejected session as anonymous rather than 401ing the catalogue mix', async () => {
    const { app: resuming } = await wiredFeed();

    try {
      const response = await resuming.inject({
        method: 'GET',
        url: '/v1/recommendations/feed?limit=3',
        headers: { authorization: 'Bearer not-a-session' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<Page<FeedCard>>().items.every((card) => card.cardType === 'DRAMA')).toBe(
        true,
      );
    } finally {
      await resuming.close();
    }
  });
});
