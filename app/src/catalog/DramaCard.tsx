import { Link } from 'react-router';
import type { DramaSummary } from '@minidrama/shared';

import { CoverImage } from '../components/CoverImage';
import { FreeBadge } from './FeedCardView';
import { dramaPath } from '../routes/routes';
import { translate } from '../core/i18n';

/**
 * One published drama on SCR-03.
 *
 * A tap opens the detail screen, never the player. Resume is a feed concern (J3); the browse grid
 * is a catalogue, and routing a listing card through playback would skip the episode list a
 * viewer came here to pick from (`docs/02-screen-inventory.md` SCR-03).
 *
 * The layout reuses the feed card's classes: two lists of the same object should not invent two
 * paddings. `trackingId` is absent on purpose — that join key exists on a recommendation card
 * and not on `DramaSummary`.
 */
export interface DramaCardProps {
  readonly drama: DramaSummary;
}

export function DramaCard({ drama }: DramaCardProps): React.JSX.Element {
  return (
    <li
      className="feed-card"
      data-testid="browse-card"
      data-drama-id={drama.id}
      data-category={drama.category}
    >
      <Link className="feed-card__link" to={dramaPath(drama.id)}>
        <CoverImage className="feed-card__cover" src={drama.coverUrl} alt={drama.title} />
        <div className="feed-card__body">
          <h2 className="feed-card__title">{drama.title}</h2>
          <p className="feed-card__meta">
            <span>{translate('feed.episodeCount', undefined, { n: drama.totalEpisodes })}</span>
            <span>{translate(drama.isCompleted ? 'feed.completed' : 'feed.ongoing')}</span>
          </p>
          <FreeBadge freeEpisodes={drama.freeEpisodes} totalEpisodes={drama.totalEpisodes} />
        </div>
      </Link>
    </li>
  );
}
