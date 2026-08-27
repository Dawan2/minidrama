import { describe, expect, it } from 'vitest';

import { decideEpisodeAccess } from './access.js';
import type {
  DramaFacts,
  EpisodeAccessQuery,
  EpisodeFacts,
  SeasonFacts,
  UnlockFacts,
  UnlockPolicy,
  ViewerFacts,
  VipFacts,
} from './access.js';

/**
 * The decision is pure, so every case here is a complete statement of facts and a verdict. The
 * builders below exist so a test names only the fact under examination; everything unnamed is a
 * published, paid, mid-drama episode and a signed-out viewer.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function drama(overrides: Partial<DramaFacts> = {}): DramaFacts {
  return { id: 'drm_test', status: 'PUBLISHED', freeEpisodes: 5, ...overrides };
}

function season(overrides: Partial<SeasonFacts> = {}): SeasonFacts {
  return { id: 'ssn_test', status: 'PUBLISHED', ...overrides };
}

function episode(overrides: Partial<EpisodeFacts> = {}): EpisodeFacts {
  return {
    id: 'ep_test',
    status: 'PUBLISHED',
    unlockPolicy: 'COIN_OR_VIP',
    priceCoins: 300,
    episodeNumber: 12,
    globalEpisodeNumber: 12,
    ...overrides,
  };
}

function viewer(overrides: Partial<ViewerFacts> = {}): ViewerFacts {
  return { userId: 'usr_test', vip: null, unlocks: [], ...overrides };
}

function activeVip(): VipFacts {
  return { active: true, expiresAtMs: NOW + 30 * DAY };
}

/** The `usr_fx_vip_expired` shape: the stored flag still says active, the expiry has passed. */
function lapsedVip(): VipFacts {
  return { active: true, expiresAtMs: NOW - DAY };
}

function coinUnlock(episodeId = 'ep_test'): UnlockFacts {
  return { episodeId, method: 'COIN', expiresAtMs: null };
}

function query(overrides: Partial<EpisodeAccessQuery> = {}): EpisodeAccessQuery {
  return {
    drama: drama(),
    season: season(),
    episode: episode(),
    viewer: null,
    nowMs: NOW,
    ...overrides,
  };
}

describe('decideEpisodeAccess — availability', () => {
  it('reports a published episode of a published drama as decidable', () => {
    expect(decideEpisodeAccess(query()).unavailableCause).toBeNull();
  });

  it.each([
    ['drama', { drama: drama({ status: 'DRAFT' }) }],
    ['season', { season: season({ status: 'DRAFT' }) }],
    ['episode', { episode: episode({ status: 'DRAFT' }) }],
  ])('treats a draft %s as not published', (_subject, overrides) => {
    const access = decideEpisodeAccess(query(overrides));

    expect(access.playable).toBe(false);
    expect(access.reason).toBe('UNAVAILABLE');
    expect(access.unavailableCause).toBe('NOT_PUBLISHED');
  });

  it.each([
    ['drama', { drama: drama({ status: 'OFFLINE' }) }],
    ['season', { season: season({ status: 'OFFLINE' }) }],
    ['episode', { episode: episode({ status: 'OFFLINE' }) }],
  ])('treats a withdrawn %s as withdrawn', (_subject, overrides) => {
    const access = decideEpisodeAccess(query(overrides));

    expect(access.reason).toBe('UNAVAILABLE');
    expect(access.unavailableCause).toBe('WITHDRAWN');
  });

  // Wave 1 default in `docs/12-domain-model.md` §3.1: a withdrawal is not overridden by a purchase.
  it('does not let an unlock override a withdrawal', () => {
    const access = decideEpisodeAccess(
      query({
        drama: drama({ status: 'OFFLINE' }),
        viewer: viewer({ unlocks: [coinUnlock()] }),
      }),
    );

    expect(access.playable).toBe(false);
    expect(access.unavailableCause).toBe('WITHDRAWN');
  });

  it('hides a published episode sitting under a draft season', () => {
    const access = decideEpisodeAccess(
      query({ season: season({ status: 'DRAFT' }), episode: episode({ status: 'PUBLISHED' }) }),
    );

    expect(access.unavailableCause).toBe('NOT_PUBLISHED');
  });

  it.each([0, -100, 1.5, Number.NaN])(
    'refuses to quote %s coins for a paid episode',
    (priceCoins) => {
      const access = decideEpisodeAccess(query({ episode: episode({ priceCoins }) }));

      expect(access.reason).toBe('UNAVAILABLE');
      expect(access.unavailableCause).toBe('MISCONFIGURED_PRICE');
      expect(access.priceCoins).toBeNull();
    },
  );

  it('does not require a price from a VIP-only episode', () => {
    const access = decideEpisodeAccess(
      query({ episode: episode({ unlockPolicy: 'VIP_ONLY', priceCoins: 0 }) }),
    );

    expect(access.reason).toBe('NEED_VIP');
  });

  // The price is only needed to quote one, so a pricing mistake denies the sale without taking the
  // episode away from viewers who already paid for it.
  it('does not hide a broken-priced episode from a viewer who owns it', () => {
    const access = decideEpisodeAccess(
      query({
        episode: episode({ priceCoins: 0 }),
        viewer: viewer({ unlocks: [coinUnlock()] }),
      }),
    );

    expect(access).toMatchObject({ playable: true, reason: 'UNLOCKED' });
  });

  it('does not hide a broken-priced episode from an active subscriber', () => {
    const access = decideEpisodeAccess(
      query({ episode: episode({ priceCoins: 0 }), viewer: viewer({ vip: activeVip() }) }),
    );

    expect(access).toMatchObject({ playable: true, reason: 'VIP' });
  });
});

describe('decideEpisodeAccess — the free window is drama-wide (DM-1)', () => {
  it('lets a free-policy episode through wherever it sits', () => {
    const access = decideEpisodeAccess(
      query({ episode: episode({ unlockPolicy: 'FREE', globalEpisodeNumber: 99 }) }),
    );

    expect(access).toMatchObject({ playable: true, reason: 'FREE', priceCoins: null });
  });

  it('opens the first N episodes of the drama even when the episode is priced', () => {
    const access = decideEpisodeAccess(
      query({
        drama: drama({ freeEpisodes: 5 }),
        episode: episode({ episodeNumber: 5, globalEpisodeNumber: 5 }),
      }),
    );

    expect(access).toMatchObject({ playable: true, reason: 'FREE' });
  });

  it('closes the window at N', () => {
    const access = decideEpisodeAccess(
      query({
        drama: drama({ freeEpisodes: 5 }),
        episode: episode({ episodeNumber: 6, globalEpisodeNumber: 6 }),
      }),
    );

    expect(access.reason).toBe('NEED_UNLOCK');
  });

  /**
   * The defect itself. Season 2 episode 1 is episode 11 of the drama: reading the per-season number
   * would give away the first five episodes of every season instead of the first five of the drama.
   */
  it('does not reopen the window at the start of a later season', () => {
    const access = decideEpisodeAccess(
      query({
        drama: drama({ freeEpisodes: 5 }),
        episode: episode({ episodeNumber: 1, globalEpisodeNumber: 11 }),
      }),
    );

    expect(access.playable).toBe(false);
    expect(access.reason).toBe('NEED_UNLOCK');
    expect(access.priceCoins).toBe(300);
  });

  it('opens an early episode whose per-season number is past the window', () => {
    // The mirror image: a season 1 episode renumbered by a season split is still episode 3 of the
    // drama, and the drama-wide number is what the drama-level policy is about.
    const access = decideEpisodeAccess(
      query({
        drama: drama({ freeEpisodes: 5 }),
        episode: episode({ episodeNumber: 9, globalEpisodeNumber: 3 }),
      }),
    );

    expect(access.reason).toBe('FREE');
  });

  it.each([0, -1, 2.5, Number.NaN])(
    'does not fall back to the per-season number when the drama-wide number is %s',
    (globalEpisodeNumber) => {
      const access = decideEpisodeAccess(
        query({
          drama: drama({ freeEpisodes: 5 }),
          episode: episode({ episodeNumber: 1, globalEpisodeNumber }),
        }),
      );

      expect(access.reason).toBe('NEED_UNLOCK');
    },
  );

  it('treats a drama with no free window as fully paid', () => {
    const access = decideEpisodeAccess(
      query({
        drama: drama({ freeEpisodes: 0 }),
        episode: episode({ episodeNumber: 1, globalEpisodeNumber: 1 }),
      }),
    );

    expect(access.reason).toBe('NEED_UNLOCK');
  });
});

describe('decideEpisodeAccess — a purchase outranks a subscription (DM-3)', () => {
  it('reports a purchased episode as unlocked, not as VIP, while the subscription is live', () => {
    const access = decideEpisodeAccess(
      query({ viewer: viewer({ vip: activeVip(), unlocks: [coinUnlock()] }) }),
    );

    expect(access).toMatchObject({ playable: true, reason: 'UNLOCKED', unlockedBy: 'COIN' });
  });

  /** The revocation this ordering exists to prevent. */
  it('keeps a purchased episode playable after the subscription lapses', () => {
    const lapsed = viewer({ vip: lapsedVip(), unlocks: [coinUnlock()] });

    expect(decideEpisodeAccess(query({ viewer: lapsed }))).toMatchObject({
      playable: true,
      reason: 'UNLOCKED',
      unlockedBy: 'COIN',
    });
  });

  it('keeps a purchase playable across the exact moment of expiry', () => {
    const paidSubscriber = viewer({
      vip: { active: true, expiresAtMs: NOW },
      unlocks: [coinUnlock()],
    });

    const before = decideEpisodeAccess(query({ viewer: paidSubscriber, nowMs: NOW - 1 }));
    const after = decideEpisodeAccess(query({ viewer: paidSubscriber, nowMs: NOW + 1 }));

    expect(before.playable).toBe(true);
    expect(after.playable).toBe(true);
    // The subscription lapsed between the two calls and the purchase carried the episode.
    expect(before.reason).toBe('UNLOCKED');
    expect(after.reason).toBe('UNLOCKED');
  });

  it.each(['COIN', 'AD', 'GRANT'] as const)(
    'honours a %s unlock as a durable entitlement',
    (method) => {
      const access = decideEpisodeAccess(
        query({
          viewer: viewer({ unlocks: [{ episodeId: 'ep_test', method, expiresAtMs: null }] }),
        }),
      );

      expect(access).toMatchObject({ playable: true, reason: 'UNLOCKED', unlockedBy: method });
    },
  );

  /**
   * `docs/12-domain-model.md` §12 open question 3, answered: a `VIP`-method row is the receipt for a
   * view that a subscription paid for, not a purchase of the episode. Counting it would convert one
   * month of VIP into permanent access to everything watched during it.
   */
  it('does not treat a VIP viewing receipt as a purchase once the subscription lapses', () => {
    const access = decideEpisodeAccess(
      query({
        episode: episode({ unlockPolicy: 'VIP_ONLY' }),
        viewer: viewer({
          vip: lapsedVip(),
          unlocks: [{ episodeId: 'ep_test', method: 'VIP', expiresAtMs: null }],
        }),
      }),
    );

    expect(access.playable).toBe(false);
    expect(access.reason).toBe('NEED_VIP');
    expect(access.unlockedBy).toBeNull();
  });

  it('ignores an unlock belonging to another episode', () => {
    const access = decideEpisodeAccess(
      query({ viewer: viewer({ unlocks: [coinUnlock('ep_other')] }) }),
    );

    expect(access.reason).toBe('NEED_UNLOCK');
  });

  it('ignores a limited-time unlock that has expired', () => {
    const access = decideEpisodeAccess(
      query({
        viewer: viewer({
          unlocks: [{ episodeId: 'ep_test', method: 'GRANT', expiresAtMs: NOW - 1 }],
        }),
      }),
    );

    expect(access.reason).toBe('NEED_UNLOCK');
    expect(access.unlockedBy).toBeNull();
  });

  it('honours a limited-time unlock that is still running', () => {
    const access = decideEpisodeAccess(
      query({
        viewer: viewer({
          unlocks: [{ episodeId: 'ep_test', method: 'GRANT', expiresAtMs: NOW + 1 }],
        }),
      }),
    );

    expect(access).toMatchObject({ reason: 'UNLOCKED', unlockedBy: 'GRANT' });
  });
});

describe('decideEpisodeAccess — subscription state', () => {
  it('admits an active subscriber to a VIP-only episode', () => {
    const access = decideEpisodeAccess(
      query({
        episode: episode({ unlockPolicy: 'VIP_ONLY' }),
        viewer: viewer({ vip: activeVip() }),
      }),
    );

    expect(access).toMatchObject({ playable: true, reason: 'VIP', unlockedBy: 'VIP' });
  });

  it('admits an active subscriber to a COIN_OR_VIP episode without charging', () => {
    const access = decideEpisodeAccess(query({ viewer: viewer({ vip: activeVip() }) }));

    expect(access).toMatchObject({ playable: true, reason: 'VIP', priceCoins: null });
  });

  // `docs/12-domain-model.md` §3.4: a coin-only episode is not part of the VIP bundle.
  it('does not admit a subscriber to a coin-only episode', () => {
    const access = decideEpisodeAccess(
      query({
        episode: episode({ unlockPolicy: 'COIN', priceCoins: 500 }),
        viewer: viewer({ vip: activeVip() }),
      }),
    );

    expect(access).toMatchObject({
      playable: false,
      reason: 'NEED_UNLOCK',
      unlockOptions: ['COINS'],
      priceCoins: 500,
    });
  });

  it('treats a lapsed subscription as no subscription however the flag reads', () => {
    const access = decideEpisodeAccess(query({ viewer: viewer({ vip: lapsedVip() }) }));

    expect(access.playable).toBe(false);
    expect(access.reason).toBe('NEED_UNLOCK');
  });

  it('does not resurrect a cancelled subscription from a future expiry', () => {
    const access = decideEpisodeAccess(
      query({
        viewer: viewer({ vip: { active: false, expiresAtMs: NOW + 30 * DAY } }),
      }),
    );

    expect(access.reason).toBe('NEED_UNLOCK');
  });

  it('does not read a missing expiry as a lifetime subscription', () => {
    const access = decideEpisodeAccess(
      query({ viewer: viewer({ vip: { active: true, expiresAtMs: null } }) }),
    );

    expect(access.reason).toBe('NEED_UNLOCK');
  });

  it('ends the subscription at the expiry instant rather than after it', () => {
    const expiring = viewer({ vip: { active: true, expiresAtMs: NOW } });

    expect(decideEpisodeAccess(query({ viewer: expiring, nowMs: NOW - 1 })).reason).toBe('VIP');
    expect(decideEpisodeAccess(query({ viewer: expiring, nowMs: NOW })).reason).toBe('NEED_UNLOCK');
  });
});

describe('decideEpisodeAccess — denials carry what would fix them', () => {
  it.each<[UnlockPolicy, readonly string[]]>([
    ['COIN', ['COINS']],
    ['COIN_OR_VIP', ['COINS', 'VIP']],
    ['VIP_ONLY', ['VIP']],
  ])('offers %s episodes the options %j', (unlockPolicy, unlockOptions) => {
    const access = decideEpisodeAccess(
      query({ episode: episode({ unlockPolicy, priceCoins: 300 }) }),
    );

    expect(access.playable).toBe(false);
    expect(access.unlockOptions).toEqual(unlockOptions);
  });

  it('quotes a price only when paying is an option', () => {
    expect(decideEpisodeAccess(query()).priceCoins).toBe(300);
    expect(
      decideEpisodeAccess(query({ episode: episode({ unlockPolicy: 'VIP_ONLY' }) })).priceCoins,
    ).toBeNull();
  });

  it('offers nothing to buy once the episode is playable', () => {
    const access = decideEpisodeAccess(query({ viewer: viewer({ unlocks: [coinUnlock()] }) }));

    expect(access.unlockOptions).toEqual([]);
  });
});

describe('decideEpisodeAccess — anonymous viewers', () => {
  it('answers a free episode for a viewer with no session', () => {
    const access = decideEpisodeAccess(
      query({ episode: episode({ globalEpisodeNumber: 1, episodeNumber: 1 }), viewer: null }),
    );

    expect(access).toMatchObject({ playable: true, reason: 'FREE' });
  });

  // §3.3: an anonymous request is computed as a signed-out viewer holding nothing, so the paid
  // state is described rather than refused. The 401 belongs to playback, which is an attempt.
  it('computes a paid episode as an unlocked-less ordinary viewer', () => {
    const access = decideEpisodeAccess(query({ viewer: null }));

    expect(access).toMatchObject({ playable: false, reason: 'NEED_UNLOCK', priceCoins: 300 });
  });

  it('never reports an anonymous viewer as VIP', () => {
    const access = decideEpisodeAccess(
      query({ episode: episode({ unlockPolicy: 'VIP_ONLY' }), viewer: null }),
    );

    expect(access.reason).toBe('NEED_VIP');
  });
});

describe('decideEpisodeAccess — purity', () => {
  it('does not mutate the facts it is given', () => {
    const facts = query({ viewer: viewer({ vip: activeVip(), unlocks: [coinUnlock()] }) });
    const snapshot = structuredClone(facts);

    decideEpisodeAccess(facts);

    expect(facts).toEqual(snapshot);
  });

  it('returns the same verdict for the same facts', () => {
    const facts = query({ viewer: viewer({ vip: lapsedVip(), unlocks: [coinUnlock()] }) });

    expect(decideEpisodeAccess(facts)).toEqual(decideEpisodeAccess(facts));
  });
});
