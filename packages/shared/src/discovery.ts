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
 * the same thing start disagreeing about `totalEpisodes`; the handoff records the exact change
 * (`items[].drama`) that folds the real summary in when `catalog` lands.
 */

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
