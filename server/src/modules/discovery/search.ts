import type { DramaSearchMatch } from '@minidrama/shared';
import type { SearchableDrama } from './dramas.js';

/**
 * What matches what, and in which order — as pure functions.
 *
 * Search is the one endpoint in this product where the server's answer is a *judgement*, and a
 * judgement that only exists inside an HTTP handler is one nobody can change with confidence. So the
 * two decisions live here: how two strings are compared at all (`foldForSearch`), and which of two
 * matches comes first (`findMatches`).
 *
 * The scope is keyword matching over titles and tags, which is what `docs/01-product-scope.md` §4.2
 * scopes search to ("剧名/标签"). It is a linear scan with no index, no stemming, no synonyms and no
 * typo tolerance, and that is a deliberate floor rather than a first attempt: those four are
 * exactly the features that need a real search engine and a relevance metric to evaluate, and none
 * of them can be added honestly against a seed of eight dramas. §5 of the handoff says what the
 * upgrade path is.
 */

/**
 * Folds a string to the form comparisons are made in.
 *
 * Four transformations, each for a case that occurs in this product's actual audience:
 *
 *   - **NFKC** first, so the fullwidth characters an IME produces (`Ｎｉｎｔｈ`) and their ASCII
 *     equivalents compare equal. A CJK keyboard emits these routinely and a viewer cannot see the
 *     difference on screen;
 *   - **`toLowerCase`, not `toLocaleLowerCase`.** Locale-dependent casing would make the same query
 *     behave differently according to the server's locale — Turkish maps `I` to `ı` — which is a
 *     defect that only reproduces on one deployment;
 *   - **Latin diacritics removed**, via NFD and the `U+0300–U+036F` block only, so `Café` is found
 *     by `cafe`. A viewer typing on a phone keyboard usually cannot produce the accent, and
 *     refusing them the row is not a defensible reading of their intent. The block matters:
 *     stripping *every* combining mark would take the dakuten off Japanese kana and fold `ジ` into
 *     `シ`, which is a different syllable, so a plausible-looking one-line version of this rule
 *     silently damages one of the launch scripts;
 *   - **whitespace collapsed**, so a double space in either the query or the title is not a miss.
 *
 * What it does not do is case-fold beyond `toLowerCase` (no ß → ss) or transliterate scripts. Both
 * are per-language rules, and getting them wrong for one language to help another is worse than not
 * trying: CJK titles, the majority of this catalogue, are unaffected by every rule above and are
 * matched by substring.
 */
export function foldForSearch(value: string): string {
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]+/gu, '')
      // Recomposed, because the NFD above decomposed marks this rule deliberately keeps — a kana
      // left decomposed would not compare equal to the same kana typed normally.
      .normalize('NFC')
      .replace(/\s+/gu, ' ')
      .trim()
  );
}

/**
 * Why a drama matched, most relevant first. The numbers are the primary sort key; the names are
 * what the reasoning is about.
 *
 * A title match outranks a tag match because a viewer typing a title is naming one specific drama,
 * while a tag is a genre — answering "Sweet Trap" with everything tagged `sweet` before the drama
 * itself is the classic failure of a naive search box. Within titles, a prefix outranks a substring
 * because a viewer types from the beginning of a name.
 */
const MATCH_TIER = {
  TITLE_PREFIX: 0,
  TITLE_SUBSTRING: 1,
  TAG_EXACT: 2,
  TAG_SUBSTRING: 3,
} as const;

type MatchTier = (typeof MATCH_TIER)[keyof typeof MATCH_TIER];

export interface RankedMatch {
  readonly drama: SearchableDrama;
  readonly matchedOn: DramaSearchMatch;
}

interface TieredMatch extends RankedMatch {
  readonly tier: MatchTier;
}

function tierOf(drama: SearchableDrama, foldedQuery: string): TieredMatch | undefined {
  const title = foldForSearch(drama.title);
  if (title.startsWith(foldedQuery)) {
    return { drama, matchedOn: 'TITLE', tier: MATCH_TIER.TITLE_PREFIX };
  }
  if (title.includes(foldedQuery)) {
    return { drama, matchedOn: 'TITLE', tier: MATCH_TIER.TITLE_SUBSTRING };
  }

  const tags = drama.tags.map(foldForSearch);
  if (tags.includes(foldedQuery)) {
    return { drama, matchedOn: 'TAG', tier: MATCH_TIER.TAG_EXACT };
  }
  if (tags.some((tag) => tag.includes(foldedQuery))) {
    return { drama, matchedOn: 'TAG', tier: MATCH_TIER.TAG_SUBSTRING };
  }

  return undefined;
}

/**
 * Orders two matches. Total and deterministic, which matters more here than it looks: an unstable
 * comparator makes the same query return the same rows in a different order on two requests, and a
 * viewer reads that as the catalogue changing under them.
 *
 * Tier decides first, then play count — popularity is the only relevance signal this product has
 * before it has behavioural data — then the identifier, which is unique and therefore breaks every
 * remaining tie exactly once.
 */
function compareMatches(a: TieredMatch, b: TieredMatch): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.drama.stat.playCount !== b.drama.stat.playCount) {
    return b.drama.stat.playCount - a.drama.stat.playCount;
  }
  return a.drama.id < b.drama.id ? -1 : a.drama.id > b.drama.id ? 1 : 0;
}

/**
 * The matches for a query, ordered, unpaginated.
 *
 * Every drama handed in is searchable: this function applies no publication filter, because
 * deciding what a viewer may discover is `DramaDirectory.listSearchable`'s job and a second filter
 * here would be a second place to forget one.
 *
 * An empty folded query returns nothing rather than everything. It cannot arrive from a route —
 * `validateSearchQuery` refuses it — but `''` is a prefix of every string, so the defensive branch
 * is the difference between a bug and a full catalogue dump.
 */
export function findMatches(
  dramas: readonly SearchableDrama[],
  query: string,
): readonly RankedMatch[] {
  const foldedQuery = foldForSearch(query);
  if (foldedQuery.length === 0) return [];

  const matches: TieredMatch[] = [];
  for (const drama of dramas) {
    const match = tierOf(drama, foldedQuery);
    if (match !== undefined) matches.push(match);
  }

  return matches.sort(compareMatches).map(({ drama, matchedOn }) => ({ drama, matchedOn }));
}
