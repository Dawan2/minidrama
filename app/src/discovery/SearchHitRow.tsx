import { Link } from 'react-router';
import type { DramaSearchMatch } from '@minidrama/shared';

import { dramaPath } from '../routes/routes';
import { translate } from '../core/i18n';
import type { SearchHit } from '../data/search-api';
import type { TranslationKey } from '../core/i18n';

/**
 * One search result.
 *
 * There is no cover art here and that is deliberate on the wire, not an omission on the screen: a
 * hit carries what search itself knows — which drama matched, and on what — and copying half of a
 * `DramaSummary` into a second shape is how two shapes of one drama start disagreeing about
 * `totalEpisodes` (`packages/shared/src/discovery.ts`). The row is a title and its tags until the
 * catalogue's summary is folded in, and it is a link to the drama either way.
 *
 * A tag match is labelled and a title match is not. The label exists to answer "why is this in my
 * results" for the row whose title looks nothing like what was typed; on a title match the answer
 * is already on screen, and labelling it would be noise on every row.
 */
const MATCH_LABEL_KEYS: Readonly<Record<DramaSearchMatch, TranslationKey | null>> = {
  TITLE: null,
  TAG: 'search.matchedTag',
};

export interface SearchHitRowProps {
  readonly hit: SearchHit;
}

export function SearchHitRow({ hit }: SearchHitRowProps): React.JSX.Element {
  // Total over the published tiers, so a tier added to the union is a compile error here rather
  // than a blank label in production. An unrecognised one arrives as `null` and is simply unlabelled.
  const labelKey = hit.matchedOn === null ? null : MATCH_LABEL_KEYS[hit.matchedOn];

  return (
    <li
      className="search-hit"
      data-testid="search-hit"
      data-drama-id={hit.dramaId}
      data-matched-on={hit.matchedOn ?? ''}
    >
      <Link className="search-hit__link" to={dramaPath(hit.dramaId)}>
        <h3 className="search-hit__title">{hit.title}</h3>
        {labelKey === null ? null : (
          <p className="search-hit__matched" data-testid="search-hit-matched">
            {translate(labelKey)}
          </p>
        )}
        {hit.tags.length === 0 ? null : (
          <ul className="search-hit__tags">
            {hit.tags.map((tag) => (
              <li className="badge" key={tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}
      </Link>
    </li>
  );
}
