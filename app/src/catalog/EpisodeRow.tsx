import { Link } from 'react-router';
import type { EpisodeItem } from '@minidrama/shared';

import { playPath } from '../routes/routes';
import { presentEpisodeAccess } from './access-presentation';
import { translate } from '../core/i18n';
import type { EpisodeAction, PurchaseCapabilities } from './access-presentation';
import type { TranslationKey } from '../core/i18n';

/**
 * One row of the episode list.
 *
 * The row is where the access states become visibly different things, so the mapping from action to
 * copy is a table rather than a chain of conditions — a chain is how two states end up sharing a
 * string and becoming one state in the user's mind.
 */
const ACTION_LABEL_KEYS: Readonly<Record<EpisodeAction, TranslationKey>> = {
  PLAY: 'episode.play',
  UNLOCK: 'episode.unlock',
  SUBSCRIBE: 'episode.subscribe',
  PURCHASE_BLOCKED: 'episode.purchaseBlocked',
  UNAVAILABLE: 'episode.unavailable',
};

/** Which actions are an offer to buy something. Only these ever get a call to action. */
const PURCHASE_ACTIONS: readonly EpisodeAction[] = ['UNLOCK', 'SUBSCRIBE'];

export interface EpisodeRowProps {
  readonly episode: EpisodeItem;
  readonly capabilities: PurchaseCapabilities;
  /**
   * The seam for the unlock panel (PNL-02), which belongs to the entitlement slot and does not
   * exist yet. While it is absent the call to action renders disabled and says so, because the
   * alternative — an enabled button that does nothing — is the single most damaging thing a
   * purchase surface can do.
   */
  readonly onUnlockRequested?: (episode: EpisodeItem) => void;
}

export function EpisodeRow({
  episode,
  capabilities,
  onUnlockRequested,
}: EpisodeRowProps): React.JSX.Element {
  const presentation = presentEpisodeAccess(episode.viewerAccess, capabilities);
  const label = translate(ACTION_LABEL_KEYS[presentation.action]);
  const offersPurchase = PURCHASE_ACTIONS.includes(presentation.action);

  return (
    <li
      className={`episode-row${presentation.locked ? ' episode-row--locked' : ''}`}
      data-testid="episode-row"
      data-episode-id={episode.id}
      data-action={presentation.action}
      data-access-reason={episode.viewerAccess.reason}
    >
      <span className="episode-row__number">
        {translate('drama.episodeLabel', undefined, { n: episode.globalEpisodeNumber })}
      </span>
      {episode.title === null ? null : <span className="episode-row__title">{episode.title}</span>}
      <span className="episode-row__duration">{formatDuration(episode.durationSec)}</span>

      {presentation.showsPrice && episode.priceCoins !== null ? (
        <span className="episode-row__price" data-testid="episode-price">
          {translate('episode.price', undefined, { n: episode.priceCoins })}
        </span>
      ) : null}

      {presentation.navigable ? (
        <Link
          className="episode-row__action"
          data-testid="episode-action"
          to={playPath(episode.id)}
        >
          {label}
        </Link>
      ) : offersPurchase ? (
        <button
          className="episode-row__action"
          data-testid="episode-action"
          type="button"
          disabled={onUnlockRequested === undefined}
          title={onUnlockRequested === undefined ? translate('episode.unlockPending') : undefined}
          onClick={() => {
            onUnlockRequested?.(episode);
          }}
        >
          {label}
        </button>
      ) : (
        // Not an offer and not a destination. A blocked or unavailable episode gets a statement,
        // not a control: anything pressable here would either take money we cannot take or open a
        // player that cannot play.
        <span
          className="episode-row__action episode-row__action--inert"
          data-testid="episode-action"
        >
          {label}
        </span>
      )}
    </li>
  );
}

/** `m:ss`. Episodes are 60–120 seconds, so hours are not a case worth carrying. */
export function formatDuration(durationSec: number): string {
  const safe = Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}
