import { ok } from '@minidrama/shared';
import type { DramaSummary, FeedCard, Result } from '@minidrama/shared';

import type { ApiFailure } from '../data/failure';
import type { CatalogApi } from '../data/catalog-api';

/**
 * Which dramas the favourites screen is able to ask about — the seam that stands in for the list
 * endpoint the server does not have.
 *
 * **This is the compromise at the centre of SCR-08 and it is worth stating plainly.**
 * `GET /v1/users/me/favorites` does not exist: slot J shipped the three per-drama favourite verbs
 * and deliberately left the list out, because the list returns `DramaSummary` pages and that
 * projection belongs to the catalogue (`docs/handoff/w2-work-j.md` §4, follow-up J-b). So the only
 * way to build the screen today is to ask, drama by drama, "do you follow this one?" — and that
 * question needs a set of dramas to ask it about.
 *
 * The set comes from the recommendation feed, for two reasons and one non-reason:
 *
 *   - the feed is **deployed on this branch** and anonymous-capable, so the screen is exercisable
 *     end to end today rather than being a component with no data path;
 *   - a feed card already carries the whole `DramaSummary` the row renders, so a favourite that is
 *     found needs no second request to become a card.
 *
 * The non-reason is completeness, and this is the honest limit: **a drama the viewer follows that is
 * not in the feed page is not on their favourites screen.** That is a wrong list, not a slow one,
 * and the screen says so rather than presenting a partial list as the whole truth — see
 * `FavoritesPage`'s coverage notice. The fix is not a bigger fan-out; it is the list endpoint, and
 * when it lands this module is deleted and `collectFavorites` is replaced by one paged read.
 *
 * The alternative candidate source considered and rejected was the watch history: favouriting
 * happens while watching, so the overlap would be higher. It is not deployed either
 * (`data/history-api.ts`), which would have made the screen permanently empty for a different
 * reason, and it is session-scoped — so a `401` would have arrived from the candidate source as well
 * as from the probes, giving two paths to one state.
 */

/**
 * How many dramas the screen will ask about, and therefore its worst-case request count.
 *
 * Twenty is chosen against the fan-out cost rather than against the catalogue: at seed scale it is
 * the whole catalogue anyway, and at real scale a larger number does not buy correctness — a viewer
 * with fifty favourites needs the list endpoint, not forty more probes. It is also the point past
 * which the screen's own latency stops being defensible: twenty requests at a concurrency of four is
 * five round trips before the first row can be trusted to be the first row.
 */
export const FAVORITE_CANDIDATE_LIMIT = 20;

export type FavoriteCandidateSource = () => Promise<Result<readonly DramaSummary[], ApiFailure>>;

/**
 * The dramas of a feed page, once each and in the order the feed ranked them.
 *
 * A feed page can carry the same drama twice — a `CONTINUE_WATCHING` card and a `DRAMA` card are two
 * cards about one drama (`docs/12-api-contracts.md` §4.8) — and each duplicate would otherwise
 * become a second request for a row that can appear only once. The first occurrence wins so the
 * order stays the feed's.
 */
export function distinctDramas(cards: readonly FeedCard[]): readonly DramaSummary[] {
  const seen = new Set<string>();
  const dramas: DramaSummary[] = [];

  for (const card of cards) {
    if (seen.has(card.drama.id)) {
      continue;
    }
    seen.add(card.drama.id);
    dramas.push(card.drama);
  }

  return dramas;
}

/**
 * The feed as a candidate source.
 *
 * `HOME` rather than `PLAYER`: the player scene is a vertical swipe ranking built around one episode
 * (`docs/12-api-contracts.md` §4.8), and the favourites screen is not in a playback context. A
 * failure passes straight through, so the screen presents "we could not assemble your list" as the
 * candidate source's failure — which is a different sentence from "you follow nothing".
 */
export function feedCandidateSource(
  api: CatalogApi,
  limit: number = FAVORITE_CANDIDATE_LIMIT,
): FavoriteCandidateSource {
  return async () => {
    const feed = await api.fetchFeed({ scene: 'HOME', limit });
    return feed.ok ? ok(distinctDramas(feed.value.items)) : feed;
  };
}
