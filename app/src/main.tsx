import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';

import { App } from './App';
import { createBridge } from './platform/create-bridge';
import { DEFAULT_LOCALE, isRtl } from './core/i18n';

/**
 * Boot entry point.
 *
 * The sequence in `docs/architecture/system-overview.md` §3.1 is serial by design: nothing
 * business-facing renders on a half-initialized runtime. Wave 1 wires the first two steps —
 * bridge selection and `init` — and leaves login, `/config` and deep-link resolution as the
 * Wave 2 continuation, marked below so the order is not reinvented.
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

  document.documentElement.lang = DEFAULT_LOCALE;
  document.documentElement.dir = isRtl(DEFAULT_LOCALE) ? 'rtl' : 'ltr';

  createRoot(container).render(
    <StrictMode>
      <HashRouter>
        <App bridge={bridge} />
      </HashRouter>
    </StrictMode>,
  );
}

void boot();
