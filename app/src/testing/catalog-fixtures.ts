import { err, ok } from '@minidrama/shared';
import type {
  DramaDetail,
  DramaSummary,
  EpisodeItem,
  FeedCard,
  Page,
  Result,
  ViewerAccess,
  ViewerAccessReason,
} from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import type { ApiFailure } from '../data/failure';
import type { CatalogApi, EpisodesRequest, FeedRequest } from '../data/catalog-api';

/**
 * Test doubles for the catalogue.
 *
 * **Nothing outside `src/testing/` and the test files may import from here** —
 * `import-hygiene.test.ts` enforces it, because a fixture reachable from a screen is a fixture that
 * ships inside the bundle the platform scans.
 *
 * The stub implements `CatalogApi`, which is the seam the screens actually depend on. Stubbing
 * `fetch` instead would put the transport in the middle of every screen assertion and make a page's
 * five states depend on HTTP status codes rather than on the states themselves — those are tested
 * once, against the client, in `http.test.ts` and `failure.test.ts`.
 */

/**
 * `playable` is derived from the reason rather than passed in, so a fixture cannot accidentally
 * describe a state the server never produces — a "playable NEED_UNLOCK" fixture would make a broken
 * presentation rule look correct. The contradictory combinations are built explicitly, by hand, in
 * the tests that exist to prove the client fails closed on them.
 */
const PLAYABLE_REASONS: readonly ViewerAccessReason[] = ['FREE', 'UNLOCKED', 'VIP'];

export function viewerAccess(reason: ViewerAccessReason): ViewerAccess {
  return {
    playable: PLAYABLE_REASONS.includes(reason),
    reason,
    unlockedBy: reason === 'UNLOCKED' ? 'COIN' : null,
  };
}

export function dramaSummary(overrides: Partial<DramaSummary> = {}): DramaSummary {
  return {
    id: 'drm_test_0001',
    title: 'The Heiress Returns',
    coverUrl: 'https://cdn.example.invalid/covers/drm_test_0001.jpg',
    category: 'REVENGE',
    tags: ['revenge', 'billionaire'],
    totalEpisodes: 80,
    freeEpisodes: 3,
    isCompleted: true,
    stat: { playCount: 1_200_000, favoriteCount: 43_000, score: 88 },
    ...overrides,
  };
}

export function dramaDetail(overrides: Partial<DramaDetail> = {}): DramaDetail {
  return {
    ...dramaSummary(),
    description: 'She left with nothing. She came back owning the building.',
    horizontalCoverUrl: null,
    seasons: [{ id: 'sea_test_0001', seasonNumber: 1, title: null, episodeCount: 80 }],
    viewer: null,
    ...overrides,
  };
}

export function episodeItem(overrides: Partial<EpisodeItem> = {}): EpisodeItem {
  const globalEpisodeNumber = overrides.globalEpisodeNumber ?? 1;
  return {
    id: `ep_test_${String(globalEpisodeNumber).padStart(4, '0')}`,
    dramaId: 'drm_test_0001',
    seasonId: 'sea_test_0001',
    seasonNumber: 1,
    episodeNumber: globalEpisodeNumber,
    globalEpisodeNumber,
    title: null,
    durationSec: 95,
    unlockPolicy: 'FREE',
    priceCoins: null,
    viewerAccess: viewerAccess('FREE'),
    ...overrides,
  };
}

/** A locked episode, priced, exactly as the server reports one outside the free window. */
export function lockedEpisodeItem(overrides: Partial<EpisodeItem> = {}): EpisodeItem {
  return episodeItem({
    globalEpisodeNumber: 4,
    unlockPolicy: 'COIN',
    priceCoins: 30,
    viewerAccess: viewerAccess('NEED_UNLOCK'),
    ...overrides,
  });
}

export function feedCard(overrides: Partial<FeedCard> = {}): FeedCard {
  return {
    cardType: 'DRAMA',
    drama: dramaSummary(),
    continueEpisode: null,
    recReason: 'Trending now',
    trackingId: 'trk_0000000000000001',
    ...overrides,
  };
}

export function continueWatchingCard(overrides: Partial<FeedCard> = {}): FeedCard {
  return feedCard({
    cardType: 'CONTINUE_WATCHING',
    continueEpisode: { episodeId: 'ep_test_0007', globalEpisodeNumber: 7, positionSec: 42 },
    recReason: 'Continue watching',
    ...overrides,
  });
}

export function page<T>(items: readonly T[], nextCursor: string | null = null): Page<T> {
  return { items, pageInfo: { nextCursor, hasMore: nextCursor !== null } };
}

export interface StubCatalogApiScript {
  readonly feed?: (request: FeedRequest, callIndex: number) => Result<Page<FeedCard>, ApiFailure>;
  readonly drama?: (dramaId: string, callIndex: number) => Result<DramaDetail, ApiFailure>;
  readonly episodes?: (
    request: EpisodesRequest,
    callIndex: number,
  ) => Result<Page<EpisodeItem>, ApiFailure>;
}

export interface StubCatalogApi extends CatalogApi {
  readonly feedCalls: readonly FeedRequest[];
  readonly dramaCalls: readonly string[];
  readonly episodeCalls: readonly EpisodesRequest[];
}

/** The failure a stub hands back when a test did not script that endpoint at all. */
const UNSCRIPTED = apiFailure({
  kind: 'MALFORMED',
  message: 'the stub has no script for this call',
});

export function stubCatalogApi(script: StubCatalogApiScript = {}): StubCatalogApi {
  const feedCalls: FeedRequest[] = [];
  const dramaCalls: string[] = [];
  const episodeCalls: EpisodesRequest[] = [];

  return {
    feedCalls,
    dramaCalls,
    episodeCalls,

    fetchFeed: (request) => {
      const index = feedCalls.length;
      feedCalls.push(request);
      return Promise.resolve(script.feed?.(request, index) ?? ok(page<FeedCard>([])));
    },

    fetchDrama: (dramaId) => {
      const index = dramaCalls.length;
      dramaCalls.push(dramaId);
      return Promise.resolve(script.drama?.(dramaId, index) ?? err(UNSCRIPTED));
    },

    fetchEpisodes: (request) => {
      const index = episodeCalls.length;
      episodeCalls.push(request);
      return Promise.resolve(script.episodes?.(request, index) ?? ok(page<EpisodeItem>([])));
    },
  };
}

/** `{ kind: 'HTTP', status }` with the envelope fields a surface renders. */
export function httpFailure(status: number, traceId = 'trace_0001'): ApiFailure {
  return apiFailure({ kind: 'HTTP', status, message: `HTTP ${String(status)}`, traceId });
}

export function offlineFailure(): ApiFailure {
  return apiFailure({ kind: 'OFFLINE', message: 'the network is unavailable' });
}
