import { describe, expect, it } from 'vitest';

import { isListed, isWithinFreeWindow, positionEpisodes } from './numbering.js';
import type { EpisodeRecord, PublicationStatus, SeasonRecord } from './types.js';

const DRAMA_ID = 'drm_test';

function season(seasonNumber: number, status: PublicationStatus = 'PUBLISHED'): SeasonRecord {
  return {
    id: `ssn_test_s${String(seasonNumber)}`,
    dramaId: DRAMA_ID,
    seasonNumber,
    title: null,
    status,
  };
}

function episode(
  seasonNumber: number,
  episodeNumber: number,
  status: PublicationStatus = 'PUBLISHED',
): EpisodeRecord {
  return {
    id: `ep_test_s${String(seasonNumber)}e${String(episodeNumber)}`,
    dramaId: DRAMA_ID,
    seasonId: `ssn_test_s${String(seasonNumber)}`,
    episodeNumber,
    title: null,
    durationSec: 90,
    unlockPolicy: 'COIN_OR_VIP',
    priceCoins: 60,
    status,
  };
}

describe('positionEpisodes', () => {
  it('numbers across seasons, not within them', () => {
    const positioned = positionEpisodes(
      [season(1), season(2)],
      [episode(1, 1), episode(1, 2), episode(2, 1), episode(2, 2)],
    );

    expect(
      positioned.map((entry) => [entry.episode.id, entry.globalEpisodeNumber] as const),
    ).toEqual([
      ['ep_test_s1e1', 1],
      ['ep_test_s1e2', 2],
      ['ep_test_s2e1', 3],
      ['ep_test_s2e2', 4],
    ]);
  });

  it('keeps the per-season number alongside the global one rather than replacing it', () => {
    const positioned = positionEpisodes([season(1), season(2)], [episode(1, 1), episode(2, 1)]);
    const secondSeasonOpener = positioned[1];

    expect(secondSeasonOpener?.episode.episodeNumber).toBe(1);
    expect(secondSeasonOpener?.globalEpisodeNumber).toBe(2);
    expect(secondSeasonOpener?.seasonNumber).toBe(2);
  });

  it('orders by season first even when the input is shuffled', () => {
    const positioned = positionEpisodes(
      [season(2), season(1)],
      [episode(2, 2), episode(1, 2), episode(2, 1), episode(1, 1)],
    );

    expect(positioned.map((entry) => entry.episode.id)).toEqual([
      'ep_test_s1e1',
      'ep_test_s1e2',
      'ep_test_s2e1',
      'ep_test_s2e2',
    ]);
  });

  it('does not number drafts, so an unreleased episode cannot displace a published one', () => {
    const positioned = positionEpisodes(
      [season(1)],
      [episode(1, 1), episode(1, 2, 'DRAFT'), episode(1, 3)],
    );

    expect(positioned.map((entry) => [entry.episode.id, entry.globalEpisodeNumber])).toEqual([
      ['ep_test_s1e1', 1],
      ['ep_test_s1e3', 2],
    ]);
  });

  it('does not number a draft season', () => {
    const positioned = positionEpisodes(
      [season(1), season(2, 'DRAFT')],
      [episode(1, 1), episode(2, 1)],
    );

    expect(positioned).toHaveLength(1);
  });

  // Renumbering after a takedown would make "episode 2" a different episode tomorrow, which breaks
  // deep links, saved progress and the free window in one move.
  it('keeps numbers stable when an episode goes offline', () => {
    const published = positionEpisodes([season(1)], [episode(1, 1), episode(1, 2), episode(1, 3)]);
    const withdrawn = positionEpisodes(
      [season(1)],
      [episode(1, 1), episode(1, 2, 'OFFLINE'), episode(1, 3)],
    );

    expect(withdrawn.map((entry) => entry.globalEpisodeNumber)).toEqual(
      published.map((entry) => entry.globalEpisodeNumber),
    );
  });

  it('keeps the numbers of an offline season reserved for the seasons after it', () => {
    const positioned = positionEpisodes(
      [season(1), season(2, 'OFFLINE'), season(3)],
      [episode(1, 1), episode(2, 1), episode(3, 1)],
    );

    expect(positioned.find((entry) => entry.seasonNumber === 3)?.globalEpisodeNumber).toBe(3);
  });

  it('drops episodes whose season is unknown rather than numbering them at the end', () => {
    const orphan: EpisodeRecord = { ...episode(1, 1), seasonId: 'ssn_missing' };
    expect(positionEpisodes([season(1)], [orphan])).toEqual([]);
  });
});

describe('isListed', () => {
  it('lists an offline episode so the grid does not renumber itself', () => {
    const positioned = positionEpisodes([season(1)], [episode(1, 1, 'OFFLINE')]);
    expect(positioned.map(isListed)).toEqual([true]);
  });

  it('hides the episodes of an offline season, which is pulled as a unit', () => {
    const positioned = positionEpisodes([season(1, 'OFFLINE')], [episode(1, 1)]);
    expect(positioned.map(isListed)).toEqual([false]);
  });
});

describe('isWithinFreeWindow', () => {
  it('is inclusive of the last free episode and exclusive of the next one', () => {
    expect(isWithinFreeWindow(3, 3)).toBe(true);
    expect(isWithinFreeWindow(4, 3)).toBe(false);
  });

  it('gives nothing away when the window is zero', () => {
    expect(isWithinFreeWindow(1, 0)).toBe(false);
  });
});
