import { MemoryRouter } from 'react-router';
import { act, render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { CatalogApiProvider } from '../data/catalog-api-context';
import { FavoritesApiProvider } from '../data/favorites-api-context';
import { HistoryApiProvider } from '../data/history-api-context';
import { PlaybackApiProvider } from '../data/playback-api-context';
import { ProgressApiProvider } from '../data/progress-api-context';
import { SearchApiProvider } from '../data/search-api-context';
import { SessionProvider } from '../auth/session-context';
import { UnlockApiProvider } from '../data/unlock-api-context';
import { WalletApiProvider } from '../data/wallet-api-context';
import { stubCatalogApi } from './catalog-fixtures';
import { stubFavoritesApi } from './favorites-fixtures';
import { stubHistoryApi, stubSession } from './history-fixtures';
import { stubPlaybackApi } from './playback-fixtures';
import { stubProgressApi } from './progress-fixtures';
import { stubSearchApi } from './search-fixtures';
import { stubUnlockApi } from './unlock-fixtures';
import { stubWalletApi } from './wallet-fixtures';
import type { CatalogApi } from '../data/catalog-api';
import type { FavoritesApi } from '../data/favorites-api';
import type { HistoryApi } from '../data/history-api';
import type { PlaybackApi } from '../data/playback-api';
import type { ProgressApi } from '../data/progress-api';
import type { SearchApi } from '../data/search-api';
import type { Session } from '../auth/session';
import type { UnlockApi } from '../data/unlock-api';
import type { WalletApi } from '../data/wallet-api';

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
  readonly favoritesApi?: FavoritesApi;
  readonly unlockApi?: UnlockApi;
  readonly walletApi?: WalletApi;
  readonly progressApi?: ProgressApi;
  readonly playbackApi?: PlaybackApi;
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
            <FavoritesApiProvider api={options.favoritesApi ?? stubFavoritesApi()}>
              <UnlockApiProvider api={options.unlockApi ?? stubUnlockApi()}>
                <WalletApiProvider api={options.walletApi ?? stubWalletApi()}>
                  <ProgressApiProvider api={options.progressApi ?? stubProgressApi()}>
                    <PlaybackApiProvider api={options.playbackApi ?? stubPlaybackApi()}>
                      <MemoryRouter initialEntries={[options.path ?? '/']}>{element}</MemoryRouter>
                    </PlaybackApiProvider>
                  </ProgressApiProvider>
                </WalletApiProvider>
              </UnlockApiProvider>
            </FavoritesApiProvider>
          </HistoryApiProvider>
        </SearchApiProvider>
      </CatalogApiProvider>
    </SessionProvider>,
  );
}

/**
 * `renderSurface` plus a flush of React's work loop. Pair with `settle` for a test that needs two
 * rounds of a stub: the first page has to land before the click target exists, and the append has
 * to land before the assertion. `findBy*` and `waitFor` are the same wall-clock budget
 * (`asyncUtilTimeout`, 1000 ms); stacking them is the flake class
 * `docs/handoff/w9-work-homepage-flake.md` closed for one test. `act` returns when React has run
 * out of work rather than when a timer says so, which starvation delays but cannot break.
 *
 * One-round tests keep `findBy*` — that idiom reads better and is not this class of exposure.
 */
export async function renderSettled(
  element: React.ReactNode,
  options: RenderSurfaceOptions = {},
): Promise<RenderResult> {
  return settle(() => renderSurface(element, options));
}

/**
 * Run `work` inside `act` and wait until React is idle. The click that starts the second stub
 * round belongs here, so no `getBy*` in a two-round test runs before the state it reads has been
 * committed.
 */
export async function settle<T>(work: () => T | Promise<T>): Promise<T> {
  let result!: T;
  await act(async () => {
    result = await work();
  });
  return result;
}
