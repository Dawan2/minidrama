import { createContext, useContext } from 'react';

import type { ProgressApi } from './progress-api';

/**
 * How a surface reaches per-drama progress. Same shape as the other API providers: a context so
 * a test can substitute the client without module mocking, and no default value.
 *
 * A default that answered `{ items: [], lastWatched: null }` is indistinguishable from a real
 * empty watch, and the picker would paint no marks for a viewer who had finished twenty episodes.
 * Throwing is cheaper than that lie.
 */
const ProgressApiContext = createContext<ProgressApi | null>(null);

export interface ProgressApiProviderProps {
  readonly api: ProgressApi;
  readonly children: React.ReactNode;
}

export function ProgressApiProvider({
  api,
  children,
}: ProgressApiProviderProps): React.JSX.Element {
  return <ProgressApiContext.Provider value={api}>{children}</ProgressApiContext.Provider>;
}

export function useProgressApi(): ProgressApi {
  const api = useContext(ProgressApiContext);
  if (api === null) {
    throw new Error('useProgressApi requires a <ProgressApiProvider> above it');
  }
  return api;
}
