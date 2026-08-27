import { createContext, useContext } from 'react';

import type { MeApi } from './me-api';

/**
 * How a surface reaches the current-user identity. Same shape as the other API providers: a
 * context so a test can substitute the client without module mocking, and no default value.
 *
 * The missing default matters here the way it does for the wallet. A default that answered a
 * nickname of `"You"` or echoed the session `openId` as a display name is indistinguishable from
 * a real profile, and a default that answered a VIP object would quote a subscription this
 * product does not have. Throwing is cheaper than either lie.
 */
const MeApiContext = createContext<MeApi | null>(null);

export interface MeApiProviderProps {
  readonly api: MeApi;
  readonly children: React.ReactNode;
}

export function MeApiProvider({ api, children }: MeApiProviderProps): React.JSX.Element {
  return <MeApiContext.Provider value={api}>{children}</MeApiContext.Provider>;
}

export function useMeApi(): MeApi {
  const api = useContext(MeApiContext);
  if (api === null) {
    throw new Error('useMeApi requires a <MeApiProvider> above it');
  }
  return api;
}
