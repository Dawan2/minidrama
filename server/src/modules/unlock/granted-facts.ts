import { ok } from '@minidrama/shared';

import type { EntitlementFactsPort } from '../entitlement/facts-port.js';
import type { Unlock } from './unlocks.js';
import type { UnlockFacts } from '../entitlement/access.js';
import type { UnlockStore } from './unlock-store.js';

/**
 * How a granted unlock reaches the decision that reads it.
 *
 * `decideEpisodeAccess` consults `viewer.unlocks`, and those facts come from an
 * `EntitlementFactsPort`. In the finished system the unlock table and the content tables are the
 * same database and one query loads both; until the data layer lands (W7), the receipts this module
 * writes live in their own store and the facts port knows nothing about them. That gap is the whole
 * defect: a payment could be verified, a row written, and the episode still report `NEED_UNLOCK`,
 * because the two halves were never introduced.
 *
 * So this wraps a facts port and adds the viewer's receipt for the episode under decision. It is a
 * seam, not a rule — every entitlement rule stays in the pure function, and nothing here decides
 * anything:
 *
 *   - **it cannot invent a viewer.** A base port that failed, or that answered with no viewer
 *     because the request was anonymous, is passed through untouched. An unlock row is evidence
 *     about an account, not evidence that the account exists, and a decorator that synthesised a
 *     viewer from one would make every failure of the data layer look like a signed-in viewer who
 *     owns something;
 *   - **it adds, and never removes.** Rows the base port already reported are kept, so this cannot
 *     be the reason a viewer's existing entitlement disappears;
 *   - **it asks only about the episode under decision**, which is the one lookup the decision needs
 *     and the shape the durable query will have.
 *
 * The row is copied field by field into `UnlockFacts` rather than passed through. `method` and
 * `expiresAtMs` are the two inputs the decision actually reads, and a wider object would let a
 * field the decision does not know about look meaningful.
 */
export function createGrantedUnlockFactsPort(
  base: EntitlementFactsPort,
  unlockStore: UnlockStore,
): EntitlementFactsPort {
  return {
    loadEpisodeAccessFacts: async (query) => {
      const facts = await base.loadEpisodeAccessFacts(query);
      if (!facts.ok) return facts;

      const { viewer, episode } = facts.value;
      if (viewer === null) return facts;

      const granted = await unlockStore.findForEpisode(viewer.userId, episode.id);
      if (granted === undefined) return facts;

      // The base port may already report this very row — in the finished data layer it will report
      // all of them. The match is on the method as well as the episode, deliberately: a viewer can
      // hold a `VIP` viewing receipt for an episode they then bought with coins, and those two rows
      // mean opposite things (DM-3). Deduplicating on the episode alone would drop the purchase.
      const alreadyKnown = viewer.unlocks.some(
        (unlock) => unlock.episodeId === episode.id && unlock.method === granted.method,
      );
      if (alreadyKnown) return facts;

      return ok({
        ...facts.value,
        viewer: { ...viewer, unlocks: [...viewer.unlocks, unlockFacts(granted)] },
      });
    },
  };
}

function unlockFacts(unlock: Unlock): UnlockFacts {
  return {
    episodeId: unlock.episodeId,
    method: unlock.method,
    expiresAtMs: unlock.expiresAtMs,
  };
}
