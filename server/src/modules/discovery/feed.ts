import type { FeedCardType, FeedScene } from '@minidrama/shared';

import type { DramaRecord } from '../catalog/types.js';
import type { Viewer } from '../catalog/viewer.js';

/**
 * Feed composition.
 *
 * Wave 1 fixed the policy and deliberately left the algorithm out of it: the first feed is a rule
 * mix — continue watching, then popular, then new — with no personalisation model behind it
 * (`docs/handoff/w1-work-b.md` decision 7). This module is that rule, isolated from HTTP so the
 * ordering can be asserted directly rather than through a route.
 *
 * Two properties are load-bearing and both are tested:
 *
 * - **A drama appears at most once in a feed.** A continue-watching card and a popularity card for
 *   the same drama would double-count the impression and read as a bug to the viewer.
 * - **Ranking uses no wall clock.** "New" is a position in the release ordering, not an age
 *   threshold, so the same catalogue produces the same feed tomorrow. A clock in a ranking function
 *   is a test that fails on a date nobody chose.
 */

export interface ContinueWatchingEntry {
  readonly episodeId: string;
  readonly positionSec: number;
}

/**
 * Where "continue watching" comes from.
 *
 * The `progress` module owns this and does not exist yet, so the default source is empty and the
 * HOME feed degrades to the popularity/recency mix — which is also exactly what an anonymous viewer
 * gets, and anonymous browsing is the launch-day default (`docs/12-api-contracts.md` §2.2).
 */
export interface ContinueWatchingSource {
  forViewer(viewer: Viewer): Promise<readonly ContinueWatchingEntry[]>;
}

export function createEmptyContinueWatchingSource(): ContinueWatchingSource {
  return { forViewer: (): Promise<readonly ContinueWatchingEntry[]> => Promise.resolve([]) };
}

/** A continue-watching entry after the catalogue has confirmed it still points at playable content. */
export interface ResolvedContinueEntry {
  readonly drama: DramaRecord;
  readonly episodeId: string;
  readonly globalEpisodeNumber: number;
  readonly positionSec: number;
}

export interface FeedEntry {
  readonly cardType: FeedCardType;
  readonly drama: DramaRecord;
  readonly continueEpisode: {
    readonly episodeId: string;
    readonly globalEpisodeNumber: number;
    readonly positionSec: number;
  } | null;
  readonly recReason: string | null;
  /** Position in the composed feed, from 1. The pagination sort key is built from this. */
  readonly rank: number;
}

export interface FeedInput {
  readonly scene: FeedScene;
  /** Published dramas, most played first. */
  readonly hot: readonly DramaRecord[];
  /** The same dramas, most recently released first. */
  readonly recent: readonly DramaRecord[];
  readonly continueWatching: readonly ResolvedContinueEntry[];
}

/**
 * The reasons are English strings because there is no server-side localisation yet. Conflict C9
 * (`docs/handoff/w1-p3.md` §3) requires user-facing copy to follow `Accept-Language`, and this is
 * one of the places that will need it.
 */
const REASON_CONTINUE = 'Continue watching';
const REASON_TRENDING = 'Trending now';
const REASON_NEW = 'Just added';

/**
 * Alternates the popularity and recency orderings instead of concatenating them.
 *
 * Concatenation gives the tail of the popular list priority over the newest drama in the catalogue,
 * which is how a new release never gets its first impression. Alternating needs no recency
 * threshold and therefore no clock.
 */
function interleave(
  hot: readonly DramaRecord[],
  recent: readonly DramaRecord[],
): readonly { readonly drama: DramaRecord; readonly reason: string }[] {
  const mixed: { drama: DramaRecord; reason: string }[] = [];
  const length = Math.max(hot.length, recent.length);

  for (let index = 0; index < length; index += 1) {
    const hotEntry = hot[index];
    const recentEntry = recent[index];
    if (hotEntry !== undefined) mixed.push({ drama: hotEntry, reason: REASON_TRENDING });
    if (recentEntry !== undefined) mixed.push({ drama: recentEntry, reason: REASON_NEW });
  }

  return mixed;
}

export function composeFeed(input: FeedInput): readonly FeedEntry[] {
  const entries: FeedEntry[] = [];
  const claimed = new Set<string>();

  // The player scene is "you may also like", shown next to something already playing. A
  // continue-watching card there would offer the viewer the thing they are currently watching.
  if (input.scene === 'HOME') {
    for (const resolved of input.continueWatching) {
      if (claimed.has(resolved.drama.id)) continue;
      claimed.add(resolved.drama.id);
      entries.push({
        cardType: 'CONTINUE_WATCHING',
        drama: resolved.drama,
        continueEpisode: {
          episodeId: resolved.episodeId,
          globalEpisodeNumber: resolved.globalEpisodeNumber,
          positionSec: resolved.positionSec,
        },
        recReason: REASON_CONTINUE,
        rank: entries.length + 1,
      });
    }
  }

  for (const mixed of interleave(input.hot, input.recent)) {
    if (claimed.has(mixed.drama.id)) continue;
    claimed.add(mixed.drama.id);
    entries.push({
      cardType: 'DRAMA',
      drama: mixed.drama,
      continueEpisode: null,
      recReason: mixed.reason,
      rank: entries.length + 1,
    });
  }

  return entries;
}
