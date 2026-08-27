import { createContext, useContext } from 'react';

import type { PlaybackApi } from './playback-api';

/**
 * How the player screen reaches session issuance. Same shape as the other API providers: a
 * context so a test can substitute the client without module mocking, and no default value.
 *
 * A default that minted `ep_demo_*` descriptors is the defect this slot exists to close. A
 * default that answered a lock would hide a wiring bug behind the unlock overlay. Throwing is
 * cheaper than either.
 */
const PlaybackApiContext = createContext<PlaybackApi | null>(null);

export interface PlaybackApiProviderProps {
  readonly api: PlaybackApi;
  readonly children: React.ReactNode;
}

export function PlaybackApiProvider({
  api,
  children,
}: PlaybackApiProviderProps): React.JSX.Element {
  return <PlaybackApiContext.Provider value={api}>{children}</PlaybackApiContext.Provider>;
}

export function usePlaybackApi(): PlaybackApi {
  const api = useContext(PlaybackApiContext);
  if (api === null) {
    throw new Error('usePlaybackApi requires a <PlaybackApiProvider> above it');
  }
  return api;
}
