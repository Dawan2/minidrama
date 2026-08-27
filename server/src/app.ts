import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { errorBody } from './core/errors.js';
import { healthRoutes } from './modules/health/routes.js';
import { loadConfig } from './config.js';
import { playbackRoutes } from './modules/playback/routes.js';
import type { ServerConfig } from './config.js';

/**
 * The modular monolith, assembled.
 *
 * Modules are registered as Fastify plugins so the boundaries are real at the framework level:
 * a module owns its routes and its decorators, and cross-module access goes through published
 * interfaces rather than shared tables (`docs/architecture/system-overview.md` §7.1).
 */
export async function buildApp(config: ServerConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    // Fastify's request id is the trace id we echo to clients until OpenTelemetry lands in W2.
    genReqId: () => `req_${Math.random().toString(36).slice(2, 12)}`,
  });

  app.setNotFoundHandler(async (request, reply) => {
    return reply
      .status(404)
      .send(errorBody('COMMON_RESOURCE_NOT_FOUND', 'No such route', request.id));
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, 'unhandled request error');
    // The message is deliberately generic: an internal error message is not a client contract,
    // and it is a reliable way to leak internals.
    return reply.status(500).send(errorBody('COMMON_INTERNAL_ERROR', 'Internal error', request.id));
  });

  await app.register(healthRoutes);
  await app.register(playbackRoutes);

  return app;
}
