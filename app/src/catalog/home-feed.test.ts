import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { continueWatchingCard, dramaSummary, feedCard } from '../testing/catalog-fixtures';
import { isContinueWatchingRailCard, splitHomeFeed } from './home-feed';

describe('splitHomeFeed', () => {
  it('puts server continue-watching cards on the rail and leaves the rest as the mix', () => {
    const resume = continueWatchingCard({ drama: dramaSummary({ id: 'drm_resume' }) });
    const trending = feedCard({ drama: dramaSummary({ id: 'drm_hot' }) });
    const rails = splitHomeFeed([resume, trending]);

    expect(rails.continueWatching).toEqual([resume]);
    expect(rails.mix).toEqual([trending]);
  });

  it('keeps the server order on each side of the split', () => {
    const first = continueWatchingCard({
      drama: dramaSummary({ id: 'drm_a' }),
      continueEpisode: { episodeId: 'ep_a', globalEpisodeNumber: 2, positionSec: 10 },
    });
    const second = continueWatchingCard({
      drama: dramaSummary({ id: 'drm_b' }),
      continueEpisode: { episodeId: 'ep_b', globalEpisodeNumber: 4, positionSec: 20 },
    });
    const hot = feedCard({ drama: dramaSummary({ id: 'drm_hot' }) });
    const fresh = feedCard({ drama: dramaSummary({ id: 'drm_new' }) });

    expect(splitHomeFeed([first, hot, second, fresh])).toEqual({
      continueWatching: [first, second],
      mix: [hot, fresh],
    });
  });

  // Anonymous and empty-progress responses are the catalogue mix. Inventing a rail from those
  // cards would be a second list the server did not send.
  it('leaves an all-DRAMA mix without a rail', () => {
    const mix = [feedCard({ drama: dramaSummary({ id: 'drm_1' }) })];
    expect(splitHomeFeed(mix)).toEqual({ continueWatching: [], mix });
  });

  it('is empty when the feed is empty', () => {
    expect(splitHomeFeed([])).toEqual({ continueWatching: [], mix: [] });
  });

  it('does not put a continue card on the rail when the episode section is missing', () => {
    const broken = continueWatchingCard({
      drama: dramaSummary({ id: 'drm_broken' }),
      continueEpisode: null,
    });
    const mixCard = feedCard({ drama: dramaSummary({ id: 'drm_mix' }) });

    expect(isContinueWatchingRailCard(broken)).toBe(false);
    expect(splitHomeFeed([broken, mixCard])).toEqual({
      continueWatching: [],
      mix: [broken, mixCard],
    });
  });
});

describe('HomePage source', () => {
  // The rail is a projection of the feed mix. A second guessed list (history, progress, a client
  // scan of the catalogue) is how an anonymous viewer would see someone else's resume, or a
  // signed-in viewer would see a rail the server had already dropped.
  it('does not import history or progress as a second continue-watching source', () => {
    const source = readFileSync(new URL('../routes/HomePage.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/history-api|progress-api|fetchWatchHistory|lastWatched/);
  });
});
