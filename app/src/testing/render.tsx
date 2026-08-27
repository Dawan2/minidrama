import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { CatalogApiProvider } from '../data/catalog-api-context';
import { SearchApiProvider } from '../data/search-api-context';
import { stubCatalogApi } from './catalog-fixtures';
import { stubSearchApi } from './search-fixtures';
import type { CatalogApi } from '../data/catalog-api';
import type { SearchApi } from '../data/search-api';

/**
 * Renders a surface with the things every surface needs: a router, because every state offers a way
 * out and a `<Link>` outside a router throws, and the API clients.
 *
 * Both clients default to an unscripted stub, so a test supplies only the one its screen actually
 * calls. Leaving the other out entirely would be tidier and would also mean that a screen which
 * grew a second read failed at the context guard rather than at the assertion that matters.
 *
 * `MemoryRouter` rather than `HashRouter`: the paths under test are the ones in `ROUTES`, and the
 * hash is a deployment constraint (a static ZIP cannot rewrite paths) rather than a property of any
 * screen. `routes.test.ts` covers the path shapes themselves.
 *
 * Test-only, like everything in this directory — `import-hygiene.test.ts` keeps it out of the
 * bundle.
 */
export interface RenderSurfaceOptions {
  readonly api?: CatalogApi;
  readonly search?: SearchApi;
  readonly path?: string;
}

export function renderSurface(
  element: React.ReactNode,
  options: RenderSurfaceOptions = {},
): RenderResult {
  return render(
    <CatalogApiProvider api={options.api ?? stubCatalogApi()}>
      <SearchApiProvider api={options.search ?? stubSearchApi()}>
        <MemoryRouter initialEntries={[options.path ?? '/']}>{element}</MemoryRouter>
      </SearchApiProvider>
    </CatalogApiProvider>,
  );
}
