import { Link, useParams } from 'react-router';
import { useMemo } from 'react';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { PlayerSurface } from '../player/PlayerSurface';
import { ROUTES, playPath } from './routes';
import { translate } from '../core/i18n';
import type { PlatformBridge } from '../platform/types';

/**
 * SCR-05, the player screen.
 *
 * The screen owns the *queue*; the player owns playback. Tapping "next episode" changes the route,
 * the route changes which entry of the album is current, and the surface advances the retained
 * instance to it (`docs/architecture/system-overview.md` §5.3, "one player instance per feed page;
 * switch with `playNext()`"). Nothing here destroys or rebuilds a player.
 *
 * The album itself is still the Wave 1 placeholder, widened from one episode to an ordered set so
 * that switching exists at all. `POST /v1/playback/sessions` replaces it: that endpoint is where
 * the entitlement gate lives and where a real `vid` comes from, one episode at a time. The shape is
 * already the real one (correction A4) — identifiers, never a media URL.
 */

const DEMO_ALBUM_ID = 'album_demo_0001';
const DEMO_EPISODE_COUNT = 6;

function demoEpisodeId(episodeNumber: number): string {
  return `ep_demo_${String(episodeNumber).padStart(4, '0')}`;
}

function demoPlaylist(): readonly PlaybackDescriptor[] {
  return Array.from({ length: DEMO_EPISODE_COUNT }, (_unused, index) => ({
    albumId: DEMO_ALBUM_ID,
    episodeId: demoEpisodeId(index + 1),
    vid: `vid_demo_${String(index + 1).padStart(4, '0')}`,
    resumePositionSec: 0,
  }));
}

export interface PlayPageProps {
  readonly bridge: PlatformBridge;
}

export function PlayPage({ bridge }: PlayPageProps): React.JSX.Element {
  const { episodeId = demoEpisodeId(1) } = useParams();

  /**
   * Memoized because the surface treats a new playlist as a new album and rebuilds the player for
   * it. Rebuilding on every render is precisely the bug this slot removed, so the array that would
   * cause it is not built on every render.
   */
  const playlist = useMemo(demoPlaylist, []);

  const index = playlist.findIndex((entry) => entry.episodeId === episodeId);
  /**
   * An unknown episode id opens the album at its first episode rather than an error screen. Which
   * episode a deep link names is a question for the playback session (`docs/02-information-
   * architecture.md` §5: the drama is looked up from the episode), and until that endpoint exists
   * this screen has no way to tell "withdrawn" from "not in the demo album".
   */
  const current = playlist[index === -1 ? 0 : index];
  const next = index === -1 ? undefined : playlist[index + 1];

  return (
    <main className="page page--play" data-testid="play-page" data-episode-id={current?.episodeId}>
      <Link className="page__back" to={ROUTES.home}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('player.heading')}</h1>
      <PlayerSurface
        bridge={bridge}
        playlist={playlist}
        episodeId={current?.episodeId ?? episodeId}
      />
      <p className="player-meta" data-testid="player-episode-label">
        {translate('drama.episodeLabel', undefined, {
          n: (index === -1 ? 0 : index) + 1,
        })}
      </p>
      {next === undefined ? (
        <p className="player-meta" data-testid="player-queue-end">
          {translate('player.lastEpisode')}
        </p>
      ) : (
        /*
         * A link, and a replacing one. The episode is route state so that a deep link and a back
         * navigation both land on the episode the viewer was actually watching; `replace` because
         * inside a WebView the back gesture is also how the viewer leaves the mini app, and one
         * history entry per episode makes leaving a forty-episode drama a forty-press exercise.
         */
        <Link
          className="player-next"
          data-testid="player-next"
          replace
          to={playPath(next.episodeId)}
        >
          {translate('player.nextEpisode')}
        </Link>
      )}
    </main>
  );
}
