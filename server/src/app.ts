import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';

import { createInMemoryWebhookEventStore } from './modules/platform-tiktok/event-store.js';
import { createSessionIssuer } from './modules/identity/session.js';
import { createSignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
import { createTiktokIdentityPort } from './modules/platform-tiktok/identity-port.js';
import { createUnavailableEntitlementFactsPort } from './modules/entitlement/facts-port.js';
import { createUnresolvedViewerResolver } from './modules/entitlement/viewer-resolver.js';
import { entitlementRoutes } from './modules/entitlement/routes.js';
import { errorBody } from './core/errors.js';
import { healthRoutes } from './modules/health/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { loadConfig } from './config.js';
import { loadPlatformCredentials } from './modules/platform-tiktok/credentials.js';
import { platformTiktokRoutes } from './modules/platform-tiktok/routes.js';
import { playbackRoutes } from './modules/playback/routes.js';
import type { EntitlementFactsPort } from './modules/entitlement/facts-port.js';
import type { PlatformCredentials } from './modules/platform-tiktok/credentials.js';
import type { PlatformIdentityPort } from './modules/platform-tiktok/identity-port.js';
import type { ServerConfig } from './config.js';
import type { SessionIssuer } from './modules/identity/session.js';
import type { SignatureVerifier } from './modules/platform-tiktok/signature-verifier.js';
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
  readonly sessionIssuer?: SessionIssuer;
  /**
   * Entitlement reads content and viewer state. Both defaults refuse until the data layer and
   * session storage exist, so a deployment cannot serve invented entitlements by omission.
   */
  readonly entitlementFactsPort?: EntitlementFactsPort;
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

  await app.register(entitlementRoutes, {
    factsPort: dependencies.entitlementFactsPort ?? createUnavailableEntitlementFactsPort(),
    viewerResolver: dependencies.viewerResolver ?? createUnresolvedViewerResolver(),
    now,
  });

  await app.register(identityRoutes, {
    identityPort: dependencies.identityPort ?? createTiktokIdentityPort(credentials),
    sessionIssuer: dependencies.sessionIssuer ?? createSessionIssuer(),
  });

  await app.register(platformTiktokRoutes, {
    signatureVerifier,
    eventStore: dependencies.webhookEventStore ?? createInMemoryWebhookEventStore(),
    clientKey: credentials.clientKey,
    now,
  });

  return app;
}
