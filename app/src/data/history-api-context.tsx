import { createContext, useContext } from 'react';

import type { HistoryApi } from './history-api';

/**
 * How a surface reaches the watch history. Same shape and same reasoning as
 * `CatalogApiProvider`: a context so a test can substitute the client without module mocking, and
 * no default value so a missing provider fails loudly instead of rendering an error state nobody
 * can explain.
 */
const HistoryApiContext = createContext<HistoryApi | null>(null);

export interface HistoryApiProviderProps {
  readonly api: HistoryApi;
  readonly children: React.ReactNode;
}

export function HistoryApiProvider({ api, children }: HistoryApiProviderProps): React.JSX.Element {
  return <HistoryApiContext.Provider value={api}>{children}</HistoryApiContext.Provider>;
}

export function useHistoryApi(): HistoryApi {
  const api = useContext(HistoryApiContext);
  if (api === null) {
    throw new Error('useHistoryApi requires a <HistoryApiProvider> above it');
  }
  return api;
}
