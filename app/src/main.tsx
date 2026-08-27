import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';

import './styles/app.css';
import { anonymousSession } from './auth/session';
import { App } from './App';
import { CatalogApiProvider } from './data/catalog-api-context';
import { createBridge } from './platform/create-bridge';
import { createCatalogApi } from './data/catalog-api';
import { createFavoritesApi } from './data/favorites-api';
import { createHistoryApi } from './data/history-api';
import { createHttpClient } from './data/http';
import { FavoritesApiProvider } from './data/favorites-api-context';
import { HistoryApiProvider } from './data/history-api-context';
import { SessionProvider } from './auth/session-context';
import { DEFAULT_LOCALE, isRtl } from './core/i18n';

/**
 * Boot entry point.
 *
 * The sequence in `docs/architecture/system-overview.md` §3.1 is serial by design: nothing
 * business-facing renders on a half-initialized runtime. Wave 1 wired bridge selection and `init`;
 * this slot adds the catalogue client and leaves login, `/config` and deep-link resolution as the
 * remaining continuation, marked below so the order is not reinvented.
 */
async function boot(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('#root is missing from index.html');
  }

  const clientKey = import.meta.env['VITE_TIKTOK_CLIENT_KEY'] ?? '';
  const bridge = createBridge(clientKey);
  const initResult = await bridge.init();
  if (!initResult.ok) {
    // W2: a terminal error screen with retry. Nothing downstream is usable without the SDK.
    console.error('[boot] bridge init failed', initResult.error);
  }

  // W2, in this order: capability probe merge → silent login → GET /v1/config → deep-link target.

  /**
   * The catalogue reads are anonymous-capable (`docs/12-api-contracts.md` §2.2), so the client is
   * constructed before login and carries no credentials. When session handling lands it belongs
   * inside this client — one place that attaches the header and one place that refreshes it —
   * rather than at the call sites.
   *
   * A missing base URL is left to fail as a request rather than throwing here: a boot that dies
   * because an environment variable is absent is a white screen, and the retryable error state is
   * a screen with a button on it.
   */
  const http = createHttpClient({
    baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
    fetch: (url, init) => fetch(url, init),
  });
  const api = createCatalogApi(http);

  /**
   * One transport, three clients. The history read and the favourite verbs are session-scoped and
   * the catalogue reads are not, so they are separate interfaces — but they share the timeout, the
   * single automatic retry and the envelope handling, which is the whole reason `http.ts` exists.
   *
   * The `Authorization` header belongs in this client when the identity slot lands: one place that
   * attaches it and one place that refreshes it. Until then these reads are anonymous, and the `401`
   * they earn is what SCR-07 and SCR-08 render as a sign-in prompt.
   */
  const historyApi = createHistoryApi(http);
  const favoritesApi = createFavoritesApi(http);

  /**
   * The session the app boots with. Silent login is the remaining continuation above, so today this
   * is anonymous and `signIn` cannot succeed. Replacing this one value with a stateful session is
   * the whole of the client-side wiring the identity slot needs.
   */
  const session = anonymousSession();

  document.documentElement.lang = DEFAULT_LOCALE;
  document.documentElement.dir = isRtl(DEFAULT_LOCALE) ? 'rtl' : 'ltr';

  createRoot(container).render(
    <StrictMode>
      <SessionProvider session={session}>
        <CatalogApiProvider api={api}>
          <HistoryApiProvider api={historyApi}>
            <FavoritesApiProvider api={favoritesApi}>
              <HashRouter>
                <App bridge={bridge} />
              </HashRouter>
            </FavoritesApiProvider>
          </HistoryApiProvider>
        </CatalogApiProvider>
      </SessionProvider>
    </StrictMode>,
  );
}

void boot();
