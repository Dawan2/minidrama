import { TRUSTED_COVER_HOSTS } from '@minidrama/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DramaDetail, DramaSummary, EpisodeItem, Page, UnlockMethod } from '@minidrama/shared';
import type { FastifyInstance } from 'fastify';

import { SEED_CATALOG, createInMemoryCatalogStore } from './store.js';
import { buildApp } from '../../app.js';
import { createFakeSessionResolver } from '../progress/test-sessions.js';
import { createInMemoryFavoritesStore } from '../search/favorites.js';
import { loadConfig } from '../../config.js';
import type { AppDependencies } from '../../app.js';
import type { SeedCatalog } from './store.js';
import type { Viewer, ViewerResolver } from './viewer.js';

async function buildTestApp(dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, dependencies);
  await app.ready();
  return app;
}

function resolverFor(viewer: Viewer): ViewerResolver {
  return { resolve: (): Promise<Viewer> => Promise.resolve(viewer) };
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

async function episodesOf(dramaId: string, query = ''): Promise<Page<EpisodeItem>> {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/dramas/${dramaId}/episodes${query}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json<Page<EpisodeItem>>();
}

describe('GET /v1/dramas', () => {
  it('lists published dramas, most played first by default', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas' });
    const body = response.json<Page<{ id: string }>>();

    expect(response.statusCode).toBe(200);
    expect(body.items[0]?.id).toBe('drm_revenge_0001');
    expect(body.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  it('serves the summary fields the contract publishes, and no others', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas?limit=1' });
    const [first] = response.json<Page<Record<string, unknown>>>().items;

    expect(Object.keys(first ?? {}).sort()).toEqual([
      'category',
      'coverUrl',
      'freeEpisodes',
      'id',
      'isCompleted',
      'stat',
      'tags',
      'title',
      'totalEpisodes',
    ]);
  });

  it('reorders for sort=NEW', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas?sort=NEW' });
    expect(response.json<Page<{ id: string }>>().items[0]?.id).toBe('drm_sweet_0003');
  });

  it('filters by category and tag', async () => {
    const byCategory = await app.inject({ method: 'GET', url: '/v1/dramas?category=REVENGE' });
    expect(byCategory.json<Page<{ id: string }>>().items.map((item) => item.id)).toEqual([
      'drm_revenge_0001',
    ]);

    const byTag = await app.inject({ method: 'GET', url: '/v1/dramas?tag=revenge' });
    expect(byTag.json<Page<{ id: string }>>().items).toHaveLength(2);
  });

  it('returns an empty page rather than an error for a tag nothing carries', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas?tag=no-such-tag' });

    expect(response.statusCode).toBe(200);
    expect(response.json<Page<unknown>>()).toEqual({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
  });

  it('pages through the whole list without repeating or skipping a drama', async () => {
    const seen: string[] = [];
    let url = '/v1/dramas?limit=2';

    for (let guard = 0; guard < 10; guard += 1) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      const body = response.json<Page<{ id: string }>>();
      seen.push(...body.items.map((item) => item.id));

      if (!body.pageInfo.hasMore) break;
      url = `/v1/dramas?limit=2&cursor=${encodeURIComponent(body.pageInfo.nextCursor ?? '')}`;
    }

    expect(seen).toEqual([
      'drm_revenge_0001',
      'drm_dynasty_0002',
      'drm_sweet_0003',
      'drm_suspense_0004',
      'drm_comedy_0005',
      'drm_family_0006',
    ]);
  });

  it('never serves a draft or delisted drama, which both outrank most of the catalogue', async () => {
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/dramas?limit=100' }),
      app.inject({ method: 'GET', url: '/v1/dramas?sort=NEW&limit=100' }),
    ]);

    for (const response of responses) {
      expect(response.body).not.toContain('drm_offline_0007');
      expect(response.body).not.toContain('drm_draft_0008');
    }
  });

  it.each([
    ['an unknown category', '/v1/dramas?category=WESTERN'],
    ['an unknown sort', '/v1/dramas?sort=RANDOM'],
    ['a limit above the maximum', '/v1/dramas?limit=101'],
    ['a limit of zero', '/v1/dramas?limit=0'],
    ['a non-numeric limit', '/v1/dramas?limit=all'],
    ['a repeated parameter', '/v1/dramas?sort=HOT&sort=NEW'],
    ['a malformed cursor', '/v1/dramas?cursor=not-a-cursor'],
  ])('rejects %s', async (_label, url) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'COMMON_VALIDATION_FAILED',
    );
  });

  // Resuming a HOT cursor inside a NEW list would silently resume from the wrong place.
  it('rejects a cursor minted by a different ordering', async () => {
    const hot = await app.inject({ method: 'GET', url: '/v1/dramas?limit=2' });
    const cursor = hot.json<Page<unknown>>().pageInfo.nextCursor ?? '';

    const reused = await app.inject({
      method: 'GET',
      url: `/v1/dramas?sort=NEW&limit=2&cursor=${encodeURIComponent(cursor)}`,
    });

    expect(reused.statusCode).toBe(400);
  });
});

describe('GET /v1/dramas/:dramaId', () => {
  it('returns the detail view with its published seasons', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas/drm_dynasty_0002' });
    const body = response.json<DramaDetail>();

    expect(response.statusCode).toBe(200);
    expect(body.title).toBe('Twin Moons Dynasty');
    expect(body.seasons.map((season) => season.seasonNumber)).toEqual([1, 2]);
    expect(body.seasons.every((season) => season.episodeCount === 3)).toBe(true);
  });

  it('omits an offline season rather than offering a tab that opens onto nothing', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas/drm_dynasty_0002' });
    expect(response.body).not.toContain('ssn_dynasty_s3');
  });

  // `favorited: false` would be rendered as a confirmed empty heart. Null says "not known".
  it('reports viewer state as unknown for an anonymous request', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas/drm_revenge_0001' });
    expect(response.json<DramaDetail>().viewer).toBeNull();
  });

  it('answers 404 for an unknown drama and for one that was never published', async () => {
    for (const dramaId of ['drm_nope', 'drm_draft_0008']) {
      const response = await app.inject({ method: 'GET', url: `/v1/dramas/${dramaId}` });

      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('CONTENT_NOT_FOUND');
    }
  });

  // A deep link to a delisted drama needs "no longer available", not "wrong link".
  it('answers 410 for a delisted drama', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas/drm_offline_0007' });
    const body = response.json<{ error: { code: string; details: { resourceType: string } } }>();

    expect(response.statusCode).toBe(410);
    expect(body.error.code).toBe('CONTENT_OFFLINE');
    expect(body.error.details.resourceType).toBe('DRAMA');
  });
});

describe('GET /v1/dramas/:dramaId — viewer.favorited from the favourites store', () => {
  const NOW = Date.parse('2026-08-27T12:00:00.000Z');

  async function signedInApp(favorited: boolean): Promise<FastifyInstance> {
    const favorites = createInMemoryFavoritesStore();
    if (favorited) {
      await favorites.add('user_a', 'drm_revenge_0001', NOW);
    }

    return buildTestApp({
      favoritesStore: favorites,
      viewerResolver: createFakeSessionResolver(),
      now: () => NOW,
    });
  }

  it('reads the same store the favourite verbs write', async () => {
    const instance = await signedInApp(true);

    const response = await instance.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001',
      headers: { authorization: 'Bearer tok_a' },
    });

    expect(response.json<DramaDetail>().viewer).toEqual({
      favorited: true,
      lastWatched: null,
    });
    await instance.close();
  });

  it('says not-followed for a signed-in viewer with no row, rather than unknown', async () => {
    const instance = await signedInApp(false);

    const response = await instance.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001',
      headers: { authorization: 'Bearer tok_a' },
    });

    expect(response.json<DramaDetail>().viewer).toEqual({
      favorited: false,
      lastWatched: null,
    });
    await instance.close();
  });

  it('does not 401 a public read over a bad token — it stays anonymous', async () => {
    const instance = await signedInApp(true);

    const response = await instance.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001',
      headers: { authorization: 'Bearer tok_forged' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<DramaDetail>().viewer).toBeNull();
    await instance.close();
  });
});

describe('GET /v1/dramas/:dramaId/episodes', () => {
  it('returns one flat running order across seasons', async () => {
    const page = await episodesOf('drm_dynasty_0002');

    expect(page.items.map((item) => item.globalEpisodeNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(page.items.map((item) => item.seasonNumber)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  /**
   * The decisive case for this slot. `drm_dynasty_0002` gives away three episodes and has three
   * episodes per season, so season 2 episode 1 is the fourth episode of the drama. Measuring the
   * free window in the per-season `episodeNumber` — which is 1 here — would hand away the opening
   * episodes of every season the drama ever ships.
   */
  it('measures the free window in global episode numbers, not per-season ones', async () => {
    const page = await episodesOf('drm_dynasty_0002');
    const seasonTwoOpener = page.items.find((item) => item.id === 'ep_dynasty_s2e01');

    expect(seasonTwoOpener?.episodeNumber).toBe(1);
    expect(seasonTwoOpener?.globalEpisodeNumber).toBe(4);
    expect(seasonTwoOpener?.viewerAccess).toEqual({
      playable: false,
      reason: 'NEED_UNLOCK',
      unlockedBy: null,
    });
    expect(seasonTwoOpener?.unlockPolicy).toBe('COIN_OR_VIP');
    expect(seasonTwoOpener?.priceCoins).toBe(80);
  });

  it('gives away exactly the first freeEpisodes episodes', async () => {
    const page = await episodesOf('drm_dynasty_0002');
    const freeNumbers = page.items
      .filter((item) => item.viewerAccess.reason === 'FREE')
      .map((item) => item.globalEpisodeNumber);

    expect(freeNumbers).toEqual([1, 2, 3]);
  });

  it('reports an episode marked free past the window as free, at no price', async () => {
    const page = await episodesOf('drm_revenge_0001');
    const marked = page.items.find((item) => item.id === 'ep_revenge_e05');

    expect(marked?.globalEpisodeNumber).toBe(5);
    expect(marked?.viewerAccess.reason).toBe('FREE');
    expect(marked?.priceCoins).toBeNull();
  });

  it('denies a VIP-only episode without offering an unlock price', async () => {
    const page = await episodesOf('drm_revenge_0001');
    const vipOnly = page.items.find((item) => item.id === 'ep_revenge_e06');

    expect(vipOnly?.viewerAccess.reason).toBe('NEED_VIP');
    expect(vipOnly?.priceCoins).toBeNull();
  });

  it('keeps a withdrawn episode in the grid, marked unavailable', async () => {
    const page = await episodesOf('drm_revenge_0001');
    const withdrawn = page.items.find((item) => item.id === 'ep_revenge_e07');

    expect(withdrawn?.globalEpisodeNumber).toBe(7);
    expect(withdrawn?.viewerAccess).toEqual({
      playable: false,
      reason: 'UNAVAILABLE',
      unlockedBy: null,
    });
  });

  it('omits an unreleased episode entirely', async () => {
    const page = await episodesOf('drm_revenge_0001');
    expect(page.items.map((item) => item.id)).not.toContain('ep_revenge_e08');
  });

  it('filters to one season while keeping global numbering', async () => {
    const page = await episodesOf('drm_dynasty_0002', '?seasonNumber=2');

    expect(page.items.map((item) => item.id)).toEqual([
      'ep_dynasty_s2e01',
      'ep_dynasty_s2e02',
      'ep_dynasty_s2e03',
    ]);
    expect(page.items.map((item) => item.globalEpisodeNumber)).toEqual([4, 5, 6]);
  });

  it('answers 404 for a season the drama does not have', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/dramas/drm_dynasty_0002/episodes?seasonNumber=9',
    });
    const body = response.json<{ error: { code: string; details: { resourceType: string } } }>();

    expect(response.statusCode).toBe(404);
    expect(body.error.code).toBe('CONTENT_NOT_FOUND');
    expect(body.error.details.resourceType).toBe('SEASON');
  });

  it('answers 404 for an offline season, which is not listed either', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/dramas/drm_dynasty_0002/episodes?seasonNumber=3',
    });

    expect(response.statusCode).toBe(404);
  });

  it('pages in global episode order', async () => {
    const first = await episodesOf('drm_dynasty_0002', '?limit=4');
    expect(first.items.map((item) => item.globalEpisodeNumber)).toEqual([1, 2, 3, 4]);
    expect(first.pageInfo.hasMore).toBe(true);

    const second = await episodesOf(
      'drm_dynasty_0002',
      `?limit=4&cursor=${encodeURIComponent(first.pageInfo.nextCursor ?? '')}`,
    );
    expect(second.items.map((item) => item.globalEpisodeNumber)).toEqual([5, 6]);
    expect(second.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  // The 27-episode seed never produced a second page at the episode list's default of 50.
  // `drm_sweet_0003` is the volume run; the first five remain inside its free window.
  it('pages a volume drama past the default episode limit', async () => {
    const first = await episodesOf('drm_sweet_0003');
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.id).toBe('ep_sweet_e01');
    expect(first.items[4]?.viewerAccess.reason).toBe('FREE');
    expect(first.items[5]?.viewerAccess.reason).toBe('NEED_UNLOCK');
    expect(first.pageInfo.hasMore).toBe(true);
    expect(first.pageInfo.nextCursor).not.toBeNull();

    const second = await episodesOf(
      'drm_sweet_0003',
      `?cursor=${encodeURIComponent(first.pageInfo.nextCursor ?? '')}`,
    );
    expect(second.items).toHaveLength(30);
    expect(second.items[0]?.id).toBe('ep_sweet_e51');
    expect(second.items[29]?.id).toBe('ep_sweet_e80');
    expect(second.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  it.each([
    ['a season number that is not a positive integer', '?seasonNumber=0'],
    ['a season number that is not a number at all', '?seasonNumber=two'],
    ['a limit above the maximum', '?limit=101'],
  ])('rejects %s', async (_label, query) => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/dramas/drm_dynasty_0002/episodes${query}`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 410 for the episodes of a delisted drama', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/dramas/drm_offline_0007/episodes',
    });

    expect(response.statusCode).toBe(410);
  });

  // The catalogue answers "may you watch this". It must never also answer "here is how".
  it('carries no playback handle of any kind', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/dramas/drm_revenge_0001/episodes',
    });

    expect(response.body).not.toMatch(/\.m3u8|\.mp4|playUrl|videoUrl|streamUrl|assetKey|"vid"/i);
    expect(response.body).not.toMatch(/playAuthToken|albumId/i);
  });
});

describe('the viewer a catalogue request is answered for', () => {
  // Sessions are opaque tokens with no verification path yet. Honouring this header would mean
  // trusting it, which is an entitlement bypass that reads as a feature.
  it('is anonymous even when the request carries an Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/dramas/drm_dynasty_0002/episodes',
      headers: { authorization: 'Bearer anything-at-all' },
    });
    const page = response.json<Page<EpisodeItem>>();

    expect(page.items.find((item) => item.id === 'ep_dynasty_s2e01')?.viewerAccess.reason).toBe(
      'NEED_UNLOCK',
    );
  });

  it('reports VIP access for a subscriber once a resolver can identify one', async () => {
    const subscriber = await buildTestApp({
      catalogViewerResolver: resolverFor({ userId: 'usr_vip', vip: true, unlocks: new Map() }),
    });

    try {
      const response = await subscriber.inject({
        method: 'GET',
        url: '/v1/dramas/drm_dynasty_0002/episodes',
      });
      const page = response.json<Page<EpisodeItem>>();

      expect(page.items.find((item) => item.id === 'ep_dynasty_s2e01')?.viewerAccess).toEqual({
        playable: true,
        reason: 'VIP',
        unlockedBy: null,
      });
    } finally {
      await subscriber.close();
    }
  });

  it('reports an owned episode as unlocked, with the method that bought it', async () => {
    const owner = await buildTestApp({
      catalogViewerResolver: resolverFor({
        userId: 'usr_owner',
        vip: false,
        unlocks: new Map<string, UnlockMethod>([['ep_dynasty_s2e01', 'COIN']]),
      }),
    });

    try {
      const response = await owner.inject({
        method: 'GET',
        url: '/v1/dramas/drm_dynasty_0002/episodes',
      });
      const page = response.json<Page<EpisodeItem>>();

      expect(page.items.find((item) => item.id === 'ep_dynasty_s2e01')?.viewerAccess).toEqual({
        playable: true,
        reason: 'UNLOCKED',
        unlockedBy: 'COIN',
      });
      // Owning one episode is not owning the next one.
      expect(page.items.find((item) => item.id === 'ep_dynasty_s2e02')?.viewerAccess.reason).toBe(
        'NEED_UNLOCK',
      );
    } finally {
      await owner.close();
    }
  });
});

describe('GET /v1/episodes/:episodeId', () => {
  it('returns the same episode view the list returns', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/episodes/ep_dynasty_s2e01' });
    const item = response.json<EpisodeItem>();
    const fromList = (await episodesOf('drm_dynasty_0002')).items.find(
      (candidate) => candidate.id === 'ep_dynasty_s2e01',
    );

    expect(response.statusCode).toBe(200);
    expect(item).toEqual(fromList);
  });

  it('serves the episode fields the contract publishes, and no others', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/episodes/ep_dynasty_s2e01' });

    expect(Object.keys(response.json<Record<string, unknown>>()).sort()).toEqual([
      'dramaId',
      'durationSec',
      'episodeNumber',
      'globalEpisodeNumber',
      'id',
      'priceCoins',
      'seasonId',
      'seasonNumber',
      'title',
      'unlockPolicy',
      'viewerAccess',
    ]);
  });

  it('answers 404 for an unknown episode and for an unreleased one', async () => {
    for (const episodeId of ['ep_nope', 'ep_revenge_e08']) {
      const response = await app.inject({ method: 'GET', url: `/v1/episodes/${episodeId}` });
      expect(response.statusCode).toBe(404);
    }
  });

  it.each([
    ['a withdrawn episode', 'ep_revenge_e07', 'EPISODE'],
    ['an episode of a withdrawn season', 'ep_dynasty_s3e01', 'SEASON'],
    ['an episode of a delisted drama', 'ep_offline_e01', 'DRAMA'],
  ])('answers 410 for %s', async (_label, episodeId, resourceType) => {
    const response = await app.inject({ method: 'GET', url: `/v1/episodes/${episodeId}` });
    const body = response.json<{ error: { code: string; details: { resourceType: string } } }>();

    expect(response.statusCode).toBe(410);
    expect(body.error.code).toBe('CONTENT_OFFLINE');
    expect(body.error.details.resourceType).toBe(resourceType);
  });

  it('puts a trace id on every failure', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/episodes/ep_nope' });
    expect(response.json<{ error: { traceId: string } }>().error.traceId).toMatch(/^req_/);
  });
});

/**
 * The cover gate, observed from outside the process.
 *
 * `covers.test.ts` establishes that `safeCoverUrl` refuses the right URLs; these tests establish
 * the part that unit tests cannot, which is that no catalogue response reaches a client carrying an
 * untrusted one. That is a claim about every route and every field rather than about one function,
 * so the decisive assertion here is on the raw response body: the hostile string must not appear
 * anywhere in it, not merely be absent from the field we thought to look at.
 */
const HOSTILE_HOST = 'cdn.evil.example';
const HOSTILE_HOST_COVER = `https://${HOSTILE_HOST}/covers/stolen.jpg`;
// eslint-disable-next-line no-script-url -- the scheme the catalogue must refuse to serve
const SCRIPT_SCHEME = 'javascript:';
const HOSTILE_SCHEME_COVER = `${SCRIPT_SCHEME}alert(document.domain)`;

/** The seed catalogue with every cover replaced by one the registry refuses. */
function hostileCatalog(): SeedCatalog {
  return {
    ...SEED_CATALOG,
    dramas: SEED_CATALOG.dramas.map((drama) => ({
      ...drama,
      coverUrl: HOSTILE_HOST_COVER,
      horizontalCoverUrl: HOSTILE_SCHEME_COVER,
    })),
  };
}

describe('catalogue cover URLs', () => {
  let hostile: FastifyInstance;

  beforeAll(async () => {
    hostile = await buildTestApp({ catalogStore: createInMemoryCatalogStore(hostileCatalog()) });
  });

  afterAll(async () => {
    await hostile.close();
  });

  it('serves a trusted cover as the parsed URL', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/dramas?limit=1' });
    const [first] = response.json<Page<DramaSummary>>().items;
    const host = TRUSTED_COVER_HOSTS[0]?.host as string;

    expect(first?.coverUrl).toBe(`https://${host}/covers/reborn-at-the-banquet.jpg`);
  });

  it('omits an untrusted cover from the drama list', async () => {
    const response = await hostile.inject({ method: 'GET', url: '/v1/dramas' });
    const body = response.json<Page<DramaSummary>>();

    expect(response.statusCode).toBe(200);
    expect(body.items).not.toHaveLength(0);
    for (const item of body.items) {
      expect(item.coverUrl).toBeNull();
    }
  });

  it('omits both cover fields from the drama detail', async () => {
    const response = await hostile.inject({ method: 'GET', url: '/v1/dramas/drm_revenge_0001' });
    const detail = response.json<DramaDetail>();

    expect(response.statusCode).toBe(200);
    expect(detail.coverUrl).toBeNull();
    expect(detail.horizontalCoverUrl).toBeNull();
  });

  /**
   * A refused cover must not degrade the response around it. Dropping the whole drama, or answering
   * 500, would turn a content-data problem into an outage — and an outage is what gets the check
   * disabled at 2am.
   */
  it('still serves the rest of the drama, and still lists every drama', async () => {
    const listed = await hostile.inject({ method: 'GET', url: '/v1/dramas' });
    const reference = await app.inject({ method: 'GET', url: '/v1/dramas' });

    expect(listed.json<Page<DramaSummary>>().items.map((item) => item.id)).toEqual(
      reference.json<Page<DramaSummary>>().items.map((item) => item.id),
    );

    const detail = await hostile.inject({ method: 'GET', url: '/v1/dramas/drm_revenge_0001' });
    const body = detail.json<DramaDetail>();

    expect(body.title).toBe('Reborn at the Banquet');
    expect(body.seasons).toHaveLength(1);
  });

  it('keeps the field present, so a client cannot miss the null', async () => {
    const response = await hostile.inject({ method: 'GET', url: '/v1/dramas?limit=1' });
    const [first] = response.json<Page<Record<string, unknown>>>().items;

    expect(first).toHaveProperty('coverUrl');
    expect(Object.keys(first ?? {})).toContain('coverUrl');
  });

  it.each([
    ['the drama list', '/v1/dramas'],
    ['a drama detail', '/v1/dramas/drm_revenge_0001'],
    ['an episode list', '/v1/dramas/drm_revenge_0001/episodes'],
    ['an episode', '/v1/episodes/ep_revenge_e01'],
  ])('leaks no untrusted cover anywhere in %s', async (_label, url) => {
    const response = await hostile.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(HOSTILE_HOST);
    expect(response.body).not.toContain(SCRIPT_SCHEME);
  });
});
