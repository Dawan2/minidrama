import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';

import './styles/app.css';
import { App } from './App';
import { CatalogApiProvider } from './data/catalog-api-context';
import { createBridge } from './platform/create-bridge';
import { createCatalogApi } from './data/catalog-api';
import { createHttpClient } from './data/http';
import { createSessionApi } from './data/session-api';
import { createSessionStore } from './session/session-store';
import { createSilentLogin } from './session/silent-login';
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

  const baseUrl = import.meta.env['VITE_API_BASE_URL'] ?? '';
  const session = createSessionStore();

  /**
   * The transport every business call goes through.
   *
   * The token is handed over as a function rather than a value: it does not exist yet at this line,
   * and after login it can be dropped at any moment. `onCredentialRefused` is the drop — a token
   * the server answered `401` to is dead, and resending it for the rest of the app's life would
   * turn one expiry into a permanently broken purchase button.
   *
   * A missing base URL is left to fail as a request rather than throwing here: a boot that dies
   * because an environment variable is absent is a white screen, and the retryable error state is
   * a screen with a button on it.
   */
  const http = createHttpClient({
    baseUrl,
    fetch: (url, init) => fetch(url, init),
    authToken: () => session.bearerToken(),
    onCredentialRefused: () => {
      session.clear();
    },
  });

  /**
   * The login exchange gets its own transport, built without a token source, because a session
   * cannot be created by presenting one. Constructing a second client is the cheap way to say that
   * — the alternative is a per-request "skip the header" flag, which is an opt-out every other call
   * site would also get.
   */
  const sessionApi = createSessionApi(
    createHttpClient({
      baseUrl,
      fetch: (url, init) => fetch(url, init),
      timeoutMs: SILENT_LOGIN_TIMEOUT_MS,
    }),
  );

  const signIn = createSilentLogin({ bridge, api: sessionApi, store: session });
  const signedIn = await signIn();
  if (signedIn.outcome !== 'SIGNED_IN') {
    // The outcome and nothing else. The `authCode` and the token are credentials, and a console in
    // a WebView is not a private place (`contracts/openapi.yaml`: never logged, never echoed).
    console.warn('[boot] no session was established', signedIn.outcome);
  }

  /**
   * The catalogue reads are anonymous-capable (`docs/12-api-contracts.md` §2.2) and stay that way:
   * they are constructed over the same transport, so they carry the header when a session exists
   * and work without one when it does not.
   */
  const api = createCatalogApi(http);

  /**
   * The unlock orders share the transport with the catalogue, deliberately: the timeout, the
   * failure classification and the `Authorization` header all belong in one place. They do not
   * share a client interface, because a coin order is a write against an account and the catalogue
   * reads are anonymous.
   *
   * It is provided unconditionally rather than behind a capability check. Whether a purchase can
   * be *made* is `bridge.canIUse('pay')`, asked per render at the surface that offers one; a
   * missing provider here would only turn that question into a crash.
   */
  const unlockApi = createUnlockApi(http);

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
