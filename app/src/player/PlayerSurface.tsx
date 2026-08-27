import { useEffect, useRef, useState } from 'react';
import type { PlaybackDescriptor } from '@minidrama/shared';

import { createPlayerFacade } from './player-facade';
import type { PlatformBridge } from '../platform/types';
import type { PlayerFacade } from './player-facade';

export interface PlayerSurfaceProps {
  readonly bridge: PlatformBridge;
  readonly descriptor: PlaybackDescriptor;
}

type SurfaceState = 'loading' | 'playing' | 'unavailable';

/**
 * Hands a container element to a foreign renderer and tears it down deterministically.
 *
 * One effect, one cleanup. React never renders into the container after the player takes it, and
 * the player is never recreated by a re-render — only by a descriptor change.
 */
export function PlayerSurface({ bridge, descriptor }: PlayerSurfaceProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<SurfaceState>('loading');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let facade: PlayerFacade | null = null;
    let cancelled = false;

    void createPlayerFacade(bridge, { container, descriptor }).then((result) => {
      if (cancelled) {
        // The effect was cleaned up while the player was being constructed. Destroy immediately,
        // or the instance leaks with no reference to it.
        if (result.ok) {
          result.value.destroy();
        }
        return;
      }
      if (result.ok) {
        facade = result.value;
        setState('playing');
      } else {
        setState('unavailable');
      }
    });

    return () => {
      cancelled = true;
      facade?.destroy();
      facade = null;
    };
  }, [bridge, descriptor]);

  return (
    <section className="player-surface" data-testid="player-surface" data-state={state}>
      <div ref={containerRef} data-testid="player-container" className="player-surface__mount" />
      {state === 'unavailable' ? (
        <p role="alert" data-testid="player-unavailable">
          Playback is unavailable right now. Please try again.
        </p>
      ) : null}
    </section>
  );
}
