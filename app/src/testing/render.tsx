import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { CatalogApiProvider } from '../data/catalog-api-context';
import { HistoryApiProvider } from '../data/history-api-context';
import { SearchApiProvider } from '../data/search-api-context';
import { SessionProvider } from '../auth/session-context';
import { UnlockApiProvider } from '../data/unlock-api-context';
import { stubCatalogApi } from './catalog-fixtures';
import { stubHistoryApi, stubSession } from './history-fixtures';
import { stubSearchApi } from './search-fixtures';
import { stubUnlockApi } from './unlock-fixtures';
import type { CatalogApi } from '../data/catalog-api';
import type { HistoryApi } from '../data/history-api';
import type { SearchApi } from '../data/search-api';
import type { Session } from '../auth/session';
import type { UnlockApi } from '../data/unlock-api';

/**
 * Renders a surface with the things every surface needs: a router, because every state offers a way
 * out and a `<Link>` outside a router throws, and the API clients and session the screens resolve
 * from context.
 *
 * Each dependency defaults to a stub so a test supplies only the one it is about. That is not
 * convenience — a profile test that had to script a feed response would be asserting on a
 * dependency it does not use, and the day the feed's shape changes that test would fail for a
 * reason that has nothing to do with the profile screen. Leaving the others out entirely would be
 * tidier and would also mean that a screen which grew a second read failed at the context guard
 * rather than at the assertion that matters.
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
  readonly api?: CatalogApi;
  readonly search?: SearchApi;
  readonly historyApi?: HistoryApi;
  readonly unlockApi?: UnlockApi;
  readonly session?: Session;
  readonly path?: string;
}

export function renderSurface(
  element: React.ReactNode,
  options: RenderSurfaceOptions = {},
): RenderResult {
  return render(
    <SessionProvider session={options.session ?? stubSession()}>
      <CatalogApiProvider api={options.api ?? stubCatalogApi()}>
        <SearchApiProvider api={options.search ?? stubSearchApi()}>
          <HistoryApiProvider api={options.historyApi ?? stubHistoryApi()}>
            <UnlockApiProvider api={options.unlockApi ?? stubUnlockApi()}>
              <MemoryRouter initialEntries={[options.path ?? '/']}>{element}</MemoryRouter>
            </UnlockApiProvider>
          </HistoryApiProvider>
        </SearchApiProvider>
      </CatalogApiProvider>
    </SessionProvider>,
  );
}
