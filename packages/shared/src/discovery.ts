/**
 * Discovery: the shapes keyword search and favourites put on the wire.
 *
 * Two endpoints families that look unrelated and are not: they are the two halves of `U4`
 * ("找剧" — find a drama, then follow it), and they are the only reads in the product where the
 * viewer, rather than a ranking, chooses what is on screen.
 *
 * The one field that is deliberately *absent* from a search hit is cover art. A hit here carries
 * what search itself knows — which drama matched, and on what — and nothing that belongs to the
 * catalogue's `DramaSummary`. Copying half of a summary into a second shape is how two shapes of
 * the same thing start disagreeing about `totalEpisodes`. The favourites list is the other half of
 * that rule: it carries `items[].drama` as the catalogue's own summary, or `null`, rather than a
 * partial copy.
 *
 * The favourites list pages with `catalog.ts`'s `PageInfo` rather than an envelope of its own. This
 * slot wrote one here when it was the first list endpoint to ship and said so in the comment: the
 * next list endpoint must reuse the shape and not define a second that agrees with it by
 * coincidence. `GET /v1/dramas` landed first, so this is that reuse.
 */

import type { DramaSummary, PageInfo } from './catalog.js';

/**
 * Which field a hit matched on. It is display information — a client may label a tag match
 * differently from a title match — and it is also the primary ranking tier, so a client that
 * ignores it still receives the rows in the order this says they are in.
 */
export type DramaSearchMatch = 'TITLE' | 'TAG';

export interface DramaSearchHit {
  readonly dramaId: string;
  /** The stored title, verbatim. Matching is done against a folded copy the client never sees. */
  readonly title: string;
  readonly tags: readonly string[];
  readonly matchedOn: DramaSearchMatch;
}

export interface DramaSearchResults {
  /**
   * The query that was searched, trimmed and whitespace-collapsed — the viewer's own casing, not
   * the folded form matching uses. Echoed so a client can label an empty-result state in the words
   * the viewer typed, and discard a response that arrived after they typed further.
   *
   * It is plain text in a JSON body and it is never HTML. A client renders it through its
   * framework's escaping like any other string — search-term echo is on the XSS list in
   * `docs/14-security.md` §2 precisely because it is so often rendered as markup.
   */
  readonly query: string;
  /** Ordered: match tier first, then popularity, then a stable tiebreak. Never null. */
  readonly items: readonly DramaSearchHit[];
  /**
   * True when more dramas matched than `limit` allowed through. There is no cursor: relevance
   * order is not a keyset, so a "next page" of a ranking needs a snapshot of that ranking to be
   * meaningful. `truncated` is the honest answer available without one — the client's move is to
   * narrow the query, which is also the better search experience.
   */
  readonly truncated: boolean;
}

/**
 * Whether this viewer follows this drama. `GET /v1/dramas/{dramaId}/favorite`.
 *
 * A separate answer from the catalogue's `DramaDetail.viewer.favorited` on purpose: the detail
 * screen needs the flag folded into one request, and a favourite button that has just been pressed
 * needs to re-read one row without re-fetching a drama. Both must report the same fact, which is
 * why the fact lives in one store rather than in each of them.
 */
export interface FavoriteState {
  readonly dramaId: string;
  readonly favorited: boolean;
  /**
   * Server time when the favourite was *first* recorded, ISO 8601. Absent when `favorited` is
   * false. It does not move on a repeated `PUT`: "following since" is a fact about the viewer's
   * history, and a duplicate request from a double-tapped button is not a new decision.
   */
  readonly favoritedAt?: string;
}

/**
 * One row of the viewer's favourites list. `GET /v1/users/me/favorites`.
 *
 * The row is still the favourite — which drama, and when it was first followed — and the drama
 * itself is the catalogue's `DramaSummary`, not a partial copy assembled here. That is S60's
 * remaining half, landed: a second shape that agreed about `title` and disagreed about
 * `totalEpisodes` is how two screens of one drama drift. `null` is a value, not an omission: a
 * delisted or deleted drama stays in the list so the viewer can still un-follow it (S68, W8-a).
 *
 * `favoritedAt` is required on the wire. The client that reads this row may widen the field at its
 * own boundary — rejecting a page over a timestamp nothing displays would cost the viewer their
 * list — but the server always sends it, because a row only exists because it was recorded.
 */
export interface FavoriteListItem {
  readonly dramaId: string;
  /**
   * Server time when the favourite was first recorded, ISO 8601. Always present here — a row only
   * exists because it was recorded — and it is also the sort key, so a client can render "followed
   * on" without a second request.
   */
  readonly favoritedAt: string;
  /**
   * The catalogue's summary for this id, or `null` when that id is unpublished, deleted, or
   * otherwise not a listed summary. The favourite row is still present either way.
   */
  readonly drama: DramaSummary | null;
}

/**
 * A page of the viewer's favourites, most recently followed first.
 *
 * An empty `items` is a `200`, not a `404` and not an error: "you follow nothing yet" is a complete
 * answer and it is the empty state of the favourites screen (`docs/02-screen-inventory.md`
 * SCR-08). The endpoint is per viewer, so it refuses without a session — the one thing an empty
 * list must never be confused with is a list somebody was not allowed to see.
 */
export interface FavoriteList {
  /** Ordered by `favoritedAt` descending, then by `dramaId` descending. Never null. */
  readonly items: readonly FavoriteListItem[];
  readonly pageInfo: PageInfo;
}
