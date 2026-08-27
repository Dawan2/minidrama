import { err, ok } from '@minidrama/shared';
import type { DramaSummary, Result } from '@minidrama/shared';

import { UNAVAILABLE_STATUSES } from '../data/session-read';
import type { ApiFailure } from '../data/failure';
import type { FavoriteCandidateSource } from './favorite-candidates';
import type { FavoriteState } from '../data/favorites-api';

/**
 * The viewer's favourites, assembled from per-drama reads.
 *
 * `favorite-candidates.ts` explains why the screen is built this way rather than from a list
 * endpoint. What this module owns is the part that has to be right whatever the candidates are:
 *
 * 1. **when the fan-out stops.** Two failures mean the same thing for every candidate — no session,
 *    and no endpoint — so the first one of those ends the whole read instead of being asked again
 *    nineteen times;
 * 2. **what a partial answer is allowed to look like.** A read where three probes timed out is not
 *    an empty list and it is not a complete list, and the screen must be able to say which;
 * 3. **the order.** Most recently followed first, which is the order SCR-08 reads in
 *    (`docs/02-screen-inventory.md`), and it is the client's job here only because there is no
 *    server sort to inherit.
 */

export interface FavoriteEntry {
  readonly drama: DramaSummary;
  /**
   * When the viewer first followed it, ISO 8601, or `null` when the row carried no usable timestamp.
   * The sort key, and nothing else: it is never displayed, because "following since 3 August" is a
   * fact the client would be quoting from a clock it does not own.
   */
  readonly favoritedAt: string | null;
}

export interface FavoritesList {
  /** Ordered by `orderFavorites`. Only dramas the server said this viewer follows. */
  readonly entries: readonly FavoriteEntry[];
  /** How many dramas the candidate source offered. */
  readonly candidates: number;
  /** How many of them answered. Below `candidates` when a probe failed and the read went on. */
  readonly answered: number;
  /**
   * The first probe failure that was neither a missing session nor a missing endpoint — a timeout,
   * a server fault. Non-null means `entries` is incomplete, which is a state the screen renders
   * rather than hides: a hole in this list is indistinguishable from a drama the viewer never
   * followed, so it reads as the product having silently un-followed something.
   */
  readonly unresolved: ApiFailure | null;
}

export interface CollectFavoritesOptions {
  readonly candidates: FavoriteCandidateSource;
  readonly readFavorite: (dramaId: string) => Promise<Result<FavoriteState, ApiFailure>>;
  readonly concurrency?: number;
}

/**
 * How many probes are in flight at once.
 *
 * Not "all of them". A WebView holds around six connections per host, so twenty simultaneous
 * requests means the last fourteen queue in the browser — and the client's 10s timeout starts when
 * the request is *made*, not when it is sent, so a queued request can time out having never left the
 * device (`data/http.ts`). Four leaves connections free for the cover images the rows are about to
 * ask for, which is the difference between a list that appears and a list that appears blank.
 */
export const FAVORITE_PROBE_CONCURRENCY = 4;

/**
 * Failures whose answer would be identical for every remaining candidate.
 *
 * A `401` is about the viewer, not about the drama: there is no session, so no probe can succeed and
 * nineteen more requests would produce nineteen more `401`s and a slower sign-in prompt. The
 * "endpoint is not deployed" statuses are about the deployment for the same reason — today, on this
 * branch, *every* probe answers `404` from Fastify's not-found handler, and the screen should reach
 * its empty state in one request rather than twenty.
 *
 * The failure is returned as the read's failure so the screen presents it through
 * `presentSessionReadFailure`, which is the only place either status is interpreted.
 */
function endsTheRead(failure: ApiFailure): boolean {
  if (failure.kind !== 'HTTP' || failure.status === null) {
    return false;
  }
  return failure.status === 401 || UNAVAILABLE_STATUSES.includes(failure.status);
}

export async function collectFavorites(
  options: CollectFavoritesOptions,
): Promise<Result<FavoritesList, ApiFailure>> {
  const found = await options.candidates();
  if (!found.ok) {
    // The candidate source's failure, unchanged. The screen presents it with the same three-way
    // split as a probe failure: a feed that is not deployed is as much "we cannot assemble your
    // list" as a favourite endpoint that is not.
    return found;
  }

  const concurrency = Math.max(1, options.concurrency ?? FAVORITE_PROBE_CONCURRENCY);
  const candidates = found.value;

  const entries: FavoriteEntry[] = [];
  let answered = 0;
  let unresolved: ApiFailure | null = null;

  for (let start = 0; start < candidates.length; start += concurrency) {
    const batch = candidates.slice(start, start + concurrency);

    const answers = await Promise.all(
      batch.map(async (drama) => ({ drama, result: await options.readFavorite(drama.id) })),
    );

    for (const { drama, result } of answers) {
      if (!result.ok) {
        /*
         * A session that expires mid-fan-out ends the read even though earlier probes succeeded.
         * The rows already collected are still true, and showing them under a sign-in prompt would
         * present a fragment of the list as the list — on the screen whose one job is to keep
         * "your list" apart from "the part of your list we could read". The reload after a
         * successful sign-in produces the whole thing.
         */
        if (endsTheRead(result.error)) {
          return err(result.error);
        }
        unresolved ??= result.error;
        continue;
      }

      answered += 1;
      if (result.value.favorited) {
        entries.push({ drama, favoritedAt: result.value.favoritedAt ?? null });
      }
    }
  }

  return ok({
    entries: orderFavorites(entries),
    candidates: candidates.length,
    answered,
    unresolved,
  });
}

/**
 * Most recently followed first, then by drama id.
 *
 * The tiebreak is not decoration: without it the order of two rows followed in the same millisecond
 * — or of any two rows whose timestamps were unreadable — is the order the probes happened to
 * resolve in, which changes between renders and moves a row out from under the viewer's finger.
 *
 * A row with no usable timestamp sorts last rather than first. The alternative would promote exactly
 * the rows we know least about to the top of the screen.
 */
export function orderFavorites(entries: readonly FavoriteEntry[]): readonly FavoriteEntry[] {
  return [...entries].sort((left, right) => {
    const byRecency = followedAtMs(right) - followedAtMs(left);
    return byRecency !== 0 ? byRecency : left.drama.id.localeCompare(right.drama.id);
  });
}

/**
 * Parsed rather than string-compared. The server's `favoritedAt` is `Date.toISOString()` and would
 * sort correctly as text, but a timestamp with an offset (`+03:00`) would not, and a favourites list
 * silently in the wrong order is a bug nobody reports.
 */
function followedAtMs(entry: FavoriteEntry): number {
  if (entry.favoritedAt === null) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(entry.favoritedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
