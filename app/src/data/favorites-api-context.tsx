import { createContext, useContext } from 'react';

import type { FavoritesApi } from './favorites-api';

/**
 * How a surface reaches the favourite endpoints. Same shape and same reasoning as
 * `HistoryApiProvider`: a context so a test can substitute the client without module mocking, and no
 * default value, so a screen rendered with no provider above it fails loudly instead of rendering an
 * empty favourites list nobody can explain.
 *
 * A default that answered "you follow nothing" would be the tempting alternative and it is the worst
 * of the options: it is indistinguishable from a correct empty list, on the one screen whose entire
 * job is to distinguish an empty list from a list we could not read.
 */
const FavoritesApiContext = createContext<FavoritesApi | null>(null);

export interface FavoritesApiProviderProps {
  readonly api: FavoritesApi;
  readonly children: React.ReactNode;
}

export function FavoritesApiProvider({
  api,
  children,
}: FavoritesApiProviderProps): React.JSX.Element {
  return <FavoritesApiContext.Provider value={api}>{children}</FavoritesApiContext.Provider>;
}

export function useFavoritesApi(): FavoritesApi {
  const api = useContext(FavoritesApiContext);
  if (api === null) {
    throw new Error('useFavoritesApi requires a <FavoritesApiProvider> above it');
  }
  return api;
}
