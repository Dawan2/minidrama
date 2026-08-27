import { useEffect, useRef, useState } from 'react';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { createPlayerFacade } from './player-facade';
import { translate } from '../core/i18n';
import type { PlatformBridge } from '../platform/types';
import type { PlayerFacade } from './player-facade';

export interface PlayerSurfaceProps {
  readonly bridge: PlatformBridge;
  /**
   * The album in viewing order. Referentially stable per album: it is what the player is given as
   * its preload list, so a new array on every render would be a new player on every render.
   */
  readonly playlist: readonly PlaybackDescriptor[];
  /** Which entry is on screen. A change here is an episode switch, not a new player. */
  readonly episodeId: string;
}

type SurfaceState = 'loading' | 'playing' | 'unavailable';

/**
 * Hands a container element to a foreign renderer and tears it down deterministically.
 *
 * One effect creates the player and one cleanup destroys it. React never renders into the
 * container after the player takes it, and — the part that matters — **the episode is not one of
 * that effect's dependencies**. Moving to the next episode goes through `switchToEpisode`, which
 * advances the retained instance; only an episode the instance cannot reach from where it is
 * rebuilds one, and rebuilding is an explicit generation bump rather than a re-render side effect.
 *
 * Keeping the descriptor in the dependency list, as this component did before, made every render
 * that produced a new descriptor object a full destroy-and-rebuild — invisible in a screenshot,
 * and exactly the cold first frame the preload module exists to prevent.
 */
export function PlayerSurface({
  bridge,
  playlist,
  episodeId,
}: PlayerSurfaceProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const facadeRef = useRef<PlayerFacade | null>(null);
  /** The episode the route wants, readable from the create effect without becoming a dependency. */
  const wantedEpisodeRef = useRef(episodeId);
  const [state, setState] = useState<SurfaceState>('loading');
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const startIndex = playlist.findIndex((entry) => entry.episodeId === wantedEpisodeRef.current);
    const descriptor = playlist[startIndex === -1 ? 0 : startIndex];
    if (descriptor === undefined) {
      // Nothing to play is not a player failure, but it degrades to the same screen: one surface,
      // one degraded state, and a message that offers a way on rather than an empty black frame.
      setState('unavailable');
      return;
    }

    let facade: PlayerFacade | null = null;
    let cancelled = false;

    void createPlayerFacade(bridge, {
      container,
      descriptor,
      upNext: playlist.slice((startIndex === -1 ? 0 : startIndex) + 1),
    }).then((result) => {
      if (cancelled) {
        // The effect was cleaned up while the player was being constructed. Destroy immediately,
        // or the instance leaks with no reference to it.
        if (result.ok) {
          result.value.destroy();
        }
        return;
      }
      if (!result.ok) {
        setState('unavailable');
        return;
      }
      facade = result.value;
      facadeRef.current = result.value;
      setState('playing');
      // The route can move while the player is being built, and the switch effect below found no
      // facade to talk to when it did. This is that reconciliation, not a duplicate of it.
      if (result.value.switchToEpisode(wantedEpisodeRef.current) === 'OUT_OF_REACH') {
        setGeneration((current) => current + 1);
      }
    });

    return () => {
      cancelled = true;
      facade?.destroy();
      facade = null;
      facadeRef.current = null;
    };
  }, [bridge, playlist, generation]);

  useEffect(() => {
    wantedEpisodeRef.current = episodeId;
    const facade = facadeRef.current;
    if (facade === null) {
      return;
    }
    if (facade.switchToEpisode(episodeId) === 'OUT_OF_REACH') {
      setGeneration((current) => current + 1);
    }
  }, [episodeId]);

  return (
    <section
      className="player-surface"
      data-testid="player-surface"
      data-state={state}
      data-episode-id={episodeId}
    >
      <div ref={containerRef} data-testid="player-container" className="player-surface__mount" />
      {state === 'unavailable' ? (
        <p role="alert" data-testid="player-unavailable">
          {translate('player.unavailable')}
        </p>
      ) : null}
    </section>
  );
}
