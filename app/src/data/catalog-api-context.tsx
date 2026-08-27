import { createContext, useContext } from 'react';

import type { CatalogApi } from './catalog-api';

/**
 * How a surface reaches the catalogue.
 *
 * A context rather than a module-level singleton: the singleton version cannot be swapped in a
 * test without module mocking, and module mocking is how a suite ends up asserting against the
 * mock instead of the component.
 *
 * There is deliberately no default value. A screen that renders without a provider is a wiring
 * bug, and the loud failure is far cheaper than a silent one that quietly shows an error state in
 * production because nobody supplied the client.
 */
const CatalogApiContext = createContext<CatalogApi | null>(null);

export interface CatalogApiProviderProps {
  readonly api: CatalogApi;
  readonly children: React.ReactNode;
}

export function CatalogApiProvider({ api, children }: CatalogApiProviderProps): React.JSX.Element {
  return <CatalogApiContext.Provider value={api}>{children}</CatalogApiContext.Provider>;
}

export function useCatalogApi(): CatalogApi {
  const api = useContext(CatalogApiContext);
  if (api === null) {
    throw new Error('useCatalogApi requires a <CatalogApiProvider> above it');
  }
  return api;
}
