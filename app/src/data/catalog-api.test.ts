import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';

import { FEED_PATH, DRAMAS_PATH, createCatalogApi, dramaEndpoint, episodeEndpoint, episodesEndpoint } from './catalog-api';
import { apiFailure } from './failure';
import {
  dramaDetail,
  dramaSummary,
  episodeItem,
  feedCard,
  page,
  viewerAccess,
} from '../testing/catalog-fixtures';
import type { HttpReader } from './http';

function httpStub(body: unknown): HttpReader {
  return { getJson: () => Promise.resolve(ok(body)) };
}

describe('catalogue endpoints', () => {
  it('publishes the paths the server registered', () => {
    expect(FEED_PATH).toBe('/v1/recommendations/feed');
    expect(DRAMAS_PATH).toBe('/v1/dramas');
    expect(dramaEndpoint('drm_1')).toBe('/v1/dramas/drm_1');
    expect(episodesEndpoint('drm_1')).toBe('/v1/dramas/drm_1/episodes');
    expect(episodeEndpoint('ep_1')).toBe('/v1/episodes/ep_1');
  });

  // An id reaches the client from a deep link and is entirely untrusted. Interpolated raw, a slash
  // in it silently addresses a different endpoint.
  it('escapes a drama id that would otherwise change the path', () => {
    expect(dramaEndpoint('drm/1?x=2')).toBe('/v1/dramas/drm%2F1%3Fx%3D2');
    expect(episodeEndpoint('ep/1?x=2')).toBe('/v1/episodes/ep%2F1%3Fx%3D2');
  });
});

describe('the catalogue client', () => {
  it('requests the feed with its scene and cursor', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(page([]))));
    await createCatalogApi({ getJson }).fetchFeed({ scene: 'HOME', cursor: 'cur_2', limit: 10 });

    expect(getJson).toHaveBeenCalledWith(FEED_PATH, {
      scene: 'HOME',
      cursor: 'cur_2',
      limit: 10,
    });
  });

  it('requests the published catalogue with the filters the browse route carries', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(page([]))));
    await createCatalogApi({ getJson }).fetchDramas({
      category: 'REVENGE',
      tag: 'ceo',
      sort: 'NEW',
      cursor: 'cur_3',
    });

    expect(getJson).toHaveBeenCalledWith(DRAMAS_PATH, {
      category: 'REVENGE',
      tag: 'ceo',
      sort: 'NEW',
      cursor: 'cur_3',
      limit: undefined,
    });
  });

  it('requests an episode list with its season filter and cursor', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(page([]))));
    await createCatalogApi({ getJson }).fetchEpisodes({
      dramaId: 'drm_1',
      seasonNumber: 2,
      cursor: 'cur_5',
    });

    expect(getJson).toHaveBeenCalledWith('/v1/dramas/drm_1/episodes', {
      seasonNumber: 2,
      cursor: 'cur_5',
      limit: undefined,
    });
  });

  it('looks an episode up by the id the player route carries', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok(episodeItem())));
    await createCatalogApi({ getJson }).fetchEpisode('ep_1');

    expect(getJson).toHaveBeenCalledWith('/v1/episodes/ep_1');
  });

  it('passes a transport failure through untouched', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 410, message: 'gone' });
    const api = createCatalogApi({ getJson: () => Promise.resolve({ ok: false, error: failure }) });

    const result = await api.fetchDrama('drm_1');
    expect(result).toEqual({ ok: false, error: failure });
  });

  it('returns a page with its cursor', async () => {
    const api = createCatalogApi(httpStub(page([feedCard()], 'cur_next')));
    const result = await api.fetchFeed({ scene: 'HOME' });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.pageInfo : null).toEqual({
      nextCursor: 'cur_next',
      hasMore: true,
    });
  });

  it('accepts a drama detail and an episode list in the documented shape', async () => {
    const api = createCatalogApi(httpStub(dramaDetail()));
    const detail = await api.fetchDrama('drm_test_0001');
    expect(detail.ok ? detail.value.title : null).toBe('The Heiress Returns');

    const episodes = createCatalogApi(httpStub(page([episodeItem()])));
    const listed = await episodes.fetchEpisodes({ dramaId: 'drm_test_0001' });
    expect(listed.ok ? listed.value.items.length : null).toBe(1);

    const one = createCatalogApi(httpStub(episodeItem({ title: 'The return' })));
    const lookedUp = await one.fetchEpisode('ep_test_0001');
    expect(lookedUp.ok ? lookedUp.value.title : null).toBe('The return');

    const listedDramas = createCatalogApi(httpStub(page([dramaSummary()])));
    const browse = await listedDramas.fetchDramas({ sort: 'HOT' });
    expect(browse.ok ? browse.value.items[0]?.id : null).toBe('drm_test_0001');
  });
});

/**
 * A 200 whose body is not the documented shape has to be caught here. Caught at the point of use it
 * is a component reading `.map` off `undefined`, which takes the whole screen down instead of one
 * section, and does it in a place with no error copy and no retry.
 */
describe('response narrowing', () => {
  it('rejects a body that is not a page', async () => {
    for (const body of [null, [], {}, { items: {} }, { items: [], pageInfo: {} }]) {
      const result = await createCatalogApi(httpStub(body)).fetchFeed({ scene: 'HOME' });
      expect(result.ok, JSON.stringify(body)).toBe(false);
      expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
    }
  });

  it('accepts a page whose cursor is null and rejects one whose cursor is a number', async () => {
    const good = await createCatalogApi(
      httpStub({ items: [], pageInfo: { nextCursor: null, hasMore: false } }),
    ).fetchFeed({ scene: 'HOME' });
    expect(good.ok).toBe(true);

    const bad = await createCatalogApi(
      httpStub({ items: [], pageInfo: { nextCursor: 12, hasMore: false } }),
    ).fetchFeed({ scene: 'HOME' });
    expect(bad.ok).toBe(false);
  });

  // The one field standing between a locked episode and a play button. Defaulting a missing
  // `viewerAccess` to anything at all would be inventing an entitlement decision on the client.
  it('rejects an episode with no viewerAccess rather than defaulting one', async () => {
    const { viewerAccess: _dropped, ...withoutAccess } = episodeItem();
    const result = await createCatalogApi(httpStub(page([withoutAccess]))).fetchEpisodes({
      dramaId: 'drm_1',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  it('rejects an episode whose viewerAccess is not the documented shape', async () => {
    for (const access of [null, {}, { playable: 'yes', reason: 'FREE' }, { playable: true }]) {
      const result = await createCatalogApi(
        httpStub(page([{ ...episodeItem(), viewerAccess: access }])),
      ).fetchEpisodes({ dramaId: 'drm_1' });
      expect(result.ok, JSON.stringify(access)).toBe(false);
    }
  });

  it('rejects an episode with no id or no global number', async () => {
    const { id: _id, ...withoutId } = episodeItem();
    const withoutNumber = { ...episodeItem(), globalEpisodeNumber: '4' };

    for (const item of [withoutId, withoutNumber]) {
      const result = await createCatalogApi(httpStub(page([item]))).fetchEpisodes({
        dramaId: 'drm_1',
      });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a drama detail missing the fields the header renders', async () => {
    const { description: _description, ...withoutDescription } = dramaDetail();
    const { seasons: _seasons, ...withoutSeasons } = dramaDetail();

    for (const body of [withoutDescription, withoutSeasons, { id: 'drm_1' }]) {
      const result = await createCatalogApi(httpStub(body)).fetchDrama('drm_1');
      expect(result.ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('rejects a feed card with an unknown card type or no tracking id', async () => {
    const unknownType = { ...feedCard(), cardType: 'PROMO' };
    const { trackingId: _trackingId, ...withoutTracking } = feedCard();

    for (const card of [unknownType, withoutTracking]) {
      const result = await createCatalogApi(httpStub(page([card]))).fetchFeed({ scene: 'HOME' });
      expect(result.ok).toBe(false);
    }
  });

  // A resume card is a one-tap promise. Without its episode it is a tap with nowhere to go.
  it('rejects a continue-watching card with no episode', async () => {
    const card = { ...feedCard(), cardType: 'CONTINUE_WATCHING', continueEpisode: null };
    const result = await createCatalogApi(httpStub(page([card]))).fetchFeed({ scene: 'HOME' });
    expect(result.ok).toBe(false);
  });

  it('rejects a page where only one item is malformed', async () => {
    const result = await createCatalogApi(
      httpStub(page([episodeItem(), { ...episodeItem({ globalEpisodeNumber: 2 }), id: 7 }])),
    ).fetchEpisodes({ dramaId: 'drm_1' });

    expect(result.ok).toBe(false);
  });

  it('rejects a browse page whose summary is missing the fields a card needs', async () => {
    const { title: _title, ...withoutTitle } = dramaSummary();
    const result = await createCatalogApi(httpStub(page([withoutTitle]))).fetchDramas({
      sort: 'HOT',
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  it('keeps every access reason the contract publishes', async () => {
    for (const reason of [
      'FREE',
      'UNLOCKED',
      'VIP',
      'NEED_UNLOCK',
      'NEED_VIP',
      'UNAVAILABLE',
    ] as const) {
      const item = episodeItem({ viewerAccess: viewerAccess(reason) });
      const result = await createCatalogApi(httpStub(page([item]))).fetchEpisodes({
        dramaId: 'drm_1',
      });
      expect(result.ok, reason).toBe(true);
      expect(result.ok ? result.value.items[0]?.viewerAccess.reason : null).toBe(reason);
    }
  });

  it('rejects a single-episode body with no viewerAccess rather than defaulting one', async () => {
    const { viewerAccess: _dropped, ...withoutAccess } = episodeItem();
    const result = await createCatalogApi(httpStub(withoutAccess)).fetchEpisode('ep_1');

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });
});
