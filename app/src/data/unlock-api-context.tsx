import { createContext, useContext } from 'react';

import type { UnlockApi } from './unlock-api';

/**
 * How a surface reaches the unlock orders, on the same terms as `catalog-api-context.tsx`: a
 * context rather than a module singleton, and no default value.
 *
 * The missing default matters more here than it does for the catalogue. A screen rendered without
 * a catalogue provider shows an error state; a purchase surface with a silently defaulted client
 * would render a live "Unlock" button wired to nothing, which is the one failure this whole slot
 * exists to avoid. `useUnlockApi` throwing is the loud version of that bug.
 */
const UnlockApiContext = createContext<UnlockApi | null>(null);

export interface UnlockApiProviderProps {
  readonly api: UnlockApi;
  readonly children: React.ReactNode;
}

export function UnlockApiProvider({ api, children }: UnlockApiProviderProps): React.JSX.Element {
  return <UnlockApiContext.Provider value={api}>{children}</UnlockApiContext.Provider>;
}

export function useUnlockApi(): UnlockApi {
  const api = useContext(UnlockApiContext);
  if (api === null) {
    throw new Error('useUnlockApi requires an <UnlockApiProvider> above it');
  }
  return api;
}
