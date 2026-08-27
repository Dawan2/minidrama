import type { FeedCard } from '@minidrama/shared';

/**
 * How Home reads the HOME feed mix.
 *
 * `GET /v1/recommendations/feed?scene=HOME` already leads with `CONTINUE_WATCHING` when the
 * heartbeat table has a row for this viewer (`docs/handoff/w14-c4-after-seek.md`). This module does
 * not fetch watch-history, does not ask progress, and does not invent a resume from the catalogue.
 * It only splits the mix the server already composed.
 *
 * Fail-closed:
 *
 * - a card is on the rail only when `cardType` is `CONTINUE_WATCHING` **and** `continueEpisode` is
 *   present. A continue card with no episode section is not a resume;
 * - no such card → no rail. Anonymous and empty-progress responses stay the catalogue mix, which is
 *   also how the server degrades (`docs/12-api-contracts.md` §2.2).
 */

export interface HomeFeedRails {
  readonly continueWatching: readonly FeedCard[];
  readonly mix: readonly FeedCard[];
}

/** A card the HOME rail may render. Missing `continueEpisode` is the section being absent. */
export function isContinueWatchingRailCard(card: FeedCard): boolean {
  return card.cardType === 'CONTINUE_WATCHING' && card.continueEpisode !== null;
}

export function splitHomeFeed(items: readonly FeedCard[]): HomeFeedRails {
  const continueWatching: FeedCard[] = [];
  const mix: FeedCard[] = [];

  for (const card of items) {
    if (isContinueWatchingRailCard(card)) {
      continueWatching.push(card);
    } else {
      mix.push(card);
    }
  }

  return { continueWatching, mix };
}
