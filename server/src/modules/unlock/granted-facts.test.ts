import { beforeEach, describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { createCoinUnlock } from './unlocks.js';
import { createInMemoryUnlockStore } from './unlock-store.js';
import { createGrantedUnlockFactsPort } from './granted-facts.js';
import { decideEpisodeAccess } from '../entitlement/access.js';
import type { EntitlementFactsPort, EpisodeAccessFacts } from '../entitlement/facts-port.js';
import type { UnlockStore } from './unlock-store.js';
import type { ViewerFacts } from '../entitlement/access.js';

/**
 * The seam between a written receipt and the decision that reads it.
 *
 * The interesting cases are the ones where the decorator must keep its hands off: a base port that
 * failed, an anonymous request, and a viewer whose facts already carry the row. A decorator that got
 * any of those wrong would either hide a fault behind an invented viewer or report an entitlement
 * for a request that has no account to attach one to.
 */

const NOW = Date.parse('2026-08-27T10:00:00.000Z');

const PAID_EPISODE = {
  id: 'ep_1',
  status: 'PUBLISHED',
  unlockPolicy: 'COIN',
  priceCoins: 300,
  episodeNumber: 7,
  globalEpisodeNumber: 7,
} as const;

let unlockStore: UnlockStore;

function facts(viewer: ViewerFacts | null): EpisodeAccessFacts {
  return {
    drama: { id: 'drm_1', status: 'PUBLISHED', freeEpisodes: 0 },
    season: { id: 'ssn_1', status: 'PUBLISHED' },
    episode: PAID_EPISODE,
    viewer,
  };
}

function basePort(viewer: ViewerFacts | null): EntitlementFactsPort {
  return { loadEpisodeAccessFacts: async () => ok(facts(viewer)) };
}

const viewer: ViewerFacts = { userId: 'usr_1', vip: null, unlocks: [] };

async function grantEpisode(episodeId = 'ep_1', userId = 'usr_1'): Promise<void> {
  await unlockStore.record(
    createCoinUnlock({
      id: `ulk_${userId}_${episodeId}`,
      userId,
      episodeId,
      dramaId: 'drm_1',
      costCoins: 300,
      orderId: 'uord_1',
      grantedAtMs: NOW,
    }),
  );
}

function load(port: EntitlementFactsPort, viewerId: string | null = 'usr_1') {
  return port.loadEpisodeAccessFacts({ episodeId: 'ep_1', viewerId });
}

beforeEach(() => {
  unlockStore = createInMemoryUnlockStore();
});

describe('createGrantedUnlockFactsPort', () => {
  it('reports the receipt the viewer holds for the episode under decision', async () => {
    await grantEpisode();

    const loaded = await load(createGrantedUnlockFactsPort(basePort(viewer), unlockStore));

    expect(loaded.ok && loaded.value.viewer?.unlocks).toEqual([
      { episodeId: 'ep_1', method: 'COIN', expiresAtMs: null },
    ]);
  });

  // The point of the seam: the pure function's verdict changes, and only because a row exists.
  it('makes the episode playable, as a purchase and not as a subscription', async () => {
    const port = createGrantedUnlockFactsPort(basePort(viewer), unlockStore);

    const before = await load(port);
    await grantEpisode();
    const after = await load(port);

    expect(before.ok && decideEpisodeAccess({ ...before.value, nowMs: NOW })).toMatchObject({
      playable: false,
      reason: 'NEED_UNLOCK',
    });
    expect(after.ok && decideEpisodeAccess({ ...after.value, nowMs: NOW })).toMatchObject({
      playable: true,
      reason: 'UNLOCKED',
      unlockedBy: 'COIN',
    });
  });

  it('reports nothing for an episode the viewer did not buy', async () => {
    await grantEpisode('ep_2');

    const loaded = await load(createGrantedUnlockFactsPort(basePort(viewer), unlockStore));

    expect(loaded.ok && loaded.value.viewer?.unlocks).toEqual([]);
  });

  it('reports nothing for another account\u2019s receipt', async () => {
    await grantEpisode('ep_1', 'usr_2');

    const loaded = await load(createGrantedUnlockFactsPort(basePort(viewer), unlockStore));

    expect(loaded.ok && loaded.value.viewer?.unlocks).toEqual([]);
  });

  /**
   * A failing base port stays failing. An unlock row is evidence about an account, never evidence
   * that the account or the episode exists, so a decorator that answered `FACTS_UNAVAILABLE` with a
   * viewer built out of the unlock table would turn every data-layer outage into a signed-in viewer
   * who owns things — and `createUnavailableEntitlementFactsPort` is the default deployment.
   */
  it.each(['FACTS_UNAVAILABLE', 'EPISODE_NOT_FOUND', 'VIEWER_NOT_FOUND'] as const)(
    'passes %s through, however much the viewer has bought',
    async (failure) => {
      await grantEpisode();
      const refusing: EntitlementFactsPort = { loadEpisodeAccessFacts: async () => err(failure) };

      expect(await load(createGrantedUnlockFactsPort(refusing, unlockStore))).toEqual(err(failure));
    },
  );

  // An anonymous request has no account to attach a receipt to. Passing it through is the only
  // honest answer.
  it('leaves an anonymous request anonymous', async () => {
    await grantEpisode();

    const loaded = await load(createGrantedUnlockFactsPort(basePort(null), unlockStore), null);

    expect(loaded.ok && loaded.value.viewer).toBeNull();
  });

  /**
   * And the id on the *query* is not a substitute for the viewer the base port reported. This is the
   * case that separates "there is no viewer" from "there is no receipt for the viewer": the store
   * holds a receipt for the account named in the query, and the facts say there is no viewer at all.
   *
   * Without it, a decorator that synthesised a viewer out of `query.viewerId` passes every other
   * assertion in this file — including the anonymous one, because nothing has ever bought anything
   * as `anonymous` — and quietly turns a paid receipt into an entitlement for a request the data
   * layer refused to attach an account to.
   */
  it('does not build a viewer out of the id the query named', async () => {
    await grantEpisode('ep_1', 'usr_1');

    const loaded = await load(createGrantedUnlockFactsPort(basePort(null), unlockStore), 'usr_1');

    expect(loaded.ok && loaded.value.viewer).toBeNull();
  });

  it('does not attach a receipt bought by nobody', async () => {
    await grantEpisode('ep_1', 'anonymous');

    const loaded = await load(createGrantedUnlockFactsPort(basePort(null), unlockStore), null);

    expect(loaded.ok && loaded.value.viewer).toBeNull();
  });

  it('keeps the rows the base port already reported', async () => {
    await grantEpisode();
    const withHistory: ViewerFacts = {
      userId: 'usr_1',
      vip: { active: true, expiresAtMs: NOW + 1000 },
      unlocks: [{ episodeId: 'ep_9', method: 'GRANT', expiresAtMs: null }],
    };

    const loaded = await load(createGrantedUnlockFactsPort(basePort(withHistory), unlockStore));

    expect(loaded.ok && loaded.value.viewer).toEqual({
      userId: 'usr_1',
      vip: { active: true, expiresAtMs: NOW + 1000 },
      unlocks: [
        { episodeId: 'ep_9', method: 'GRANT', expiresAtMs: null },
        { episodeId: 'ep_1', method: 'COIN', expiresAtMs: null },
      ],
    });
  });

  // Once the data layer reads unlocks itself, the base port carries this row too. One purchase must
  // not start reading as two.
  it('does not report the same receipt twice', async () => {
    await grantEpisode();
    const already: ViewerFacts = {
      userId: 'usr_1',
      vip: null,
      unlocks: [{ episodeId: 'ep_1', method: 'COIN', expiresAtMs: null }],
    };

    const loaded = await load(createGrantedUnlockFactsPort(basePort(already), unlockStore));

    expect(loaded.ok && loaded.value.viewer?.unlocks).toHaveLength(1);
  });

  /**
   * A `VIP` row for the same episode is not the same row: it is a viewing receipt that expires with
   * the subscription, and the purchase is what survives it (DM-3). Deduplicating on the episode
   * alone would drop the purchase and hand the viewer's paid episode back to their subscription.
   */
  it('reports a purchase for an episode the viewer also has a VIP receipt for', async () => {
    await grantEpisode();
    const watchedAsVip: ViewerFacts = {
      userId: 'usr_1',
      vip: { active: true, expiresAtMs: NOW - 1 },
      unlocks: [{ episodeId: 'ep_1', method: 'VIP', expiresAtMs: null }],
    };

    const loaded = await load(createGrantedUnlockFactsPort(basePort(watchedAsVip), unlockStore));

    expect(loaded.ok && loaded.value.viewer?.unlocks).toHaveLength(2);
    expect(loaded.ok && decideEpisodeAccess({ ...loaded.value, nowMs: NOW })).toMatchObject({
      reason: 'UNLOCKED',
      unlockedBy: 'COIN',
    });
  });

  it('asks the store only about the episode under decision', async () => {
    const asked: Array<readonly [string, string]> = [];
    const counting: UnlockStore = {
      ...unlockStore,
      findForEpisode: async (userId, episodeId) => {
        asked.push([userId, episodeId]);

        return undefined;
      },
    };

    await load(createGrantedUnlockFactsPort(basePort(viewer), counting));

    expect(asked).toEqual([['usr_1', 'ep_1']]);
  });
});
