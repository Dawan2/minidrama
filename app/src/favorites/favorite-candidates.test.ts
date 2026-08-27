import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';

import {
  FAVORITE_CANDIDATE_LIMIT,
  distinctDramas,
  feedCandidateSource,
} from './favorite-candidates';
import {
  continueWatchingCard,
  dramaSummary,
  feedCard,
  offlineFailure,
  page,
  stubCatalogApi,
} from '../testing/catalog-fixtures';

describe('the dramas of a feed page', () => {
  it('keeps the feed’s order', () => {
    const dramas = distinctDramas([
      feedCard({ drama: dramaSummary({ id: 'drm_2' }) }),
      feedCard({ drama: dramaSummary({ id: 'drm_1' }) }),
    ]);

    expect(dramas.map((drama) => drama.id)).toEqual(['drm_2', 'drm_1']);
  });

  /**
   * A `CONTINUE_WATCHING` card and a `DRAMA` card are two cards about one drama. Each duplicate
   * would otherwise become a second request for a row that can appear only once.
   */
  it('asks about a drama once even when the page carries two cards for it', () => {
    const dramas = distinctDramas([
      continueWatchingCard({ drama: dramaSummary({ id: 'drm_1' }) }),
      feedCard({ drama: dramaSummary({ id: 'drm_1' }) }),
      feedCard({ drama: dramaSummary({ id: 'drm_2' }) }),
    ]);

    expect(dramas.map((drama) => drama.id)).toEqual(['drm_1', 'drm_2']);
  });

  it('has nothing to ask about when the feed is empty', () => {
    expect(distinctDramas([])).toEqual([]);
  });
});

describe('the feed as a candidate source', () => {
  it('asks the home scene for one bounded page', async () => {
    const api = stubCatalogApi({ feed: () => ok(page([feedCard()])) });
    await feedCandidateSource(api)();

    expect(api.feedCalls).toEqual([{ scene: 'HOME', limit: FAVORITE_CANDIDATE_LIMIT }]);
  });

  it('hands back the summaries the rows are rendered from', async () => {
    const api = stubCatalogApi({
      feed: () => ok(page([feedCard({ drama: dramaSummary({ id: 'drm_7', title: 'Seven' }) })])),
    });

    const result = await feedCandidateSource(api)();
    expect(result.ok ? result.value.map((drama) => drama.title) : null).toEqual(['Seven']);
  });

  // The screen has to be able to say "we could not assemble your list", which is a different
  // sentence from "you follow nothing".
  it('passes a failed feed straight through rather than reporting no candidates', async () => {
    const api = stubCatalogApi({ feed: () => err(offlineFailure()) });

    const result = await feedCandidateSource(api)();
    expect(result.ok).toBe(false);
  });

  it('takes a smaller page when asked, so a caller can bound the fan-out further', async () => {
    const api = stubCatalogApi({ feed: () => ok(page([])) });
    await feedCandidateSource(api, 5)();

    expect(api.feedCalls[0]?.limit).toBe(5);
  });
});
