import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { CatalogApiProvider } from '../data/catalog-api-context';
import { FavoritesApiProvider } from '../data/favorites-api-context';
import { HistoryApiProvider } from '../data/history-api-context';
import { SessionProvider } from '../auth/session-context';
import { stubCatalogApi } from './catalog-fixtures';
import { stubFavoritesApi } from './favorites-fixtures';
import { stubHistoryApi, stubSession } from './history-fixtures';
import type { CatalogApi } from '../data/catalog-api';
import type { FavoritesApi } from '../data/favorites-api';
import type { HistoryApi } from '../data/history-api';
import type { Session } from '../auth/session';

/**
 * Renders a surface with the things every surface needs: a router, because every state offers a way
 * out and a `<Link>` outside a router throws, and the read clients and session the screens resolve
 * from context.
 *
 * Each dependency defaults to a stub so a test supplies only the one it is about. That is not
 * convenience — a profile test that had to script a feed response would be asserting on a
 * dependency it does not use, and the day the feed's shape changes that test would fail for a
 * reason that has nothing to do with the profile screen.
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
  readonly historyApi?: HistoryApi;
  readonly favoritesApi?: FavoritesApi;
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
        <HistoryApiProvider api={options.historyApi ?? stubHistoryApi()}>
          <FavoritesApiProvider api={options.favoritesApi ?? stubFavoritesApi()}>
            <MemoryRouter initialEntries={[options.path ?? '/']}>{element}</MemoryRouter>
          </FavoritesApiProvider>
        </HistoryApiProvider>
      </CatalogApiProvider>
    </SessionProvider>,
  );
}
