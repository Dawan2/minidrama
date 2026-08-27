import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';

import './styles/app.css';
import { App } from './App';
import { CatalogApiProvider } from './data/catalog-api-context';
import { createBridge } from './platform/create-bridge';
import { createCatalogApi } from './data/catalog-api';
import { createSessionApi } from './data/session-api';
import { createSessionStore } from './session/session-store';
import { createSilentLogin } from './session/silent-login';
import { createTransports } from './data/transports';
import { createUnlockApi } from './data/unlock-api';
import { DEFAULT_LOCALE, isRtl } from './core/i18n';
import { UnlockApiProvider } from './data/unlock-api-context';

/**
 * Boot entry point.
 *
 * The sequence in `docs/architecture/system-overview.md` §3.1 is serial by design: nothing
 * business-facing renders on a half-initialized runtime. Wave 1 wired bridge selection and `init`;
 * later slots added the catalogue and unlock clients; this one adds silent login, and leaves
 * `/config` and deep-link resolution as the remaining continuation, marked below so the order is
 * not reinvented.
 */

/**
 * Silent login is awaited before the first render, because the alternative is a viewer who taps
 * "Unlock" a second after boot and is told to sign in while the login that would have worked is
 * still in flight.
 *
 * It gets a shorter budget than a normal read for the other half of that trade: a misconfigured
 * base URL must not hold the first paint for a full request timeout. Whatever happens, boot
 * continues — the catalogue is anonymous-capable, so a signed-out app still shows content and only
 * refuses to sell.
 */
const SILENT_LOGIN_TIMEOUT_MS = 5_000;

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
   * Two transports, one session store, and the rule that separates them: everything business-facing
   * carries the header, and the login exchange cannot, because a session cannot be created by
   * presenting one (`data/transports.ts`).
   *
   * A missing base URL is left to fail as a request rather than throwing here: a boot that dies
   * because an environment variable is absent is a white screen, and the retryable error state is
   * a screen with a button on it.
   */
  const session = createSessionStore();
  const transports = createTransports({
    baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
    fetch: (url, init) => fetch(url, init),
    session,
    loginTimeoutMs: SILENT_LOGIN_TIMEOUT_MS,
  });
  const signIn = createSilentLogin({
    bridge,
    api: createSessionApi(transports.login),
    store: session,
  });
  const signedIn = await signIn();
  if (signedIn.outcome !== 'SIGNED_IN') {
    // The outcome and nothing else. The `authCode` and the token are credentials, and a console in
    // a WebView is not a private place (`contracts/openapi.yaml`: never logged, never echoed).
    console.warn('[boot] no session was established', signedIn.outcome);
  }

  /**
   * The catalogue reads are anonymous-capable (`docs/12-api-contracts.md` §2.2), so they render
   * whether or not the login above produced anything.
   */
  const api = createCatalogApi(transports.http);

  /**
   * The unlock orders share that transport, deliberately: the timeout, the failure classification
   * and the `Authorization` header all belong in one place. They do not share a client interface,
   * because a coin order is a write against an account and a catalogue read is not.
   *
   * It is provided unconditionally rather than behind a capability check. Whether a purchase can
   * be *made* is `bridge.canIUse('pay')`, asked per render at the surface that offers one; a
   * missing provider here would only turn that question into a crash.
   */
  const unlockApi = createUnlockApi(transports.http);

  document.documentElement.lang = DEFAULT_LOCALE;
  document.documentElement.dir = isRtl(DEFAULT_LOCALE) ? 'rtl' : 'ltr';

  createRoot(container).render(
    <StrictMode>
      <CatalogApiProvider api={api}>
        <UnlockApiProvider api={unlockApi}>
          <HashRouter>
            <App bridge={bridge} />
          </HashRouter>
        </UnlockApiProvider>
      </CatalogApiProvider>
    </StrictMode>,
  );
}

void boot();
