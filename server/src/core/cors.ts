import { decideCors } from './origin-policy.js';
import { errorBody } from './errors.js';
import type { CorsHeaders, CorsPolicy } from './origin-policy.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Cross-origin access control, applied before anything else runs.
 *
 * The rules live in `origin-policy.ts`. This file does three things with them, and each one is a
 * property worth stating:
 *
 *   - **it runs in `onRequest`,** which is before routing, before body parsing and before every
 *     route's own checks. A refused origin therefore never reaches a handler, never has its body
 *     read and cannot tell an existing path from an absent one;
 *   - **it answers the preflight itself.** No route declares `OPTIONS`, so without this the browser
 *     would receive the 404 handler's envelope and report a CORS failure that looks like a missing
 *     endpoint;
 *   - **it never sends `Access-Control-Allow-Credentials`.** Sessions here are a bearer token the
 *     client attaches deliberately (`docs/12-api-contracts.md` §3), not a cookie the browser
 *     attaches for it. Allowing credentials would opt this API into ambient authority it does not
 *     use, and it is the header that turns an allowlist mistake into account takeover.
 *
 * The hook is added to the root instance rather than registered as a plugin on purpose: Fastify
 * encapsulates hooks by scope, so a `register`ed one would guard only its own children — which is
 * every module that had not been written yet.
 */

export function registerCors(app: FastifyInstance, policy: CorsPolicy): void {
  if (policy.allowedOrigins.length === 0) {
    // Not an error: a server with no browser clients is a valid deployment, and so is one whose
    // allowlist has not been filled in yet. It is a warning because the second one looks exactly
    // like the first from the outside, and the symptom lands on the client.
    app.log.warn(
      'no browser origin is allowed — every cross-origin request will be refused (set CORS_ALLOWED_ORIGINS)',
    );
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const verdict = decideCors(policy, {
      method: request.method,
      origin: request.headers.origin,
      requestMethod: request.headers['access-control-request-method'],
      requestHeaders: request.headers['access-control-request-headers'],
      selfOrigin: selfOrigin(request),
    });

    // On every response, including the refusals and the requests that carried no origin at all.
    // The answer depends on `Origin`, so a cache that does not know that will serve one origin's
    // response to another.
    appendVaryOrigin(reply);

    switch (verdict.kind) {
      case 'NOT_CROSS_ORIGIN':
        return;

      case 'ALLOWED':
        setHeaders(reply, verdict);
        return;

      case 'PREFLIGHT_ALLOWED':
        setHeaders(reply, verdict);
        // 204 and no body: there is nothing for the browser to read here, and the request it is
        // asking about has not happened yet.
        return reply.status(204).send();

      case 'DENIED':
        request.log.warn(
          { reason: verdict.reason, origin: verdict.origin, preflight: verdict.preflight },
          'cross-origin request refused',
        );
        // No `Access-Control-*` header on a refusal. The browser blocking the response is the
        // point, and the status is the same for every reason so the endpoint cannot be used to
        // enumerate what a different origin would have been allowed to do.
        return reply
          .status(403)
          .send(errorBody('COMMON_ORIGIN_NOT_ALLOWED', 'Origin is not allowed', request.id));
    }
  });
}

function setHeaders(reply: FastifyReply, verdict: { readonly headers: CorsHeaders }): void {
  for (const [name, value] of Object.entries(verdict.headers)) {
    reply.header(name, value);
  }
}

/**
 * This server's own origin, as a browser would write it.
 *
 * Both parts come from the request Fastify actually received: behind a TLS terminator that is
 * `http` and the internal host, which will not equal a public `Origin` — so the comparison fails
 * and the allowlist decides instead. That is the safe direction for this to be wrong in.
 */
function selfOrigin(request: FastifyRequest): string | null {
  const host = request.headers.host;
  if (typeof host !== 'string' || host === '') return null;

  return `${request.protocol}://${host}`;
}

function appendVaryOrigin(reply: FastifyReply): void {
  const existing = reply.getHeader('vary');

  if (existing === undefined) {
    reply.header('vary', 'Origin');
    return;
  }

  const values = Array.isArray(existing) ? existing.join(', ') : String(existing);
  if (
    values
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .includes('origin')
  ) {
    return;
  }

  reply.header('vary', `${values}, Origin`);
}
