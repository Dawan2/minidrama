import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { CatalogApiProvider } from '../data/catalog-api-context';
import type { CatalogApi } from '../data/catalog-api';

/**
 * Renders a surface with the two things every surface in this slot needs: a router, because every
 * state offers a way out and a `<Link>` outside a router throws, and a catalogue client.
 *
 * `MemoryRouter` rather than `HashRouter`: the paths under test are the ones in `ROUTES`, and the
 * hash is a deployment constraint (a static ZIP cannot rewrite paths) rather than a property of any
 * screen. `routes.test.ts` covers the path shapes themselves.
 *
 * Test-only, like everything in this directory — `import-hygiene.test.ts` keeps it out of the
 * bundle.
 */
export interface RenderSurfaceOptions {
  readonly api: CatalogApi;
  readonly path?: string;
}

export function renderSurface(
  element: React.ReactNode,
  options: RenderSurfaceOptions,
): RenderResult {
  return render(
    <CatalogApiProvider api={options.api}>
      <MemoryRouter initialEntries={[options.path ?? '/']}>{element}</MemoryRouter>
    </CatalogApiProvider>,
  );
}
