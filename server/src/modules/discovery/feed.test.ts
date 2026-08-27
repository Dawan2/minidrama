import { describe, expect, it } from 'vitest';

import { ANONYMOUS_VIEWER } from '../catalog/viewer.js';
import { composeFeed, createEmptyContinueWatchingSource } from './feed.js';
import type { DramaRecord } from '../catalog/types.js';
import type { ResolvedContinueEntry } from './feed.js';

function drama(id: string): DramaRecord {
  return {
    id,
    title: id,
    description: '',
    coverUrl: `https://cdn.example.invalid/covers/${id}.jpg`,
    horizontalCoverUrl: null,
    category: 'OTHER',
    tags: [],
    status: 'PUBLISHED',
    totalSeasons: 1,
    totalEpisodes: 4,
    freeEpisodes: 2,
    isCompleted: false,
    releaseAt: '2026-01-01T00:00:00.000Z',
    stat: { playCount: 0, favoriteCount: 0, score: 0 },
  };
}

const a = drama('drm_a');
const b = drama('drm_b');
const c = drama('drm_c');

function continueEntry(target: DramaRecord): ResolvedContinueEntry {
  return {
    drama: target,
    episodeId: `ep_${target.id}_03`,
    globalEpisodeNumber: 3,
    positionSec: 45,
  };
}

describe('composeFeed', () => {
  it('puts continue watching first on the home scene', () => {
    const feed = composeFeed({
      scene: 'HOME',
      hot: [a, b, c],
      recent: [c, b, a],
      continueWatching: [continueEntry(c)],
    });

    expect(feed[0]?.cardType).toBe('CONTINUE_WATCHING');
    expect(feed[0]?.drama.id).toBe('drm_c');
    expect(feed[0]?.continueEpisode).toEqual({
      episodeId: 'ep_drm_c_03',
      globalEpisodeNumber: 3,
      positionSec: 45,
    });
  });

  // The player scene sits next to something already playing.
  it('offers no continue-watching card on the player scene', () => {
    const feed = composeFeed({
      scene: 'PLAYER',
      hot: [a, b],
      recent: [b, a],
      continueWatching: [continueEntry(a)],
    });

    expect(feed.every((entry) => entry.cardType === 'DRAMA')).toBe(true);
  });

  // A duplicate card double-counts the impression and reads as a bug to the viewer.
  it('shows a drama at most once, whichever rule reached it first', () => {
    const feed = composeFeed({
      scene: 'HOME',
      hot: [a, b, c],
      recent: [c, b, a],
      continueWatching: [continueEntry(b)],
    });
    const ids = feed.map((entry) => entry.drama.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['drm_b', 'drm_a', 'drm_c']);
  });

  it('deduplicates repeated continue-watching entries for one drama', () => {
    const feed = composeFeed({
      scene: 'HOME',
      hot: [],
      recent: [],
      continueWatching: [continueEntry(a), continueEntry(a)],
    });

    expect(feed).toHaveLength(1);
  });

  /**
   * Concatenating the popular list ahead of the new one gives the tail of the popular list priority
   * over the newest drama in the catalogue, which is how a new release never gets an impression.
   */
  it('alternates popular and new rather than exhausting one first', () => {
    const feed = composeFeed({
      scene: 'HOME',
      hot: [a, b, c],
      recent: [c, b, a],
      continueWatching: [],
    });

    expect(feed.map((entry) => entry.drama.id)).toEqual(['drm_a', 'drm_c', 'drm_b']);
    expect(feed.map((entry) => entry.recReason)).toEqual([
      'Trending now',
      'Just added',
      'Trending now',
    ]);
  });

  it('ranks contiguously from one so a cursor key is dense', () => {
    const feed = composeFeed({
      scene: 'HOME',
      hot: [a, b, c],
      recent: [c, b, a],
      continueWatching: [continueEntry(b)],
    });

    expect(feed.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('carries no continueEpisode on an ordinary card', () => {
    const feed = composeFeed({ scene: 'HOME', hot: [a], recent: [a], continueWatching: [] });

    expect(feed[0]).toMatchObject({ cardType: 'DRAMA', continueEpisode: null });
  });

  it('produces the same order for the same catalogue every time it is asked', () => {
    const input = {
      scene: 'HOME' as const,
      hot: [a, b, c],
      recent: [c, b, a],
      continueWatching: [],
    };
    expect(composeFeed(input)).toEqual(composeFeed(input));
  });

  it('degrades to an empty feed rather than failing when there is nothing to show', () => {
    expect(composeFeed({ scene: 'HOME', hot: [], recent: [], continueWatching: [] })).toEqual([]);
  });
});

describe('the default continue-watching source', () => {
  it('is empty, because the progress module does not exist yet', async () => {
    const source = createEmptyContinueWatchingSource();
    expect(await source.forViewer(ANONYMOUS_VIEWER)).toEqual([]);
  });
});
