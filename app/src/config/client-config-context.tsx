import { createContext, useContext } from 'react';
import type { ConfigView } from '@minidrama/shared';

/**
 * How a surface reaches the boot configuration. A snapshot, not a client: boot fetches once
 * (`GET /v1/config` or the conservative fallback) and the tree reads that value. A default
 * that answered `comments: true` would render an entry whose endpoints do not exist (`C4-04`).
 * Throwing is cheaper than that lie.
 */
const ClientConfigContext = createContext<ConfigView | null>(null);

export interface ClientConfigProviderProps {
  readonly config: ConfigView;
  readonly children: React.ReactNode;
}

export function ClientConfigProvider({
  config,
  children,
}: ClientConfigProviderProps): React.JSX.Element {
  return <ClientConfigContext.Provider value={config}>{children}</ClientConfigContext.Provider>;
}

export function useClientConfig(): ConfigView {
  const config = useContext(ClientConfigContext);
  if (config === null) {
    throw new Error('useClientConfig requires a <ClientConfigProvider> above it');
  }
  return config;
}
