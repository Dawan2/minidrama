import type { DramaDetail, Result } from '@minidrama/shared';

import { CoverImage } from '../components/CoverImage';
import { translate } from '../core/i18n';
import type { ApiFailure } from '../data/failure';

/**
 * S6 locked chrome (`docs/02-screen-inventory.md` SCR-05, player-state-machine §3.1).
 *
 * The commercial gate refused this play. VePlayer is not constructed — a competing pause
 * control would fight AC-PL-6, and a demo album would play a catalogue id the server
 * refused (D-16). Cover + lock mark sit under PNL-02. A missing or refused cover is
 * CoverImage's placeholder: no invented CDN host, no `<img>` beside the allowlist.
 *
 * Recharge stays off (C4-06). Ads stay behind `features.adUnlock`. This module does
 * not open a channel, invent `playbackRate`, or name a BytePlus `vid`.
 */

export interface LockedPoster {
  readonly coverUrl: string | null;
  readonly title: string;
}

export const EMPTY_LOCKED_POSTER: LockedPoster = { coverUrl: null, title: '' };

export function posterFromDrama(result: Result<DramaDetail, ApiFailure>): LockedPoster {
  if (!result.ok) {
    return EMPTY_LOCKED_POSTER;
  }
  return { coverUrl: result.value.coverUrl, title: result.value.title };
}

export interface LockedChromeProps {
  readonly coverUrl: string | null;
  readonly title: string;
}

export function LockedChrome({ coverUrl, title }: LockedChromeProps): React.JSX.Element {
  const label = title === '' ? translate('player.heading') : title;
  return (
    <div className="player-locked" data-testid="player-locked">
      <CoverImage className="player-locked__cover" src={coverUrl} alt={label} />
      <span className="player-locked__mark" data-testid="player-locked-mark">
        {translate('player.locked')}
      </span>
    </div>
  );
}
