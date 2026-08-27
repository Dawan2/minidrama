import { useParams } from 'react-router';

import { PlayerSurface } from '../player/PlayerSurface';
import { translate } from '../core/i18n';
import type { PlatformBridge } from '../platform/types';
import type { PlaybackDescriptor } from '@minidrama/shared';

export interface PlayPageProps {
  readonly bridge: PlatformBridge;
}

export function PlayPage({ bridge }: PlayPageProps): React.JSX.Element {
  const { episodeId = 'ep_demo_0001' } = useParams();

  // Wave 2 replaces this with `POST /v1/playback/sessions`, which is where the entitlement gate
  // lives. The shape is already the real one (correction A4): identifiers, never a media URL.
  const descriptor: PlaybackDescriptor = {
    albumId: 'album_demo_0001',
    episodeId,
    vid: 'vid_demo_0001',
    resumePositionSec: 0,
  };

  return (
    <main data-testid="play-page">
      <h1>{translate('player.heading')}</h1>
      <PlayerSurface bridge={bridge} descriptor={descriptor} />
    </main>
  );
}
