import { resolve } from 'node:path';

import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';

import { catalogRoutes } from './modules/catalog/routes.js';
import { createAnonymousViewerResolver } from './modules/catalog/viewer.js';
import { createCatalogDramaSummaryLookup } from './modules/catalog/summary-lookup.js';
import { createEmptyContinueWatchingSource } from './modules/discovery/feed.js';
import { createGrantedUnlockFactsPort } from './modules/unlock/granted-facts.js';
import { createInMemoryCatalogStore } from './modules/catalog/store.js';
import { createSqliteCatalogStore } from './modules/catalog/sqlite-catalog-store.js';
import { createInMemoryFavoritesStore } from './modules/search/favorites.js';
import { createSqliteFavoritesStore } from './modules/search/sqlite-favorites-store.js';
import { createInMemorySessionStore } from './modules/identity/session-store.js';
import { createSqliteSessionStore } from './modules/identity/sqlite-session-store.js';
import { createInMemoryUnlockOrderStore } from './modules/unlock/order-store.js';
import { createSqliteUnlockOrderStore } from './modules/unlock/sqlite-order-store.js';
import { createInMemoryUnlockStore } from './modules/unlock/unlock-store.js';
import { createSqliteUnlockStore } from './modules/unlock/sqlite-unlock-store.js';
import { createInMemoryWatchProgressStore } from './modules/progress/store.js';
import { createSqliteWatchProgressStore } from './modules/progress/sqlite-watch-progress-store.js';
import { databaseNotWiredMessage } from './db/database-url.js';
import { openMigratedSqlite } from './db/migrate.js';
import { createInMemoryWebhookEventStore } from './modules/platform-tiktok/event-store.js';
import { createSqliteWebhookEventStore } from './modules/platform-tiktok/sqlite-event-store.js';
import { createMockIdentityPort } from './modules/identity/test-login.js';
import { createCatalogDramaDirectory } from './modules/search/dramas.js';
import { createSessionViewerResolver } from './modules/identity/session-viewer-resolver.js';
import { createSignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
import { createTiktokIdentityPort } from './modules/platform-tiktok/identity-port.js';
import { createUnavailableEntitlementFactsPort } from './modules/entitlement/facts-port.js';
import { createUnavailablePlaybackMediaPort } from './modules/playback/media-port.js';
import { createUnavailableTradeOrderPort } from './modules/unlock/trade-order-port.js';
import { createUnavailableWalletBalancePort } from './modules/wallet/balance-port.js';
import { createCatalogDramaProgressPort } from './modules/catalog/drama-progress-lookup.js';
import { createUnavailableWatchHistoryCatalogPort } from './modules/progress/catalog-port.js';
import { createUnlockOrderPaymentSink } from './modules/unlock/payment-sink.js';
import { createCorsPolicy } from './core/origin-policy.js';
import { createLoggerOptions, generateRequestId, registerRequestId } from './core/logging.js';
import { discoveryRoutes } from './modules/discovery/routes.js';
import { entitlementRoutes } from './modules/entitlement/routes.js';
import { errorBody } from './core/errors.js';
import { healthRoutes } from './modules/health/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { meRoutes } from './modules/identity/me-routes.js';
import { loadConfig } from './config.js';
import { loadPlatformCredentials } from './modules/platform-tiktok/credentials.js';
import { platformTiktokRoutes } from './modules/platform-tiktok/routes.js';
import { playbackRoutes } from './modules/playback/routes.js';
import { progressRoutes } from './modules/progress/routes.js';
import { registerCors } from './core/cors.js';
import { searchRoutes } from './modules/search/routes.js';
import { adUnlockRoutes } from './modules/unlock/ad-routes.js';
import { createInMemoryAdUnlockSessionStore } from './modules/unlock/ad-session-store.js';
import { createSqliteAdUnlockSessionStore } from './modules/unlock/sqlite-ad-session-store.js';
import { createInMemoryAdRewardLogStore } from './modules/unlock/ad-reward-log.js';
import { createSqliteAdRewardLogStore } from './modules/unlock/sqlite-ad-reward-log-store.js';
import { createReportedCompletionVerifier } from './modules/unlock/ad-completion.js';
import { unlockRoutes } from './modules/unlock/routes.js';
import { walletRoutes } from './modules/wallet/routes.js';
import { dramaProgressRoutes } from './modules/progress/drama-routes.js';
import { watchHistoryRoutes } from './modules/progress/history-routes.js';
import type { CatalogStore } from './modules/catalog/store.js';
// Aliased because the entitlement module publishes an interface of the same name that answers a
// different question: it maps an `Authorization` header to a viewer id, where this one maps a
// request to the viewer's unlocks and VIP state. Both are wired below, one per lineage.
import type { ViewerResolver as CatalogViewerResolver } from './modules/catalog/viewer.js';
import type { ContinueWatchingSource } from './modules/discovery/feed.js';
import type { DramaDirectory } from './modules/search/dramas.js';
import type { EntitlementFactsPort } from './modules/entitlement/facts-port.js';
import type { FavoritesStore } from './modules/search/favorites.js';
import type { PlatformCredentials } from './modules/platform-tiktok/credentials.js';
import type {
  IdentityHttpClient,
  PlatformIdentityPort,
} from './modules/platform-tiktok/identity-port.js';
import type { PlatformTradeOrderPort } from './modules/unlock/trade-order-port.js';
import type { PlaybackMediaPort } from './modules/playback/media-port.js';
import type { ServerConfig } from './config.js';
import type { SqliteDatabase } from './db/sqlite.js';
import type { SessionStore } from './modules/identity/session-store.js';
import type { SignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
import type { AdCompletionVerifier } from './modules/unlock/ad-completion.js';
import type { AdRewardLogStore } from './modules/unlock/ad-reward-log.js';
import type { AdUnlockPolicy } from './modules/unlock/ad-unlock-policy.js';
import type { AdUnlockSessionStore } from './modules/unlock/ad-session-store.js';
import type { UnlockOrderStore } from './modules/unlock/order-store.js';
import type { UnlockStore } from './modules/unlock/unlock-store.js';
import type { ViewerResolver } from './modules/entitlement/viewer-resolver.js';
import type { WalletBalancePort } from './modules/wallet/balance-port.js';
import type { DramaProgressCatalogPort } from './modules/progress/drama-catalog-port.js';
import type { WatchHistoryCatalogPort } from './modules/progress/catalog-port.js';
import type { WatchProgressStore } from './modules/progress/store.js';
import type { WebhookEventStore } from './modules/platform-tiktok/event-store.js';
import type { LogDestination } from './core/logging.js';

/**
 * The modular monolith, assembled.
 *
 * Modules are registered as Fastify plugins so the boundaries are real at the framework level:
 * a module owns its routes and its decorators, and cross-module access goes through published
 * interfaces rather than shared tables (`docs/architecture/system-overview.md` §7.1).
 */

/**
 * Constructed dependencies, injectable for tests.
 *
 * The webhook verifier needs a known signing key and a controllable clock to be testable at all —
 * the alternative is a verification bypass that only tests use, which is how fail-closed designs
 * quietly stop being fail-closed. Every field defaults to the real implementation.
 */
export interface AppDependencies {
  readonly platformCredentials?: PlatformCredentials;
  readonly signatureVerifier?: SignatureVerifier;
  /**
   * Inbound platform webhook events, stored before verification. Injected by tests that need to
   * read the records back. The default is SQLite when `DATABASE_URL=sqlite:<path>` (the same file
   * as unlock receipts, sessions, coin unlock orders, watch progress, favourites, and the
   * catalogue), and the in-memory skeleton otherwise; a postgres URL is refused rather than
   * rewritten to a file.
   */
  readonly webhookEventStore?: WebhookEventStore;
  readonly identityPort?: PlatformIdentityPort;
  /**
   * The HTTP seam behind `createTiktokIdentityPort`. Tests inject a stub so login never calls
   * `open.tiktokapis.com`. Uninjected, the port uses `fetch`. Ignored when `identityPort` is set
   * or when mock login is enabled.
   */
  readonly identityHttp?: IdentityHttpClient;
  /**
   * Sessions. Injected by tests that need to mint one for a known user without going through a
   * platform exchange — which is the supported way to log in during a test, and needs no flag,
   * because it is reachable from a test process and from nowhere else. Uninjected, the default is
   * SQLite when `DATABASE_URL=sqlite:<path>` (the same file as unlock receipts, webhook events,
   * coin unlock orders, watch progress, and favourites), and the in-memory map otherwise.
   */
  readonly sessionStore?: SessionStore;
  /**
   * The storefront's content source, and how a catalogue request becomes a viewer. The resolver
   * defaults to the anonymous one, which owns no unlocks and no VIP, so an unwired deployment
   * reports every paid episode as needing an unlock rather than giving it away. Uninjected, the
   * default is SQLite when `DATABASE_URL=sqlite:<path>` (the same file as unlock receipts,
   * sessions, webhook events, coin unlock orders, watch progress, and favourites), and the
   * in-memory seed otherwise; a postgres URL is refused rather than rewritten to a file.
   */
  readonly catalogStore?: CatalogStore;
  readonly catalogViewerResolver?: CatalogViewerResolver;
  /**
   * The rows the recommendation feed's "continue watching" rail is built from. Empty by default:
   * the feed is assembled from the catalogue, and a rail invented for a viewer nobody resolved is
   * worse than an absent one.
   */
  readonly continueWatching?: ContinueWatchingSource;
  /**
   * Entitlement reads content and viewer state. The facts port defaults to refusing until the data
   * layer exists, so a deployment cannot serve invented entitlements by omission. The viewer
   * resolver defaults to the session store above rather than to a refusal.
   */
  readonly entitlementFactsPort?: EntitlementFactsPort;
  readonly viewerResolver?: ViewerResolver;
  /**
   * Playback reads the same entitlement facts and, only once they permit it, the media asset.
   * The default refuses too, so an unwired deployment cannot hand out a video id.
   */
  readonly playbackMediaPort?: PlaybackMediaPort;
  /**
   * Coin unlock orders. Injected by tests that need to read them back. The default is SQLite when
   * `DATABASE_URL=sqlite:<path>` (the same file as unlock receipts, sessions, webhook events,
   * watch progress, and favourites), and the in-memory skeleton otherwise; a postgres URL is
   * refused rather than rewritten to a file. The trade-order port defaults to refusing, because an
   * order carrying an identifier the platform never minted is an order no payment can be matched to.
   */
  readonly unlockOrderStore?: UnlockOrderStore;
  /**
   * The unlock records a verified payment writes — what a viewer owns. Injected by tests that need
   * to read the receipts back. The default is SQLite when `DATABASE_URL=sqlite:<path>` (the same
   * file as sessions, webhook events, coin unlock orders, watch progress, and favourites), and the
   * in-memory skeleton otherwise; a postgres URL is refused rather than rewritten to a file.
   */
  readonly unlockStore?: UnlockStore;
  /**
   * Ad unlock sessions and the reward log. Injected by tests that need to read them back or to
   * refuse a showing the client claimed. The default verifier trusts `isEnded === true` and
   * nothing else (U-18: there is no platform SSV callback). A wrapper that grants without the
   * verifier is the C4-08 regression.
   */
  readonly adUnlockSessionStore?: AdUnlockSessionStore;
  readonly adRewardLogStore?: AdRewardLogStore;
  readonly adCompletionVerifier?: AdCompletionVerifier;
  readonly adUnlockPolicy?: AdUnlockPolicy;
  readonly tradeOrderPort?: PlatformTradeOrderPort;
  /**
   * Coin balance. The default reports `UNAVAILABLE` rather than `0`: there is no platform coin
   * figure and no ledger this process owns, and an invented zero is a wrong balance a viewer who
   * has recharged will not believe (`C3-04`). Beans and fiat are not on this port (`C3-09`).
   */
  readonly walletBalancePort?: WalletBalancePort;
  /**
   * Watch progress. Injected by tests that need to seed rows. The default is SQLite when
   * `DATABASE_URL=sqlite:<path>` (the same file as unlock receipts, sessions, webhook events, coin
   * unlock orders, and favourites), and the in-memory skeleton otherwise; a postgres URL is refused
   * rather than rewritten to a file. The catalogue port defaults to refusing: a history row needs a
   * drama the `catalog` module owns, and inventing one would tell a viewer they had watched
   * something they had not.
   */
  readonly watchProgressStore?: WatchProgressStore;
  readonly watchHistoryCatalogPort?: WatchHistoryCatalogPort;
  /**
   * Episode-to-number mapping for `GET /v1/progress/dramas/{dramaId}`. Defaults to the live
   * catalogue store, the same one the episode list is served from, so a watched mark cannot land
   * on a different cell than the grid. Inject the unavailable port to assert the `503` path.
   */
  readonly dramaProgressCatalogPort?: DramaProgressCatalogPort;
  /**
   * Search and favourites. The favourites store defaults to SQLite when `DATABASE_URL=sqlite:<path>`
   * (the same file as unlock receipts, sessions, webhook events, coin unlock orders, watch progress,
   * and the catalogue), and the in-memory skeleton otherwise; a postgres URL is refused rather than
   * rewritten to a file. The drama directory the two read defaults to the catalogue store above —
   * search is not a second table of titles. Inject a directory to pin search without standing up a
   * catalogue.
   */
  readonly favoritesStore?: FavoritesStore;
  readonly dramaDirectory?: DramaDirectory;
  readonly now?: () => number;
  /**
   * Where JSON log lines go. Unset is stdout, which is what a deployment gets. Tests pass a
   * capture so they can assert the request id in the line and that a secret does not survive it.
   */
  readonly logDestination?: LogDestination;
}

export async function buildApp(
  config: ServerConfig = loadConfig(),
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  if (config.database.kind === 'unwired') {
    throw new Error(databaseNotWiredMessage(config.database.scheme));
  }

  const app = Fastify({
    logger: createLoggerOptions(config.logLevel, dependencies.logDestination),
    // Inbound ids are validated in `generateRequestId` rather than copied from a header as-is.
    requestIdHeader: false,
    genReqId: generateRequestId,
  });

  // Before CORS so a refused origin still carries the id in the header and the error envelope.
  registerRequestId(app);

  const credentials = dependencies.platformCredentials ?? loadPlatformCredentials();
  const now = dependencies.now ?? Date.now;

  const signatureVerifier =
    dependencies.signatureVerifier ??
    createSignatureVerifier({
      credentials,
      toleranceSec: config.webhookToleranceSec,
      now,
    });

  // Before every route, and before the 404 handler below: a request from an origin we do not
  // serve is refused without its path being confirmed and without its body being read. The
  // allowlist is whatever configuration supplied, which by default is nothing.
  for (const rejected of config.corsRejectedOrigins) {
    app.log.warn(
      { origin: rejected.value, reason: rejected.reason },
      'CORS_ALLOWED_ORIGINS entry ignored',
    );
  }
  registerCors(app, createCorsPolicy(config.corsAllowedOrigins));

  app.setNotFoundHandler(async (request, reply) => {
    return reply
      .status(404)
      .send(errorBody('COMMON_RESOURCE_NOT_FOUND', 'No such route', request.id));
  });

  app.setErrorHandler<FastifyError>(async (error, request, reply) => {
    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;

    // Framework-level refusals — payload too large, unsupported media type, unparseable body — are
    // the caller's to fix and must keep their own status. Reporting them as 500 would tell TikTok's
    // webhook sender that delivery failed, and it would come back for 72 hours over a request we
    // had already decided to refuse.
    if (status >= 400 && status < 500) {
      request.log.warn({ err: error, status }, 'request refused');
      return reply
        .status(status)
        .send(
          errorBody(
            status === 429 ? 'COMMON_RATE_LIMITED' : 'COMMON_VALIDATION_FAILED',
            'Request refused',
            request.id,
          ),
        );
    }

    request.log.error({ err: error }, 'unhandled request error');
    // The message is deliberately generic: an internal error message is not a client contract,
    // and it is a reliable way to leak internals.
    return reply.status(500).send(errorBody('COMMON_INTERNAL_ERROR', 'Internal error', request.id));
  });

  // One facts port and one viewer resolver for every module. Playback enforces the decision that
  // entitlement reports, so giving them separate sources of facts is how the browse view and the
  // play attempt start disagreeing about what a viewer owns — and two things resolving sessions is
  // how one endpoint accepts the credential another rejects.
  //
  // The facts are the configured ones plus the unlock records a verified payment wrote. Until the
  // data layer reads both from one database (W7) they live in separate stores, and a payment that
  // wrote a receipt no decision could see would be a purchase that changed nothing — so the join is
  // made here, once, for every module that asks what a viewer owns. It adds facts and decides
  // nothing: a facts port that refuses still refuses, which is what the default deployment does.
  //
  // One sqlite file when DATABASE_URL asks for it: unlock receipts, sessions, webhook events,
  // coin unlock orders, watch progress, favourites, and the catalogue share the connection, so a
  // process restart cannot keep a receipt and drop the storefront by opening two files.
  const durableDb = openSharedSqlite(app, config, dependencies);
  const unlockStore =
    dependencies.unlockStore ??
    (durableDb === undefined ? createInMemoryUnlockStore() : createSqliteUnlockStore(durableDb));
  const entitlementFactsPort = createGrantedUnlockFactsPort(
    dependencies.entitlementFactsPort ?? createUnavailableEntitlementFactsPort(),
    unlockStore,
  );

  // One store issues sessions and resolves them. Separating those was the state this server was in:
  // the login route minted opaque tokens and forgot them, so every per-viewer endpoint refused a
  // session it had just issued.
  //
  // Every module that asks who is calling reads this one resolver: entitlement, playback and the
  // coin-order endpoints below. That matters most for the last of them, because an order is
  // attributed to whatever it resolves to and a payment is later correlated against that same
  // account id — so a second resolver here would not be a wiring inconsistency, it would be a
  // purchase recorded for the wrong viewer.
  const sessionStore =
    dependencies.sessionStore ??
    (durableDb === undefined
      ? createInMemorySessionStore({ now })
      : createSqliteSessionStore(durableDb, { now }));
  const viewerResolver = dependencies.viewerResolver ?? createSessionViewerResolver(sessionStore);

  // The only place the mock exchange can enter the system, and the only gate on it. `identityPort`
  // is otherwise the real `POST /v2/oauth/token/` adapter: no secret is still a refuse, and a
  // missing `open_id` on a 200 is still a refuse — never a synthesised user.
  if (config.testLoginEnabled) {
    app.log.warn(
      'MOCK LOGIN IS ENABLED: /v1/auth/login accepts mock:<userId> codes and issues real sessions. This must never be a production deployment.',
    );
  }
  const identityPort =
    dependencies.identityPort ??
    (config.testLoginEnabled
      ? createMockIdentityPort()
      : createTiktokIdentityPort(
          credentials,
          dependencies.identityHttp === undefined ? {} : { http: dependencies.identityHttp },
        ));

  await app.register(healthRoutes);

  // One catalogue store and one catalogue viewer resolver for the storefront and the feed. The feed
  // is assembled from the same records the drama pages serve, so a second store would let the two
  // disagree about what is published — and a second resolver would let the feed offer an episode
  // the drama page then refuses to play.
  const catalogStore =
    dependencies.catalogStore ??
    (durableDb === undefined ? createInMemoryCatalogStore() : createSqliteCatalogStore(durableDb));
  const catalogViewerResolver =
    dependencies.catalogViewerResolver ?? createAnonymousViewerResolver();
  // One favourites store for the verbs, the list projection, and `DramaDetail.viewer.favorited`.
  // Two stores would let the heart on the drama page disagree with the favourites screen.
  const favoritesStore =
    dependencies.favoritesStore ??
    (durableDb === undefined
      ? createInMemoryFavoritesStore()
      : createSqliteFavoritesStore(durableDb));

  await app.register(catalogRoutes, {
    store: catalogStore,
    viewerResolver: catalogViewerResolver,
    favorites: favoritesStore,
    sessionViewer: viewerResolver,
  });

  await app.register(discoveryRoutes, {
    store: catalogStore,
    viewerResolver: catalogViewerResolver,
    continueWatching: dependencies.continueWatching ?? createEmptyContinueWatchingSource(),
  });

  await app.register(playbackRoutes, {
    factsPort: entitlementFactsPort,
    viewerResolver,
    mediaPort: dependencies.playbackMediaPort ?? createUnavailablePlaybackMediaPort(),
    now,
  });

  await app.register(entitlementRoutes, {
    factsPort: entitlementFactsPort,
    viewerResolver,
    now,
  });

  // One order store for both registrations. The unlock module writes orders and the webhook module
  // is the only thing that may advance one, so handing them separate stores would leave every order
  // `PENDING` forever while both modules looked entirely correct.
  const unlockOrderStore =
    dependencies.unlockOrderStore ??
    (durableDb === undefined
      ? createInMemoryUnlockOrderStore()
      : createSqliteUnlockOrderStore(durableDb));

  await app.register(unlockRoutes, {
    factsPort: entitlementFactsPort,
    viewerResolver,
    orderStore: unlockOrderStore,
    tradeOrderPort: dependencies.tradeOrderPort ?? createUnavailableTradeOrderPort(),
    now,
  });

  const adUnlockSessionStore =
    dependencies.adUnlockSessionStore ??
    (durableDb === undefined
      ? createInMemoryAdUnlockSessionStore()
      : createSqliteAdUnlockSessionStore(durableDb));
  const adRewardLogStore =
    dependencies.adRewardLogStore ??
    (durableDb === undefined
      ? createInMemoryAdRewardLogStore()
      : createSqliteAdRewardLogStore(durableDb));

  await app.register(adUnlockRoutes, {
    factsPort: entitlementFactsPort,
    viewerResolver,
    sessionStore: adUnlockSessionStore,
    logStore: adRewardLogStore,
    unlockStore,
    verifier: dependencies.adCompletionVerifier ?? createReportedCompletionVerifier(),
    ...(dependencies.adUnlockPolicy === undefined ? {} : { policy: dependencies.adUnlockPolicy }),
    now,
  });

  // The same viewer resolver as unlock and progress: two things resolving sessions is how one
  // endpoint accepts the credential another rejects, and a wallet quoted for the wrong viewer is
  // a cross-user leak. The default port omits the figure rather than inventing zero.
  await app.register(walletRoutes, {
    viewerResolver,
    balancePort: dependencies.walletBalancePort ?? createUnavailableWalletBalancePort(),
  });

  // One progress store for both registrations: the per-episode endpoints write the rows the history
  // list reads. Separate stores would leave the history screen permanently empty for a viewer whose
  // player had been reporting positions all along.
  const watchProgressStore =
    dependencies.watchProgressStore ??
    (durableDb === undefined
      ? createInMemoryWatchProgressStore()
      : createSqliteWatchProgressStore(durableDb));

  await app.register(progressRoutes, {
    store: watchProgressStore,
    viewerResolver,
    now,
  });

  await app.register(dramaProgressRoutes, {
    store: watchProgressStore,
    viewerResolver,
    catalogPort:
      dependencies.dramaProgressCatalogPort ?? createCatalogDramaProgressPort(catalogStore),
  });

  await app.register(watchHistoryRoutes, {
    store: watchProgressStore,
    viewerResolver,
    catalogPort: dependencies.watchHistoryCatalogPort ?? createUnavailableWatchHistoryCatalogPort(),
  });

  await app.register(identityRoutes, { identityPort, sessionStore });

  // The same viewer resolver as wallet, progress and favourites: two things resolving sessions
  // is how one endpoint accepts the credential another rejects, and a me quoted for the wrong
  // viewer is a cross-user leak. The body is the session's user id, not an invented VIP card.
  await app.register(meRoutes, { viewerResolver });

  // Search and favourites. `searchRoutes` was `discoveryRoutes` on its own branch and collided by
  // name with the feed above; both are registered here, which is the whole of A2's resolution.
  // Favourites take the same viewer resolver as progress and watch history, because two things
  // resolving sessions is how one endpoint accepts the credential another rejects. Search takes
  // the catalogue store above, not a seed, so a title the drama page serves is the title a query
  // can find — and a bounce that kept the catalogue and dropped search hits cannot happen by
  // opening two files.
  await app.register(searchRoutes, {
    directory: dependencies.dramaDirectory ?? createCatalogDramaDirectory(catalogStore),
    favorites: favoritesStore,
    viewerResolver,
    dramaSummaries: createCatalogDramaSummaryLookup(catalogStore),
    now,
  });

  await app.register(platformTiktokRoutes, {
    signatureVerifier,
    eventStore:
      dependencies.webhookEventStore ??
      (durableDb === undefined
        ? createInMemoryWebhookEventStore()
        : createSqliteWebhookEventStore(durableDb)),
    clientKey: credentials.clientKey,
    // Fulfilment stays here, on the verified callback: it records the payment against the order and
    // then writes the unlock record the entitlement decision reads. Both stores go to the sink,
    // because both writes belong to one payment — and they are the same two instances the
    // entitlement facts and the order endpoints read, or a viewer would pay for a receipt nobody
    // can see.
    paidTradeOrders: createUnlockOrderPaymentSink({ orderStore: unlockOrderStore, unlockStore }),
    now,
  });

  return app;
}

function openSharedSqlite(
  app: FastifyInstance,
  config: ServerConfig,
  dependencies: AppDependencies,
): SqliteDatabase | undefined {
  if (config.database.kind !== 'sqlite') return undefined;
  if (
    dependencies.unlockStore !== undefined &&
    dependencies.sessionStore !== undefined &&
    dependencies.webhookEventStore !== undefined &&
    dependencies.unlockOrderStore !== undefined &&
    dependencies.watchProgressStore !== undefined &&
    dependencies.favoritesStore !== undefined &&
    dependencies.catalogStore !== undefined
  ) {
    return undefined;
  }

  const path = config.database.path === ':memory:' ? ':memory:' : resolve(config.database.path);
  const db = openMigratedSqlite(path);
  app.addHook('onClose', async () => {
    db.close();
  });
  app.log.info(
    { path },
    'unlock receipts, sessions, webhook events, coin unlock orders, watch progress, favourites, the catalogue, and ad-unlock sessions persist in sqlite',
  );
  return db;
}
