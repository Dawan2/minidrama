import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';

import { createInMemoryFavoritesStore } from './modules/discovery/favorites.js';
import { createInMemoryWatchProgressStore } from './modules/progress/store.js';
import { createInMemoryWebhookEventStore } from './modules/platform-tiktok/event-store.js';
import { createSeedDramaDirectory } from './modules/discovery/dramas.js';
import { createSessionIssuer } from './modules/identity/session.js';
import { createSignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
import { createTiktokIdentityPort } from './modules/platform-tiktok/identity-port.js';
import { createUnverifiableSessionResolver } from './modules/progress/viewer.js';
import { discoveryRoutes } from './modules/discovery/routes.js';
import { errorBody } from './core/errors.js';
import { healthRoutes } from './modules/health/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { loadConfig } from './config.js';
import { loadPlatformCredentials } from './modules/platform-tiktok/credentials.js';
import { platformTiktokRoutes } from './modules/platform-tiktok/routes.js';
import { playbackRoutes } from './modules/playback/routes.js';
import { progressRoutes } from './modules/progress/routes.js';
import type { DramaDirectory } from './modules/discovery/dramas.js';
import type { FavoritesStore } from './modules/discovery/favorites.js';
import type { PlatformCredentials } from './modules/platform-tiktok/credentials.js';
import type { PlatformIdentityPort } from './modules/platform-tiktok/identity-port.js';
import type { ServerConfig } from './config.js';
import type { SessionIssuer } from './modules/identity/session.js';
import type { SignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
import type { ViewerResolver } from './modules/progress/viewer.js';
import type { WatchProgressStore } from './modules/progress/store.js';
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
  readonly sessionIssuer?: SessionIssuer;
  readonly watchProgressStore?: WatchProgressStore;
  readonly favoritesStore?: FavoritesStore;
  /**
   * The dramas search and favourites can see. The default is a seed: there is no catalogue module on
   * this branch, and `modules/discovery/dramas.ts` explains why the seam is a port rather than an
   * invented catalogue.
   */
  readonly dramaDirectory?: DramaDirectory;
  /**
   * Turns a session token into a viewer. The default refuses every request, because this deployment
   * cannot verify a session yet — see `modules/progress/viewer.ts`. Tests that need an authenticated
   * viewer inject one here, which is the same shape as every other unbuilt boundary in this file.
   */
  readonly viewerResolver?: ViewerResolver;
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

  await app.register(healthRoutes);
  await app.register(playbackRoutes);

  await app.register(identityRoutes, {
    identityPort: dependencies.identityPort ?? createTiktokIdentityPort(credentials),
    sessionIssuer: dependencies.sessionIssuer ?? createSessionIssuer(),
  });

  await app.register(progressRoutes, {
    store: dependencies.watchProgressStore ?? createInMemoryWatchProgressStore(),
    viewerResolver: dependencies.viewerResolver ?? createUnverifiableSessionResolver(),
    now,
  });

  await app.register(discoveryRoutes, {
    directory: dependencies.dramaDirectory ?? createSeedDramaDirectory(),
    favorites: dependencies.favoritesStore ?? createInMemoryFavoritesStore(),
    // The same seam watch progress owns, on that slot's instruction: one viewer resolver for the
    // server, refusing by default, rather than one per module.
    viewerResolver: dependencies.viewerResolver ?? createUnverifiableSessionResolver(),
    now,
  });

  await app.register(platformTiktokRoutes, {
    signatureVerifier,
    eventStore: dependencies.webhookEventStore ?? createInMemoryWebhookEventStore(),
    clientKey: credentials.clientKey,
    now,
  });

  return app;
}
