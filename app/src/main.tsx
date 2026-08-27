import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';

import './styles/app.css';
import { App } from './App';
import { CatalogApiProvider } from './data/catalog-api-context';
import { createBridge } from './platform/create-bridge';
import { createCatalogApi } from './data/catalog-api';
import { createHttpClient } from './data/http';
import { createSearchApi } from './data/search-api';
import { SearchApiProvider } from './data/search-api-context';
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

  // Two clients over one transport. The timeout, the single retry and the envelope parsing are
  // properties of talking to this API, not of talking to the catalogue, so they are configured once.
  const api = createCatalogApi(http);
  const search = createSearchApi(http);

  document.documentElement.lang = DEFAULT_LOCALE;
  document.documentElement.dir = isRtl(DEFAULT_LOCALE) ? 'rtl' : 'ltr';

  createRoot(container).render(
    <StrictMode>
      <CatalogApiProvider api={api}>
        <SearchApiProvider api={search}>
          <HashRouter>
            <App bridge={bridge} />
          </HashRouter>
        </SearchApiProvider>
      </CatalogApiProvider>
    </StrictMode>,
  );
}

void boot();
