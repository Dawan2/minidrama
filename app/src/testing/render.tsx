import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { CatalogApiProvider } from '../data/catalog-api-context';
import { stubUnlockApi } from './unlock-fixtures';
import { UnlockApiProvider } from '../data/unlock-api-context';
import type { CatalogApi } from '../data/catalog-api';
import type { UnlockApi } from '../data/unlock-api';

/**
 * Renders a surface with the things every surface in this slot needs: a router, because every state
 * offers a way out and a `<Link>` outside a router throws, and the two API clients.
 *
 * `MemoryRouter` rather than `HashRouter`: the paths under test are the ones in `ROUTES`, and the
 * hash is a deployment constraint (a static ZIP cannot rewrite paths) rather than a property of any
 * screen. `routes.test.ts` covers the path shapes themselves.
 *
 * The unlock client defaults to a stub that answers nothing, so a test that does not mention
 * purchases still renders — and a test that unexpectedly *starts* one gets a failure rather than a
 * network call.
 *
 * Test-only, like everything in this directory — `import-hygiene.test.ts` keeps it out of the
 * bundle.
 */
export interface RenderSurfaceOptions {
  readonly api: CatalogApi;
  readonly unlockApi?: UnlockApi;
  readonly path?: string;
}

export function renderSurface(
  element: React.ReactNode,
  options: RenderSurfaceOptions,
): RenderResult {
  return render(
    <CatalogApiProvider api={options.api}>
      <UnlockApiProvider api={options.unlockApi ?? stubUnlockApi()}>
        <MemoryRouter initialEntries={[options.path ?? '/']}>{element}</MemoryRouter>
      </UnlockApiProvider>
    </CatalogApiProvider>,
  );
}
