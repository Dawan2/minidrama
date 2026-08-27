import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';

import './styles/app.css';
import { ANONYMOUS } from './auth/session';
import { App } from './App';
import { CatalogApiProvider } from './data/catalog-api-context';
import { createBridge } from './platform/create-bridge';
import { createCatalogApi } from './data/catalog-api';
import { createFavoritesApi } from './data/favorites-api';
import { createHistoryApi } from './data/history-api';
import { createLoginTransport, createSessionTransport } from './data/transports';
import { createSearchApi } from './data/search-api';
import { createSessionApi } from './data/session-api';
import { createSessionRecovery } from './session/session-recovery';
import { createSessionStore } from './session/session-store';
import { createSilentLogin } from './session/silent-login';
import { createUnlockApi } from './data/unlock-api';
import { createPlaybackApi } from './data/playback-api';
import { createProgressApi } from './data/progress-api';
import { createWalletApi } from './data/wallet-api';
import { FavoritesApiProvider } from './data/favorites-api-context';
import { HistoryApiProvider } from './data/history-api-context';
import { PlaybackApiProvider } from './data/playback-api-context';
import { ProgressApiProvider } from './data/progress-api-context';
import { SearchApiProvider } from './data/search-api-context';
import { SessionProvider } from './auth/session-context';
import { DEFAULT_LOCALE, isRtl } from './core/i18n';
import { UnlockApiProvider } from './data/unlock-api-context';
import { WalletApiProvider } from './data/wallet-api-context';
import type { FetchLike } from './data/http';
import type { Session } from './auth/session';
import type { SessionStore } from './session/session-store';

/**
 * Boot entry point.
 *
 * The sequence in `docs/architecture/system-overview.md` §3.1 is serial by design: nothing
 * business-facing renders on a half-initialized runtime. Wave 1 wired bridge selection and `init`;
 * later slots added the catalogue and unlock clients, then silent login; this one gives the login a
 * second caller, so a session that dies mid-visit is re-acquired rather than waiting for a cold
 * start. `/config` and deep-link resolution remain the continuation, marked below so the order is
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
   * The order below is the dependency order and it is why these are four calls: the session
   * transport needs to know what to do with a refused token, that answer is a silent login, and a
   * silent login is a `POST` on the anonymous transport built first.
   *
   * A missing base URL is left to fail as a request rather than throwing here: a boot that dies
   * because an environment variable is absent is a white screen, and the retryable error state is
   * a screen with a button on it.
   */
  const baseUrl = import.meta.env['VITE_API_BASE_URL'] ?? '';
  const fetchImpl: FetchLike = (url, init) => fetch(url, init);
  const sessionStore = createSessionStore();
  const signIn = createSilentLogin({
    bridge,
    api: createSessionApi(
      createLoginTransport({ baseUrl, fetch: fetchImpl, timeoutMs: SILENT_LOGIN_TIMEOUT_MS }),
    ),
    store: sessionStore,
  });
  const http = createSessionTransport({
    baseUrl,
    fetch: fetchImpl,
    session: sessionStore,
    recovery: createSessionRecovery({
      signIn,
      // The outcome and nothing else, for the same reason boot logs one: a `SilentLoginResult`
      // carries a trace id and a rejection reason, and a console in a WebView is not a private
      // place.
      onRecovery: (recovered) => {
        console.warn('[session] the server refused the token', recovered.outcome);
      },
    }),
  });

  const signedIn = await signIn();
  if (signedIn.outcome !== 'SIGNED_IN') {
    // The outcome and nothing else. The `authCode` and the token are credentials, and a console in
    // a WebView is not a private place (`contracts/openapi.yaml`: never logged, never echoed).
    console.warn('[boot] no session was established', signedIn.outcome);
  }

  /**
   * One transport, seven API clients. The history, favourites and wallet reads are session-scoped
   * and the catalogue and search reads are not, so they are separate interfaces — but they share the
   * timeout, the single automatic retry, the envelope handling and now the session header, which is
   * the whole reason `http.ts` exists.
   *
   * The catalogue reads are anonymous-*capable* (`docs/12-api-contracts.md` §2.2), so they render
   * whether or not the login above produced anything; they still travel on the shared transport,
   * because a signed-in viewer's reads should say who they are.
   */
  const api = createCatalogApi(http);
  const search = createSearchApi(http);
  const historyApi = createHistoryApi(http);

  /**
   * The two writes share that transport too, deliberately: the timeout, the failure classification
   * and the session header all belong in one place. They do not share a client interface, because
   * `http.ts` splits the transport by capability and each of these asks for only the half it uses —
   * the favourite verbs are idempotent and answer `204`, a coin order is neither.
   *
   * The unlock client is provided unconditionally rather than behind a capability check. Whether a
   * purchase can be *made* is `bridge.canIUse('pay')`, asked per render at the surface that offers
   * one; a missing provider here would only turn that question into a crash.
   */
  const unlockApi = createUnlockApi(http);
  const favoritesApi = createFavoritesApi(http);
  const walletApi = createWalletApi(http);
  const progressApi = createProgressApi(http);
  const playbackApi = createPlaybackApi(http);

  /**
   * The session the surfaces see. This is the seam `auth/session.ts` left for the identity slot,
   * now backed by the real store instead of the anonymous stand-in.
   *
   * `state` reads through to the store on every access rather than being snapshotted at boot. A
   * snapshot would be stale the moment the in-place retry in `SignInPrompt` succeeds — the surface
   * refetches and re-renders, and the profile screen would still call the viewer a guest. Reading
   * through also means an expired token cannot leave a screen claiming a session the transport has
   * already stopped sending.
   */
  const session: Session = {
    get state() {
      return viewerState(sessionStore);
    },
    // "Whether a session now exists" is asked of the store rather than read off the outcome, so
    // `ALREADY_SIGNED_IN` counts as the success it is.
    //
    // This runs the login directly rather than through the recovery, and so is not subject to its
    // budget: the bound exists because an automatic retry has nothing to stop it, and a viewer's tap
    // is the thing that stops this one. It is still the same single-flight login, so a tap that
    // lands while a `401`-driven attempt is running joins it instead of spending a second code.
    signIn: async () => {
      await signIn();
      return sessionStore.session() !== null;
    },
  };

  document.documentElement.lang = DEFAULT_LOCALE;
  document.documentElement.dir = isRtl(DEFAULT_LOCALE) ? 'rtl' : 'ltr';

  createRoot(container).render(
    <StrictMode>
      <SessionProvider session={session}>
        <CatalogApiProvider api={api}>
          <SearchApiProvider api={search}>
            <HistoryApiProvider api={historyApi}>
              <FavoritesApiProvider api={favoritesApi}>
                <UnlockApiProvider api={unlockApi}>
                  <WalletApiProvider api={walletApi}>
                    <ProgressApiProvider api={progressApi}>
                      <PlaybackApiProvider api={playbackApi}>
                        <HashRouter>
                          <App bridge={bridge} />
                        </HashRouter>
                      </PlaybackApiProvider>
                    </ProgressApiProvider>
                  </WalletApiProvider>
                </UnlockApiProvider>
              </FavoritesApiProvider>
            </HistoryApiProvider>
          </SearchApiProvider>
        </CatalogApiProvider>
      </SessionProvider>
    </StrictMode>,
  );
}

/**
 * The store's session, as the state the surfaces are allowed to reason about.
 *
 * `openId` is carried across because it is the account the session belongs to; it decides copy and
 * never access, which is the rule `auth/session.ts` exists to state.
 */
function viewerState(store: SessionStore): Session['state'] {
  const held = store.session();
  return held === null ? ANONYMOUS : { status: 'AUTHENTICATED', openId: held.openId };
}

void boot();
