import { createContext, useContext } from 'react';

import type { WalletApi } from './wallet-api';

/**
 * How a surface reaches the wallet. Same shape as the other API providers: a context so a test
 * can substitute the client without module mocking, and no default value.
 *
 * The missing default matters here the way it does for favourites. A default that answered
 * `{ kind: 'KNOWN', totalBalance: 0 }` is indistinguishable from a real empty wallet, and a
 * viewer who has recharged and sees that number will not believe the next one. A default that
 * answered `UNAVAILABLE` would hide a wiring bug behind the honest empty state. Throwing is
 * cheaper than either lie.
 */
const WalletApiContext = createContext<WalletApi | null>(null);

export interface WalletApiProviderProps {
  readonly api: WalletApi;
  readonly children: React.ReactNode;
}

export function WalletApiProvider({ api, children }: WalletApiProviderProps): React.JSX.Element {
  return <WalletApiContext.Provider value={api}>{children}</WalletApiContext.Provider>;
}

export function useWalletApi(): WalletApi {
  const api = useContext(WalletApiContext);
  if (api === null) {
    throw new Error('useWalletApi requires a <WalletApiProvider> above it');
  }
  return api;
}
