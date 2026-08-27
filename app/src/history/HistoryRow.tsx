import { Link } from 'react-router';

import { CoverImage } from '../components/CoverImage';
import { dramaPath, playPath } from '../routes/routes';
import { translate } from '../core/i18n';
import type { WatchHistoryEntry } from '../data/history-api';

/**
 * One history row: where the viewer was, and one tap back to it.
 *
 * The destination is the whole row. A resume that lands on the drama detail screen asks the viewer
 * to find their own place again, which is the one thing the row exists to avoid
 * (`docs/02-user-journeys.md` J3) — so when the entry carries an episode id the row goes straight
 * to the player.
 *
 * When it does not, the row opens the drama instead of disappearing or rendering something
 * unpressable. The contract's history entry publishes `lastEpisodeNumber` and no episode id
 * (`docs/12-api-contracts.md` §4.7) and the player route is addressed by id, so today the fallback
 * is the only reachable destination for a server that follows the contract exactly. Two taps to
 * resume is a worse product than one; a row that goes nowhere is not a product at all.
 *
 * The resume position is displayed nowhere. It is the server's to apply — the playback token
 * carries `resumePositionSec` (contract §4.4) — and a client that printed "resumes at 0:45" would
 * be quoting a number it has no authority over and cannot keep in step across devices.
 */
export interface HistoryRowProps {
  readonly entry: WatchHistoryEntry;
}

export function HistoryRow({ entry }: HistoryRowProps): React.JSX.Element {
  const { drama, lastEpisodeId } = entry;
  const resumesInPlayer = lastEpisodeId !== null;
  const target = resumesInPlayer ? playPath(lastEpisodeId) : dramaPath(drama.id);

  return (
    <li
      className="history-row"
      data-testid="history-row"
      data-drama-id={drama.id}
      data-destination={resumesInPlayer ? 'PLAYER' : 'DRAMA'}
    >
      <Link className="history-row__link" to={target}>
        <CoverImage className="history-row__cover" src={drama.coverUrl} alt={drama.title} />
        <div className="history-row__body">
          <h2 className="history-row__title">{drama.title}</h2>
          <p className="history-row__resume" data-testid="history-resume">
            {translate('feed.resume', undefined, { n: entry.lastEpisodeNumber })}
          </p>
          <p className="history-row__meta">
            {translate('feed.episodeCount', undefined, { n: drama.totalEpisodes })}
          </p>
        </div>
      </Link>
    </li>
  );
}
