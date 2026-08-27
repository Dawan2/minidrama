import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';

import { createInMemorySessionStore } from './modules/identity/session-store.js';
import { createInMemoryUnlockOrderStore } from './modules/unlock/order-store.js';
import { createInMemoryWebhookEventStore } from './modules/platform-tiktok/event-store.js';
import { createMockIdentityPort } from './modules/identity/test-login.js';
import { createSessionViewerResolver } from './modules/identity/session-viewer-resolver.js';
import { createSignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
import { createTiktokIdentityPort } from './modules/platform-tiktok/identity-port.js';
import { createUnavailableEntitlementFactsPort } from './modules/entitlement/facts-port.js';
import { createUnavailablePlaybackMediaPort } from './modules/playback/media-port.js';
import { createUnavailableTradeOrderPort } from './modules/unlock/trade-order-port.js';
import { createUnlockOrderPaymentSink } from './modules/unlock/payment-sink.js';
import { entitlementRoutes } from './modules/entitlement/routes.js';
import { errorBody } from './core/errors.js';
import { healthRoutes } from './modules/health/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { loadConfig } from './config.js';
import { loadPlatformCredentials } from './modules/platform-tiktok/credentials.js';
import { platformTiktokRoutes } from './modules/platform-tiktok/routes.js';
import { playbackRoutes } from './modules/playback/routes.js';
import { unlockRoutes } from './modules/unlock/routes.js';
import type { EntitlementFactsPort } from './modules/entitlement/facts-port.js';
import type { PlatformCredentials } from './modules/platform-tiktok/credentials.js';
import type { PlatformIdentityPort } from './modules/platform-tiktok/identity-port.js';
import type { PlatformTradeOrderPort } from './modules/unlock/trade-order-port.js';
import type { PlaybackMediaPort } from './modules/playback/media-port.js';
import type { ServerConfig } from './config.js';
import type { SessionStore } from './modules/identity/session-store.js';
import type { SignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
import type { UnlockOrderStore } from './modules/unlock/order-store.js';
import type { ViewerResolver } from './modules/entitlement/viewer-resolver.js';
import type { WebhookEventStore } from './modules/platform-tiktok/event-store.js';

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
  readonly webhookEventStore?: WebhookEventStore;
  readonly identityPort?: PlatformIdentityPort;
  /**
   * Sessions. Injected by tests that need to mint one for a known user without going through a
   * platform exchange — which is the supported way to log in during a test, and needs no flag,
   * because it is reachable from a test process and from nowhere else.
   */
  readonly sessionStore?: SessionStore;
  /**
   * Entitlement reads content and viewer state. The facts port defaults to refusing until the data
   * layer exists, so a deployment cannot serve invented entitlements by omission. The viewer
   * resolver now defaults to the session store above rather than to a refusal.
   */
  readonly entitlementFactsPort?: EntitlementFactsPort;
  readonly viewerResolver?: ViewerResolver;
  /**
   * Playback reads the same entitlement facts and, only once they permit it, the media asset.
   * The default refuses too, so an unwired deployment cannot hand out a video id.
   */
  readonly playbackMediaPort?: PlaybackMediaPort;
  /**
   * Coin unlock orders. The store defaults to the in-memory skeleton; the trade-order port defaults
   * to refusing, because an order carrying an identifier the platform never minted is an order no
   * payment can be matched to.
   */
  readonly unlockOrderStore?: UnlockOrderStore;
  readonly tradeOrderPort?: PlatformTradeOrderPort;
  readonly now?: () => number;
}

export async function buildApp(
  config: ServerConfig = loadConfig(),
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    // Fastify's request id is the trace id we echo to clients until OpenTelemetry lands in W2.
    genReqId: () => `req_${Math.random().toString(36).slice(2, 12)}`,
  });

  const credentials = dependencies.platformCredentials ?? loadPlatformCredentials();
  const now = dependencies.now ?? Date.now;

  const signatureVerifier =
    dependencies.signatureVerifier ??
    createSignatureVerifier({
      credentials,
      toleranceSec: config.webhookToleranceSec,
      now,
    });

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

  // One facts port and one viewer resolver for both modules. Playback enforces the decision that
  // entitlement reports, so giving them separate sources of facts is how the browse view and the
  // play attempt start disagreeing about what a viewer owns.
  const entitlementFactsPort =
    dependencies.entitlementFactsPort ?? createUnavailableEntitlementFactsPort();

  // One store, read by the resolver and written by the login route. Two instances here would be an
  // app that issues sessions it cannot resolve — the state W3 slot L found the server in.
  //
  // Every module that asks who is calling reads this one resolver: entitlement, playback and the
  // coin-order endpoints below. That matters most for the last of them, because an order is
  // attributed to whatever it resolves to and a payment is later correlated against that same
  // account id — so a second resolver here would not be a wiring inconsistency, it would be a
  // purchase recorded for the wrong viewer.
  const sessionStore = dependencies.sessionStore ?? createInMemorySessionStore({ now });
  const viewerResolver = dependencies.viewerResolver ?? createSessionViewerResolver(sessionStore);

  // The only place the mock exchange can enter the system, and the only gate on it. `identityPort`
  // is otherwise the real port, which refuses every code until the HTTP exchange lands.
  if (config.testLoginEnabled) {
    app.log.warn(
      'MOCK LOGIN IS ENABLED: /v1/auth/login accepts mock:<userId> codes and issues real sessions. This must never be a production deployment.',
    );
  }
  const identityPort =
    dependencies.identityPort ??
    (config.testLoginEnabled ? createMockIdentityPort() : createTiktokIdentityPort(credentials));

  await app.register(healthRoutes);

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
  const unlockOrderStore = dependencies.unlockOrderStore ?? createInMemoryUnlockOrderStore();

  await app.register(unlockRoutes, {
    factsPort: entitlementFactsPort,
    viewerResolver,
    orderStore: unlockOrderStore,
    tradeOrderPort: dependencies.tradeOrderPort ?? createUnavailableTradeOrderPort(),
    now,
  });

  await app.register(identityRoutes, { identityPort, sessionStore });

  await app.register(platformTiktokRoutes, {
    signatureVerifier,
    eventStore: dependencies.webhookEventStore ?? createInMemoryWebhookEventStore(),
    clientKey: credentials.clientKey,
    // Fulfilment stays here, on the verified callback. It records the payment against the order and
    // grants nothing: the unlock row is W14's, and until it exists a paid order is a paid order.
    paidTradeOrders: createUnlockOrderPaymentSink(unlockOrderStore),
    now,
  });

  return app;
}
