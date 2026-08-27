import { createContext, useContext } from 'react';

import type { SearchApi } from './search-api';

/**
 * How a surface reaches search.
 *
 * The same arrangement as `catalog-api-context`, and separate from it for the same reason the
 * interfaces are separate: they are two modules on the server and two seams here, so a screen that
 * only searches does not have to be handed a catalogue client it never calls.
 *
 * No default value. A screen rendered without a provider is a wiring bug, and a loud failure at the
 * first render is cheaper than a silent one that shows an error state in production because nobody
 * supplied the client.
 */
const SearchApiContext = createContext<SearchApi | null>(null);

export interface SearchApiProviderProps {
  readonly api: SearchApi;
  readonly children: React.ReactNode;
}

export function SearchApiProvider({ api, children }: SearchApiProviderProps): React.JSX.Element {
  return <SearchApiContext.Provider value={api}>{children}</SearchApiContext.Provider>;
}

export function useSearchApi(): SearchApi {
  const api = useContext(SearchApiContext);
  if (api === null) {
    throw new Error('useSearchApi requires a <SearchApiProvider> above it');
  }
  return api;
}
