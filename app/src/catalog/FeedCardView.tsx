import { Link } from 'react-router';
import type { FeedCard } from '@minidrama/shared';

import { CoverImage } from '../components/CoverImage';
import { dramaPath, playPath } from '../routes/routes';
import { translate } from '../core/i18n';

/**
 * One feed card.
 *
 * The two card types are one tap each and they land in different places: a continue-watching card
 * resumes the episode directly, an ordinary card opens the drama (`docs/02-user-journeys.md` J3,
 * `docs/02-screen-inventory.md` SCR-02). Routing a resume card through the detail screen would ask
 * the viewer to find their own place again, which is the one thing the card exists to avoid.
 *
 * `trackingId` is rendered as an attribute and used by nothing here. It is the join key between an
 * impression and the click it produced (`docs/handoff/w2-work-d.md` decision S34), the events
 * endpoint does not exist yet, and dropping the id now would mean re-plumbing every card later. An
 * attribute costs nothing and leaves the analytics slot an observation point instead of a rewrite.
 */
export interface FeedCardViewProps {
  readonly card: FeedCard;
}

export function FeedCardView({ card }: FeedCardViewProps): React.JSX.Element {
  const { drama, continueEpisode } = card;
  const resumes = card.cardType === 'CONTINUE_WATCHING' && continueEpisode !== null;
  const target =
    resumes && continueEpisode !== null ? playPath(continueEpisode.episodeId) : dramaPath(drama.id);

  return (
    <li
      className="feed-card"
      data-testid="feed-card"
      data-card-type={card.cardType}
      data-tracking-id={card.trackingId}
      data-drama-id={drama.id}
    >
      <Link className="feed-card__link" to={target}>
        <CoverImage className="feed-card__cover" src={drama.coverUrl} alt={drama.title} />
        <div className="feed-card__body">
          {card.recReason === null ? null : (
            <p className="feed-card__reason" data-testid="rec-reason">
              {card.recReason}
            </p>
          )}
          <h2 className="feed-card__title">{drama.title}</h2>
          <p className="feed-card__meta">
            <span>{translate('feed.episodeCount', undefined, { n: drama.totalEpisodes })}</span>
            <span>{translate(drama.isCompleted ? 'feed.completed' : 'feed.ongoing')}</span>
          </p>
          {resumes && continueEpisode !== null ? (
            <p className="feed-card__resume" data-testid="feed-resume">
              {translate('feed.resume', undefined, { n: continueEpisode.globalEpisodeNumber })}
            </p>
          ) : (
            <FreeBadge freeEpisodes={drama.freeEpisodes} totalEpisodes={drama.totalEpisodes} />
          )}
        </div>
      </Link>
    </li>
  );
}

/**
 * "First 3 free" — the one and only permitted use of `freeEpisodes`.
 *
 * It is display copy. It is never an input to whether something plays: that answer arrives already
 * decided in `EpisodeItem.viewerAccess`, and recomputing it here would be a second entitlement
 * system with none of the server's information (`packages/shared/src/catalog.ts`).
 *
 * A drama that is free end to end gets no badge: "first 8 of 8 free" is a strange way to say free.
 */
export function FreeBadge({
  freeEpisodes,
  totalEpisodes,
}: {
  readonly freeEpisodes: number;
  readonly totalEpisodes: number;
}): React.JSX.Element | null {
  if (freeEpisodes <= 0 || freeEpisodes >= totalEpisodes) {
    return null;
  }
  return (
    <p className="badge badge--free" data-testid="free-badge">
      {translate('feed.freeEpisodes', undefined, { n: freeEpisodes })}
    </p>
  );
}
