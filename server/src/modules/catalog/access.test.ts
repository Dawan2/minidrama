import { describe, expect, it } from 'vitest';
import type { UnlockMethod, UnlockPolicy } from '@minidrama/shared';

import { computeViewerAccess, effectivePriceCoins, effectiveUnlockPolicy } from './access.js';
import { ANONYMOUS_VIEWER } from './viewer.js';
import type { DramaRecord, PositionedEpisode, PublicationStatus } from './types.js';
import type { Viewer } from './viewer.js';

function drama(overrides: Partial<DramaRecord> = {}): DramaRecord {
  return {
    id: 'drm_test',
    title: 'Test',
    description: '',
    coverUrl: 'https://cdn.example.invalid/covers/test.jpg',
    horizontalCoverUrl: null,
    category: 'OTHER',
    tags: [],
    status: 'PUBLISHED',
    totalSeasons: 1,
    totalEpisodes: 10,
    freeEpisodes: 3,
    isCompleted: false,
    releaseAt: '2026-01-01T00:00:00.000Z',
    stat: { playCount: 0, favoriteCount: 0, score: 0 },
    ...overrides,
  };
}

function positioned(options: {
  globalEpisodeNumber: number;
  unlockPolicy?: UnlockPolicy;
  priceCoins?: number | null;
  status?: PublicationStatus;
  seasonStatus?: PublicationStatus;
}): PositionedEpisode {
  return {
    episode: {
      id: `ep_test_${String(options.globalEpisodeNumber)}`,
      dramaId: 'drm_test',
      seasonId: 'ssn_test',
      episodeNumber: options.globalEpisodeNumber,
      title: null,
      durationSec: 90,
      unlockPolicy: options.unlockPolicy ?? 'COIN_OR_VIP',
      priceCoins: options.priceCoins === undefined ? 60 : options.priceCoins,
      status: options.status ?? 'PUBLISHED',
    },
    seasonNumber: 1,
    seasonStatus: options.seasonStatus ?? 'PUBLISHED',
    globalEpisodeNumber: options.globalEpisodeNumber,
  };
}

function viewer(overrides: Partial<Viewer> = {}): Viewer {
  return { userId: 'usr_test', vip: false, unlocks: new Map(), ...overrides };
}

function unlocked(episodeId: string, method: UnlockMethod = 'COIN'): Viewer {
  return viewer({ unlocks: new Map<string, UnlockMethod>([[episodeId, method]]) });
}

describe('effectiveUnlockPolicy', () => {
  it('makes the free window free regardless of the stored policy', () => {
    expect(effectiveUnlockPolicy(positioned({ globalEpisodeNumber: 3 }), drama())).toBe('FREE');
    expect(effectiveUnlockPolicy(positioned({ globalEpisodeNumber: 4 }), drama())).toBe(
      'COIN_OR_VIP',
    );
  });

  it('honours an episode marked FREE past the window', () => {
    const episode = positioned({ globalEpisodeNumber: 9, unlockPolicy: 'FREE', priceCoins: null });
    expect(effectiveUnlockPolicy(episode, drama())).toBe('FREE');
  });

  it('does not turn a VIP_ONLY episode inside the window into a paid one', () => {
    const episode = positioned({ globalEpisodeNumber: 2, unlockPolicy: 'VIP_ONLY' });
    expect(effectiveUnlockPolicy(episode, drama())).toBe('FREE');
  });
});

describe('effectivePriceCoins', () => {
  it('reports no price for anything the free window covers', () => {
    expect(effectivePriceCoins(positioned({ globalEpisodeNumber: 1 }), drama())).toBeNull();
  });

  it('reports no price for an episode coins cannot buy', () => {
    const vipOnly = positioned({ globalEpisodeNumber: 9, unlockPolicy: 'VIP_ONLY' });
    expect(effectivePriceCoins(vipOnly, drama())).toBeNull();
  });

  it('reports the price for a coin-unlockable episode', () => {
    expect(effectivePriceCoins(positioned({ globalEpisodeNumber: 9 }), drama())).toBe(60);
  });
});

describe('computeViewerAccess', () => {
  it('lets an anonymous viewer play the free window', () => {
    expect(
      computeViewerAccess(positioned({ globalEpisodeNumber: 1 }), drama(), ANONYMOUS_VIEWER),
    ).toEqual({ playable: true, reason: 'FREE', unlockedBy: null });
  });

  it('treats an anonymous viewer as an ordinary unentitled one past the window', () => {
    expect(
      computeViewerAccess(positioned({ globalEpisodeNumber: 4 }), drama(), ANONYMOUS_VIEWER),
    ).toEqual({ playable: false, reason: 'NEED_UNLOCK', unlockedBy: null });
  });

  it('reports the unlock method for an owned episode', () => {
    const episode = positioned({ globalEpisodeNumber: 4 });
    expect(computeViewerAccess(episode, drama(), unlocked(episode.episode.id, 'AD'))).toEqual({
      playable: true,
      reason: 'UNLOCKED',
      unlockedBy: 'AD',
    });
  });

  // The entitlement is permanent and the subscription is not. Reporting VIP would make the client
  // hide the owned state and offer the episode for sale again the day the subscription lapses.
  it('reports UNLOCKED rather than VIP for a subscriber who already owns the episode', () => {
    const episode = positioned({ globalEpisodeNumber: 4 });
    const subscriber: Viewer = {
      ...unlocked(episode.episode.id),
      vip: true,
    };

    expect(computeViewerAccess(episode, drama(), subscriber).reason).toBe('UNLOCKED');
  });

  it('lets VIP through COIN_OR_VIP and VIP_ONLY', () => {
    const subscriber = viewer({ vip: true });

    expect(
      computeViewerAccess(positioned({ globalEpisodeNumber: 4 }), drama(), subscriber),
    ).toEqual({ playable: true, reason: 'VIP', unlockedBy: null });
    expect(
      computeViewerAccess(
        positioned({ globalEpisodeNumber: 4, unlockPolicy: 'VIP_ONLY' }),
        drama(),
        subscriber,
      ).reason,
    ).toBe('VIP');
  });

  // COIN means coins, and a subscription is not coins. Letting VIP through here would give away
  // every episode content operations deliberately kept outside the subscription.
  it('does not let VIP through a COIN-only episode', () => {
    const episode = positioned({ globalEpisodeNumber: 4, unlockPolicy: 'COIN' });
    expect(computeViewerAccess(episode, drama(), viewer({ vip: true })).reason).toBe('NEED_UNLOCK');
  });

  it('denies a non-subscriber a VIP_ONLY episode without offering an unlock', () => {
    const episode = positioned({ globalEpisodeNumber: 4, unlockPolicy: 'VIP_ONLY' });
    expect(computeViewerAccess(episode, drama(), viewer())).toEqual({
      playable: false,
      reason: 'NEED_VIP',
      unlockedBy: null,
    });
  });

  it.each([
    ['the episode is offline', { status: 'OFFLINE' as const }],
    ['its season is offline', { seasonStatus: 'OFFLINE' as const }],
    ['the episode is a draft', { status: 'DRAFT' as const }],
  ])('reports UNAVAILABLE when %s', (_label, overrides) => {
    const episode = positioned({ globalEpisodeNumber: 1, ...overrides });
    expect(computeViewerAccess(episode, drama(), ANONYMOUS_VIEWER)).toEqual({
      playable: false,
      reason: 'UNAVAILABLE',
      unlockedBy: null,
    });
  });

  it('reports UNAVAILABLE when the drama is offline, whatever the viewer owns', () => {
    const episode = positioned({ globalEpisodeNumber: 4 });
    const owner: Viewer = { ...unlocked(episode.episode.id), vip: true };

    expect(computeViewerAccess(episode, drama({ status: 'OFFLINE' }), owner).reason).toBe(
      'UNAVAILABLE',
    );
  });

  // An unavailable episode is not a conversion opportunity: offering an unlock would sell access to
  // something that still would not play.
  it('never reports an unavailable episode as playable or purchasable', () => {
    const episode = positioned({ globalEpisodeNumber: 4, status: 'OFFLINE' });
    const access = computeViewerAccess(episode, drama(), viewer({ vip: true }));

    expect(access.playable).toBe(false);
    expect(access.reason).not.toBe('NEED_UNLOCK');
    expect(access.reason).not.toBe('NEED_VIP');
  });

  it('marks playable exactly for the reasons that mean playable', () => {
    const cases: readonly [PositionedEpisode, Viewer][] = [
      [positioned({ globalEpisodeNumber: 1 }), ANONYMOUS_VIEWER],
      [positioned({ globalEpisodeNumber: 4 }), viewer({ vip: true })],
      [positioned({ globalEpisodeNumber: 4 }), unlocked('ep_test_4')],
      [positioned({ globalEpisodeNumber: 4 }), ANONYMOUS_VIEWER],
      [positioned({ globalEpisodeNumber: 4, unlockPolicy: 'VIP_ONLY' }), ANONYMOUS_VIEWER],
      [positioned({ globalEpisodeNumber: 4, status: 'OFFLINE' }), ANONYMOUS_VIEWER],
    ];

    for (const [episode, who] of cases) {
      const access = computeViewerAccess(episode, drama(), who);
      const playableReasons = ['FREE', 'UNLOCKED', 'VIP'];
      expect(access.playable).toBe(playableReasons.includes(access.reason));
    }
  });

  it('reports unlockedBy only for an owned episode', () => {
    const free = computeViewerAccess(
      positioned({ globalEpisodeNumber: 1 }),
      drama(),
      unlocked('ep_test_1'),
    );
    expect(free.reason).toBe('FREE');
    expect(free.unlockedBy).toBeNull();
  });
});
